/**
 * collection/index.js — reactive sort / filter / paginate over a dataset.
 *
 * The optional "combiner" (like form() over inputs): it factors the sort,
 * filter and page STATE out of a table so you don't hand-wire it each time.
 * `view.items` is a reactive getter you feed straight to list(); each stage is
 * also usable on its own state so you can drive it however you want.
 *
 *   const view = collection(() => rows, {
 *     sort:     state({ key: "name", dir: 1 }),
 *     page:     state({ index: 0, size: 20 }),
 *     filterFn: (row, f) => row.name.includes(f.q),
 *     filter:   state({ q: "" })
 *   });
 *
 *   el("tbody", {}, list(view.items, r => r.id, r => el("tr", {}, ...)));
 *   view.total();      // rows after filtering (before paging)
 *   view.pageCount();  // pages at the current size
 *   view.toggleSort("name");
 */

import { state } from "../qrp/index.js";

/**
 * @param {Function} source () => Array (reactive)
 * @param {object} [options]
 * @param {object} [options.sort] { key, dir } — dir 1 asc, -1 desc; a plain
 *   object is wrapped in state() for you, pass state({...}) to keep a handle
 * @param {object} [options.page] { index, size } — size 0 = no paging (wrapped)
 * @param {object} [options.filter] state consumed by filterFn (e.g. { q })
 * @param {Function} [options.filterFn] (item, filterState) => boolean
 * @param {Function} [options.compare] (a, b, sortState) => number (custom sort)
 * @returns {object} { sort, filter, page, items, filtered, total, pageCount,
 *   toggleSort }
 */
export const collection = (source, options = {}) => {
	// state() is idempotent on an existing proxy, so a caller who passes
	// state({...}) keeps their own object (and their reference to it), while a
	// plain object literal gets wrapped instead of silently producing a table
	// whose headers do nothing: without this, toggleSort() mutated an untracked
	// object, so the view only re-sorted the next time the DATA changed.
	const sort = state(options.sort || { key: null, dir: 1 });
	const filter = state(options.filter || {});
	const page = state(options.page || { index: 0, size: 0 });

	const filtered = () => {
		const items = source() || [];

		if(options.filterFn) {
			return items.filter((item) => options.filterFn(item, filter));
		}

		return items;
	};

	const sorted = () => {
		const items = filtered();

		if(options.compare) {
			return [...items].sort((a, b) => options.compare(a, b, sort));
		}

		if(!sort.key) {
			return items;
		}

		const key = sort.key;
		const dir = sort.dir || 1;

		return [...items].sort((a, b) => {
			if(a[key] === b[key]) {
				return 0;
			}

			return (a[key] > b[key] ? 1 : -1) * dir;
		});
	};

	return {
		sort,
		filter,
		page,

		// Reactive: read inside an effect / pass to list() as the source.
		items: () => {
			const all = sorted();

			if(!page.size) {
				return all;
			}

			// Clamp the page into range so a filter that shrinks the set below
			// the current page doesn't render a blank table with a phantom page.
			const pages = Math.max(1, Math.ceil(all.length / page.size));
			const index = Math.min(Math.max(0, page.index), pages - 1);
			const start = index * page.size;

			return all.slice(start, start + page.size);
		},

		// The full filtered set (unpaged, unsorted) — for "select all across
		// pages", export-all, or a count of matches. Reactive.
		filtered: () => filtered(),

		total: () => filtered().length,

		pageCount: () => (page.size ? Math.ceil(filtered().length / page.size) : 1),

		// Click a column header: toggle direction if same key, else sort ascending.
		toggleSort: (key) => {
			if(sort.key === key) {
				sort.dir = -(sort.dir || 1);
			} else {
				sort.key = key;
				sort.dir = 1;
			}
		}
	};
};
