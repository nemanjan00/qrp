/**
 * utils/memoize.js — memoize a sync or async function by its arguments.
 *
 * Async calls are deduped IN FLIGHT: the promise is cached the moment the call
 * starts, so a burst of identical calls shares one execution. Rejected promises
 * are evicted so a later call can retry. Never patches builtins (a benchmark
 * showed memoizing String methods is usually a net loss) — this is for wrapping
 * YOUR expensive functions.
 */

import { lru } from "./lru.js";

/**
 * @param {Function} fn function to wrap
 * @param {object} [options]
 * @param {Function} [options.key] args => cache key (default JSON.stringify)
 * @param {number} [options.max] LRU bound (omit for unbounded Map)
 * @param {object} [options.store] custom { has, get, set, delete? } store
 * @returns {Function} memoized function
 */
export const memoize = (fn, options = {}) => {
	const keyOf = options.key || ((args) => JSON.stringify(args));
	// max === 0 means "retain nothing" (an lru(0)), not "unbounded" — only an
	// absent max falls through to the unbounded Map.
	const store = options.store || (options.max !== undefined ? lru(options.max) : new Map());

	return (...args) => {
		const key = keyOf(args);

		if(store.has(key)) {
			return store.get(key);
		}

		const result = fn(...args);

		store.set(key, result);

		// Don't retain a rejected promise — let the next call retry.
		if(result && typeof result.then === "function") {
			result.catch(() => {
				if(store.delete) {
					store.delete(key);
				}
			});
		}

		return result;
	};
};
