/**
 * utils/memoize.js — memoize a sync or async function by its arguments.
 *
 * Async calls are deduped IN FLIGHT: the promise is cached the moment the call
 * starts, so a burst of identical calls shares one execution. Rejected promises
 * are evicted so a later call can retry. Optional `ttl` expires entries (for a
 * promise, the clock starts when it RESOLVES); `.invalidate()` clears entries
 * imperatively (e.g. from a bus event). Never patches builtins (a benchmark
 * showed memoizing String methods is usually a net loss) — this is for wrapping
 * YOUR expensive functions.
 */

import { lru } from "./lru.js";

/**
 * @param {Function} fn function to wrap
 * @param {object} [options]
 * @param {Function} [options.key] args => cache key (default JSON.stringify)
 * @param {number} [options.max] LRU bound (omit for unbounded Map)
 * @param {number} [options.ttl] ms an entry stays fresh (post-resolve for promises)
 * @param {object} [options.store] custom { has, get, set, delete?, clear? } store
 * @returns {Function} memoized fn, with `.invalidate(...args)` / `.invalidate()`
 */
export const memoize = (fn, options = {}) => {
	const keyOf = options.key || ((args) => JSON.stringify(args));
	// max === 0 means "retain nothing" (an lru(0)), not "unbounded" — only an
	// absent max falls through to the unbounded Map.
	const store = options.store || (options.max !== undefined ? lru(options.max) : new Map());
	const ttl = options.ttl;
	const expires = ttl ? new Map() : null;

	const drop = (key) => {
		if(store.delete) {
			store.delete(key);
		}

		if(expires) {
			expires.delete(key);
		}
	};

	// A pending promise has no expiry stamp yet (stamped on resolve), so it reads
	// as fresh — that's what dedups in-flight calls. A resolved entry expires ttl
	// ms after it settled.
	const fresh = (key) => {
		if(!expires) {
			return true;
		}

		const exp = expires.get(key);

		if(exp === undefined || Date.now() <= exp) {
			return true;
		}

		drop(key);

		return false;
	};

	const memoized = (...args) => {
		const key = keyOf(args);

		if(store.has(key) && fresh(key)) {
			return store.get(key);
		}

		const result = fn(...args);

		store.set(key, result);

		if(result && typeof result.then === "function") {
			result.then(
				() => { if(expires) { expires.set(key, Date.now() + ttl); } },
				() => drop(key)   // don't retain a rejected promise — let it retry
			);
		} else if(expires) {
			expires.set(key, Date.now() + ttl);
		}

		return result;
	};

	/** Clear one entry (by the same args) or the whole cache (no args). */
	memoized.invalidate = (...args) => {
		if(args.length === 0) {
			if(store.clear) {
				store.clear();
			}

			if(expires) {
				expires.clear();
			}

			return;
		}

		drop(keyOf(args));
	};

	return memoized;
};
