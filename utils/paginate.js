/**
 * utils/paginate.js — pure paging math.
 */

/**
 * Return the slice of `array` for a zero-based page. size 0 returns everything.
 *
 * @param {Array} array
 * @param {number} index zero-based page index
 * @param {number} size items per page (0 = all)
 * @returns {Array}
 */
export const paginate = (array, index, size) => {
	if(!size) {
		return array.slice(); // fresh copy — never leak the source by reference
	}

	// Clamp index to >= 0 so a decrement-below-zero doesn't wrap-slice from the
	// end (a negative start in Array.slice counts backwards).
	const start = Math.max(0, index) * size;

	return array.slice(start, start + size);
};

/**
 * Number of pages for `total` items at `size` per page.
 *
 * @param {number} total
 * @param {number} size
 * @returns {number}
 */
export const pageCount = (total, size) => {
	return size ? Math.ceil(total / size) : 1;
};
