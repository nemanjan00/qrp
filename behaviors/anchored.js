/**
 * behaviors/anchored.js — position a floating element next to a trigger.
 *
 * Minimal JS positioner (fixed placement, flip-on-overflow) for dropdowns,
 * tooltips, popovers. If you target modern browsers, the native Popover API +
 * CSS anchor positioning can replace this — it's here for portability.
 */

import { onDispose } from "../qrp/index.js";

/**
 * Position `floating` relative to `trigger` and keep it there on scroll/resize.
 * The teardown also registers with the current scope (`scope`/`scoped`/`mount`),
 * so disposing the owner detaches the scroll/resize listeners — no need to track
 * the undo by hand. The returned undo is idempotent (safe to also call manually).
 *
 * @param {Element} trigger the anchor element
 * @param {Element} floating the element to position
 * @param {object} [options]
 * @param {("bottom"|"top")} [options.placement] preferred side (default bottom)
 * @param {number} [options.gap] px gap between trigger and floating (default 4)
 * @param {boolean} [options.matchWidth] size floating to the trigger's width
 *   (the common dropdown-spans-its-input case)
 * @returns {Function} dispose (also exposes .update() to reposition manually)
 */
export const anchored = (trigger, floating, options = {}) => {
	const placement = options.placement || "bottom";
	const gap = options.gap === undefined ? 4 : options.gap;

	const update = () => {
		const t = trigger.getBoundingClientRect();

		floating.style.position = "fixed";

		if(options.matchWidth) {
			floating.style.minWidth = t.width + "px";
		}

		const f = floating.getBoundingClientRect();

		let top = placement === "top" ? t.top - f.height - gap : t.bottom + gap;

		// Flip up if it would overflow the bottom and there's room above.
		if(placement !== "top" && top + f.height > window.innerHeight && t.top - f.height - gap > 0) {
			top = t.top - f.height - gap;
		}

		let left = t.left;

		if(left + f.width > window.innerWidth) {
			left = Math.max(0, window.innerWidth - f.width);
		}

		floating.style.top = top + "px";
		floating.style.left = left + "px";
	};

	update();

	window.addEventListener("resize", update);
	window.addEventListener("scroll", update, true);

	let done = false;
	const dispose = () => {
		if(done) {
			return;
		}

		done = true;
		window.removeEventListener("resize", update);
		window.removeEventListener("scroll", update, true);
	};

	dispose.update = update;

	onDispose(dispose);

	return dispose;
};
