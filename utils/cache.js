/**
 * utils/cache.js — zero-arg producer caches: run once, run eagerly, or keep
 * refreshing in the background. (For arg-keyed caching use ./memoize.js.)
 */

/**
 * Run a zero-arg function at most once; every later call returns the first
 * result. Handles falsy results correctly (unlike a truthiness check).
 *
 * @param {Function} method () => value
 * @returns {Function} () => value
 */
export const cacheForever = (method) => {
	let filled = false;
	let value;

	return () => {
		if(!filled) {
			value = method();
			filled = true;
		}

		return value;
	};
};

/**
 * Start an async producer immediately (next microtask) and hand back a getter
 * for its promise — the work is in flight before the first read.
 *
 * @param {Function} method () => Promise
 * @returns {Function} () => Promise
 */
export const precache = (method) => {
	const promise = Promise.resolve().then(() => method());

	return () => promise;
};

/**
 * Keep an async producer's result fresh in the background: refresh on an
 * interval, swapping in each new promise as it resolves. The returned getter
 * always yields the freshest settled (or in-flight initial) promise.
 *
 * @param {Function} method () => Promise
 * @param {number} [refreshTime] interval in ms (default 2000)
 * @param {Function} [callback] called with each new promise after it resolves
 * @returns {Function} getter with .refresh() and .stop()
 */
export const precacheWithRefresh = (method, refreshTime, callback) => {
	const interval = refreshTime || 2000;

	let current = method();

	const refresh = () => {
		const next = method();

		return next.then((value) => {
			current = next;

			if(callback) {
				callback(next);
			}

			return value;
		});
	};

	const timer = setInterval(() => {
		refresh().catch((error) => {
			console.error(error);
		});
	}, interval);

	const getter = () => current;

	getter.refresh = refresh;
	getter.stop = () => clearInterval(timer);

	return getter;
};
