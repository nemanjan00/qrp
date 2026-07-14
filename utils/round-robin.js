/**
 * utils/round-robin.js — diversify a list by interleaving buckets.
 */

/**
 * Pick up to `limit` items from `items`, round-robin across buckets keyed by
 * `keyFn(item)`. Within each bucket input order is preserved (so a pre-sorted
 * input yields the lowest-ranked item from each bucket first, then the next).
 * Bucket order matches first appearance in `items`. Diversifies a list/feed so
 * one bucket can't dominate the top.
 *
 * @param {Array} items
 * @param {number} limit
 * @param {Function} keyFn item => bucket key
 * @returns {Array}
 */
export const roundRobinByKey = (items, limit, keyFn) => {
	if(limit <= 0) {
		return [];
	}

	const buckets = {};
	const order = [];

	items.forEach((item) => {
		const key = keyFn(item);

		if(buckets[key] === undefined) {
			buckets[key] = [];
			order.push(key);
		}

		buckets[key].push(item);
	});

	const picked = [];

	let progress = true;

	while(picked.length < limit && progress) {
		progress = false;

		order.forEach((key) => {
			if(picked.length >= limit || buckets[key].length === 0) {
				return;
			}

			picked.push(buckets[key].shift());

			progress = true;
		});
	}

	return picked;
};
