/**
 * behaviors/embed.js — host an imperative widget (a chart library, a canvas, a
 * map, a terminal) inside qrp-built DOM. Carries the three hard parts every
 * dashboard re-solves: create it only once its host is in the document (so it
 * can measure), tell it when the host resizes, and destroy it with the scope.
 */

import { el, onDispose } from "../qrp/index.js";

/**
 * Build a host element and run `create(host)` once the host is connected to
 * the document (checked each animation frame — `el()` builds children before
 * their parent is attached). `create` may return an instance with optional
 * `resize(width, height)` / `destroy()` methods, or a teardown function.
 * Disposing the enclosing scope (`mount`/`scoped`/a `when` branch) cancels a
 * pending create, disconnects the observer and destroys the instance.
 *
 *   el("div", {}, embed((host) => new uPlot(opts, data, host)))
 *
 * @param {Function} create (host: HTMLElement) => instance | teardown | void
 * @param {object} [options]
 * @param {string} [options.tag] host tag (default "div")
 * @param {object} [options.props] el() props for the host (class, style…)
 * @returns {HTMLElement} the host
 */
export const embed = (create, options = {}) => {
	const host = el(options.tag || "div", options.props || {});
	let instance = null;
	let frame = 0;
	let observer = null;
	let disposed = false;
	let width = -1;
	let height = -1;

	const resize = (box) => {
		// ResizeObserver also reports the initial size: skip unchanged sizes
		if(box.width === width && box.height === height) {
			return;
		}

		width = box.width;
		height = box.height;

		if(instance && typeof instance.resize === "function") {
			instance.resize(width, height);
		}
	};

	const start = () => {
		frame = 0;

		if(disposed) {
			return;
		}

		if(!host.isConnected) {
			frame = requestAnimationFrame(start);
			return;
		}

		const rect = host.getBoundingClientRect();

		width = rect.width;
		height = rect.height;
		instance = create(host) || null;

		if(typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver((entries) => entries.forEach((entry) => resize(entry.contentRect)));
			observer.observe(host);
		}
	};

	onDispose(() => {
		disposed = true;

		if(frame) {
			cancelAnimationFrame(frame);
		}

		if(observer) {
			observer.disconnect();
		}

		if(typeof instance === "function") {
			instance();
		} else if(instance && typeof instance.destroy === "function") {
			instance.destroy();
		}

		instance = null;
	});

	frame = requestAnimationFrame(start);

	return host;
};
