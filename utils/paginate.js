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
		return array;
	}

	const start = index * size;

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
