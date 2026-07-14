/**
 * utils/lru.js — a bounded key/value store with least-recently-used eviction.
 * Implements the { has, get, set, delete } interface memoize() expects.
 */

/**
 * @param {number} max maximum entries to retain
 * @returns {object} store
 */
export const lru = (max) => {
	const map = new Map();

	return {
		has: (key) => map.has(key),

		get: (key) => {
			if(!map.has(key)) {
				return undefined;
			}

			// Touch: move to newest.
			const value = map.get(key);
			map.delete(key);
			map.set(key, value);

			return value;
		},

		set: (key, value) => {
			if(map.has(key)) {
				map.delete(key);
			}

			map.set(key, value);

			if(map.size > max) {
				map.delete(map.keys().next().value);
			}
		},

		delete: (key) => map.delete(key),

		clear: () => map.clear(),

		get size() {
			return map.size;
		}
	};
};
