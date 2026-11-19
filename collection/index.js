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
 *   view.pageIndex();  // the page shown (page.index clamped into range)
 *   view.toggleSort("name");
 */

import { state } from "../qrp/index.js";

// Dates compare by timestamp; NaN (incl. an invalid Date) counts as missing.
const comparable = (value) => (value instanceof Date ? value.getTime() : value);
const isMissing = (value) => value === null || value === undefined || Number.isNaN(value);

// One shared collator: localeCompare with options builds one per call, which
// dominates sorting a large table.
const naturalOrder = new Intl.Collator(undefined, { numeric: true });

/**
 * The default sort comparator (also used by table()). A consistent total
 * order, unlike `a > b ? 1 : -1`, which breaks Array#sort on null/undefined
 * or mixed types and scatters real values out of order:
 * missing (null/undefined/NaN) always sorts last whatever the direction,
 * numbers and Dates compare numerically, everything else by natural-order
 * string comparison (`"item 2"` before `"item 10"`).
 *
 * @param {*} a
 * @param {*} b
 * @param {number} [dir] 1 ascending (default), -1 descending
 * @returns {number}
 */
export const compareValues = (a, b, dir = 1) => {
	const av = comparable(a);
	const bv = comparable(b);
	const aMissing = isMissing(av);
	const bMissing = isMissing(bv);

	if(aMissing || bMissing) {
		return Number(aMissing) - Number(bMissing);
	}

	if(av === bv) {
		return 0;
	}

	const order = typeof av === "number" && typeof bv === "number"
		? av - bv
		: naturalOrder.compare(String(av), String(bv));

	return order * (dir || 1);
};

/**
 * @param {Function} source () => Array (reactive)
 * @param {object} [options]
 * @param {object} [options.sort] { key, dir } — dir 1 asc, -1 desc; a plain
 *   object is wrapped in state() for you, pass state({...}) to keep a handle
 * @param {object} [options.page] { index, size } — size 0 = no paging (wrapped)
 * @param {object} [options.filter] state consumed by filterFn (e.g. { q })
 * @param {Function} [options.filterFn] (item, filterState) => boolean
 * @param {Function} [options.compare] (a, b, sortState) => number (custom sort)
 * @param {boolean} [options.clearSort] toggleSort cycles asc → desc → off
 *   (source order) instead of asc ⇄ desc
 * @returns {object} { sort, filter, page, items, filtered, sorted, total,
 *   pageCount, pageIndex, toggleSort }
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

		return [...items].sort((a, b) => compareValues(a[key], b[key], dir));
	};

	// The page actually shown: page.index clamped into range, so a filter that
	// shrinks the set below the current page doesn't render a blank table with
	// a phantom page. page.index itself is left alone (widening the filter
	// again returns to it); pagers/summaries read pageIndex(), not the raw index.
	const clampIndex = (length) => {
		const last = Math.max(0, Math.ceil(length / page.size) - 1);

		return Math.min(Math.max(0, page.index || 0), last);
	};

	const pageIndex = () => (page.size ? clampIndex(filtered().length) : 0);

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

			const start = clampIndex(all.length) * page.size;

			return all.slice(start, start + page.size);
		},

		// The full filtered set (unpaged, unsorted) — for "select all across
		// pages", export-all, or a count of matches. Reactive.
		filtered: () => filtered(),

		// Filtered AND sorted, unpaged: "export what I see" across every page,
		// in the order the user picked. Reactive.
		sorted: () => sorted(),

		total: () => filtered().length,

		pageCount: () => (page.size ? Math.ceil(filtered().length / page.size) : 1),

		pageIndex,

		// Click a column header: toggle direction if same key, else sort
		// ascending. With `clearSort`, a third click (on a descending key)
		// returns to the source order.
		toggleSort: (key) => {
			if(sort.key === key && options.clearSort && (sort.dir || 1) === -1) {
				sort.key = null;
				sort.dir = 1;
			} else if(sort.key === key) {
				sort.dir = -(sort.dir || 1);
			} else {
				sort.key = key;
				sort.dir = 1;
			}
		}
	};
};

// Search tokens: bare words, "quoted phrases", and field:"quoted phrase".
const SEARCH_TOKEN = /(?:[^\s"]+|"[^"]*")+/g;

const searchText = (value) => {
	if(value === null || value === undefined) {
		return "";
	}

	if(value instanceof Date) {
		return value.toISOString();
	}

	return typeof value === "object" ? JSON.stringify(value) : String(value);
};

const unquote = (token) => token.replace(/"/g, "");

// fields → [{ label, value(item) }]: a key string, { key, label?, value? }, or
// an object map { label: accessor }.
const searchFields = (fields) => {
	if(!Array.isArray(fields)) {
		return Object.keys(fields).map((label) => ({ label, value: fields[label] }));
	}

	return fields.map((field) => {
		if(typeof field === "string") {
			return { label: field, value: (item) => item[field] };
		}

		return {
			label: field.label != null ? field.label : field.key,
			value: field.value || field.accessor || ((item) => item[field.key])
		};
	});
};

// "col:text" scopes a term to the field labelled col (exact, else the first
// label starting with it). An unknown col keeps the whole token as a plain term,
// so "12:30" still finds a time.
const parseSearch = (query, labels) => {
	const tokens = String(query || "").match(SEARCH_TOKEN) || [];

	return tokens.map((token) => {
		const colon = token.indexOf(":");

		if(colon > 0) {
			const name = unquote(token.slice(0, colon)).toLowerCase();
			const exact = labels.indexOf(name);
			const field = exact !== -1 ? exact : labels.findIndex((label) => label.startsWith(name));

			if(field !== -1) {
				return { field, text: unquote(token.slice(colon + 1)).toLowerCase() };
			}
		}

		return { field: -1, text: unquote(token).toLowerCase() };
	}).filter((term) => term.text !== "");
};

/**
 * A ready-made `filterFn` for a search box: every term must match
 * (case-insensitive substring), `field:text` limits a term to one field, and
 * "quoted phrases" keep their spaces.
 *
 *   const filter = state({ q: "" });
 *   collection(() => rows, { filter, filterFn: searchFilter(["name", "status"]) });
 *   el("input", { type: "search", bind: [filter, "q"] });   // "status:err disk"
 *
 * @param {Array<string|object>|object} fields key strings, `{ key, label?, value? }`
 *   descriptors (same shape as table/export columns), or `{ label: accessor }`
 * @param {object} [options]
 * @param {string} [options.key] which filter-state key holds the query (default "q")
 * @returns {Function} (item, filterState) => boolean
 */
export const searchFilter = (fields, options = {}) => {
	const key = options.key || "q";
	const columns = searchFields(fields);
	const labels = columns.map((column) => String(column.label || "").toLowerCase());
	// one parse per query, not per row
	let last = null;
	let terms = [];

	return (item, filterState) => {
		const query = filterState ? filterState[key] : "";

		if(query !== last) {
			last = query;
			terms = parseSearch(query, labels);
		}

		if(!terms.length) {
			return true;
		}

		const cells = columns.map((column) => searchText(column.value(item)).toLowerCase());

		return terms.every((term) => (term.field >= 0
			? cells[term.field].includes(term.text)
			: cells.some((cell) => cell.includes(term.text))));
	};
};
