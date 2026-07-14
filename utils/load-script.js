/**
 * utils/load-script.js — lazy-load a UMD/global script tag, reactively.
 *
 * Import maps can't express UMD libraries (Chart.js, an in-browser MJML
 * compiler, mustache…), so real zero-build apps still occasionally inject a
 * <script>. This wraps that dance once: it dedups by URL (one tag, one promise),
 * and returns reactive state so a view can render on load without a manual flag.
 *
 *   const chart = loadScript("https://cdn.example/chart.umd.js");
 *   el("div", {}, () => chart.ready ? renderChart() : "loading chart…");
 *   // or await it: await loadScript(url).promise; then use window.Chart
 */

import { state } from "../qrp/index.js";

const cache = new Map();

/**
 * @param {string} url script URL to inject once
 * @param {object} [attrs] extra attributes for the <script> (e.g. { crossorigin: "anonymous" })
 * @returns {{ ready: boolean, error: any, promise: Promise<void> }} reactive load state
 */
export const loadScript = (url, attrs = {}) => {
	if(cache.has(url)) {
		return cache.get(url);
	}

	const status = state({ ready: false, error: null });

	const promise = new Promise((resolve, reject) => {
		const script = document.createElement("script");

		script.src = url;
		script.async = true;

		Object.entries(attrs).forEach(([key, value]) => script.setAttribute(key, value));

		script.onload = () => { status.ready = true; resolve(); };
		script.onerror = () => {
			const error = new Error(`Failed to load script: ${url}`);
			status.error = error;
			cache.delete(url);   // let a later call retry
			reject(error);
		};

		document.head.appendChild(script);
	});

	// expose the promise without making the object thenable (await/return would
	// otherwise auto-unwrap it) or a tracked reactive key
	Object.defineProperty(status, "promise", { value: promise, enumerable: false });

	cache.set(url, status);

	return status;
};
