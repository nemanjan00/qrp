/**
 * debounce.js — time-based rate limiters for event-driven UI.
 *
 * `debounce` coalesces bursts (typeahead search: run once the user pauses);
 * `throttle` caps rate (scroll / resize handlers). Both are scope-aware — if
 * created during a component render they auto-cancel their pending timer on
 * dispose, so they don't fire into an unmounted view. Both expose `.cancel()`.
 *
 *   const search = debounce((q) => http.get("/find", { params: { q } }), 300);
 *   el("input", { oninput: (e) => search(e.target.value) });
 */

import { onDispose } from "../qrp/index.js";

/**
 * Delay calling fn until `ms` after the last call.
 * @param {(...args: any[]) => any} fn
 * @param {number} [ms] quiet period in ms (default 200)
 * @returns {((...args: any[]) => void) & { cancel: () => void }}
 */
export const debounce = (fn, ms = 200) => {
	let timer = null;

	const wrapped = (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};

	wrapped.cancel = () => clearTimeout(timer);

	// if created inside a scope, drop the pending timer when it unmounts
	onDispose(wrapped.cancel);

	return wrapped;
};

/**
 * Call fn at most once per `ms` (leading + trailing edge).
 * @param {(...args: any[]) => any} fn
 * @param {number} [ms] minimum gap between calls in ms (default 200)
 * @returns {((...args: any[]) => void) & { cancel: () => void }}
 */
export const throttle = (fn, ms = 200) => {
	let last = 0;
	let timer = null;
	let lastArgs = null;

	const invoke = () => {
		last = Date.now();
		timer = null;
		fn(...lastArgs);
	};

	const wrapped = (...args) => {
		lastArgs = args;

		const remaining = ms - (Date.now() - last);

		if(remaining <= 0) {
			clearTimeout(timer);
			timer = null;
			last = Date.now();
			fn(...args);
		} else if(timer === null) {
			timer = setTimeout(invoke, remaining);
		}
	};

	wrapped.cancel = () => {
		clearTimeout(timer);
		timer = null;
	};

	onDispose(wrapped.cancel);

	return wrapped;
};
