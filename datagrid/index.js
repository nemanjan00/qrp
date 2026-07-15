/**
 * datagrid/index.js — a headless data-grid state machine.
 *
 * The batteries a real admin table rebuilds every time — row selection (with
 * select-all + indeterminate), column visibility, page-size, and a windowed
 * pager — layered on top of collection(). It owns the STATE only; you bring the
 * markup and CSS (same "helpers not components" contract as the behaviors). It
 * pairs with list()/table(): `grid.items()` feeds the rows, `grid.key` is the
 * keyed-list id.
 *
 *   const grid = dataGrid(() => store.rows, {
 *     key: r => r.id,
 *     columns: [{ key: "name", label: "Name" }, { key: "email", hidden: true }],
 *     filterFn: (r, f) => r.name.includes(f.q),
 *     filter: state({ q: "" }),
 *     pageSizes: [10, 25, 50]
 *   });
 *
 *   grid.toggle(row);         grid.isSelected(row);   grid.selectedItems();
 *   grid.toggleAll();         grid.allSelected();     grid.someSelected();
 *   grid.toggleColumn("email"); grid.visibleColumns();
 *   grid.setPageSize(25);     grid.pageWindow(5);     grid.next();
 */

import { state } from "../qrp/index.js";
import { collection } from "../collection/index.js";

/**
 * @param {Function} source () => Array (reactive)
 * @param {object} [options]
 * @param {Function} [options.key] item => stable id (default `item.id`); used for
 *   selection identity and keyed list reuse
 * @param {Array} [options.columns] column model `[{ key, label?, hidden? }]` for
 *   visibility toggling (optional — pass your table's column specs)
 * @param {number[]} [options.pageSizes] page-size options (default [10,25,50,100])
 * @param {object} [options.sort] see collection()
 * @param {object} [options.page] see collection() — pass to control paging; when
 *   omitted, paging is turned on at `pageSizes[0]`
 * @param {object} [options.filter] see collection()
 * @param {Function} [options.filterFn] see collection()
 * @param {Function} [options.compare] see collection()
 * @returns {object} the grid controller (state only, no markup)
 */
export const dataGrid = (source, options = {}) => {
	const keyOf = options.key || ((item) => item.id);
	const idOf = (item) => String(keyOf(item));

	const view = collection(source, options);

	// Page-size ergonomics. Only adopt a default size when the caller didn't
	// pass their own `page` state — an explicit `size: 0` (no paging) is honored.
	const pageSizes = options.pageSizes || [10, 25, 50, 100];

	if(!options.page && pageSizes.length) {
		view.page.size = pageSizes[0];
	}

	// --- selection (keyed, across the whole filtered set) --------------------
	// A plain reactive map { [id]: true }; state() doesn't wrap Set/Map, so an
	// object is what tracks per-key. Selection is by stable id, so it survives
	// sort/filter/page churn and row-object replacement (refetch).
	const selection = state({});

	const isSelected = (item) => selection[idOf(item)] === true;
	const select = (item) => { selection[idOf(item)] = true; };
	const deselect = (item) => { delete selection[idOf(item)]; };
	const toggle = (item) => (isSelected(item) ? deselect(item) : select(item));

	const selectedIds = () => Object.keys(selection).filter((id) => selection[id]);
	// Resolve against the current filtered set so a row that filtered out is not
	// reported as selected.
	const selectedItems = () => view.filtered().filter(isSelected);

	const clearSelection = () => selectedIds().forEach((id) => { delete selection[id]; });
	const selectAll = () => view.filtered().forEach(select);

	// Header-checkbox state over the filtered set.
	const allSelected = () => {
		const all = view.filtered();

		return all.length > 0 && all.every(isSelected);
	};

	const someSelected = () => {
		const all = view.filtered();
		const picked = all.filter(isSelected).length;

		return picked > 0 && picked < all.length;   // → indeterminate
	};

	const toggleAll = () => (allSelected() ? clearSelection() : selectAll());

	// --- column visibility ---------------------------------------------------
	const columns = options.columns || [];
	const hidden = state({});

	columns.forEach((column) => {
		if(column.hidden) {
			hidden[column.key] = true;
		}
	});

	const isVisible = (columnKey) => !hidden[columnKey];
	const hideColumn = (columnKey) => { hidden[columnKey] = true; };
	const showColumn = (columnKey) => { delete hidden[columnKey]; };
	const toggleColumn = (columnKey) => (hidden[columnKey] ? showColumn(columnKey) : hideColumn(columnKey));
	const visibleColumns = () => columns.filter((column) => isVisible(column.key));

	// --- page-size + windowed pager ------------------------------------------
	const setPageSize = (size) => {
		view.page.size = size;
		view.page.index = 0;   // a resize shifts every row; return to the top
	};

	const goto = (index) => {
		const last = Math.max(0, view.pageCount() - 1);

		view.page.index = Math.min(Math.max(0, index), last);
	};

	const next = () => goto(view.page.index + 1);
	const prev = () => goto(view.page.index - 1);
	const hasNext = () => view.page.index < view.pageCount() - 1;
	const hasPrev = () => view.page.index > 0;

	// A sliding window of page indices centered on the current page, clamped to
	// [0, pageCount-1]. Compare the ends to 0 / (pageCount-1) to render ellipses
	// and first/last jumps yourself.
	const pageWindow = (span = 5) => {
		const count = view.pageCount();
		const current = view.page.index;
		const end = Math.min(count - 1, Math.max(current + Math.floor(span / 2), span - 1));
		const start = Math.max(0, end - span + 1);

		return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
	};

	return {
		// underlying collection + a few passthroughs so the grid is a one-stop
		// controller (grid.items() feeds the list; grid.view.* for the rest)
		view,
		key: keyOf,
		items: view.items,
		total: view.total,
		pageCount: view.pageCount,
		toggleSort: view.toggleSort,
		sort: view.sort,
		filter: view.filter,
		page: view.page,

		// selection
		selection,
		isSelected,
		select,
		deselect,
		toggle,
		selectAll,
		clearSelection,
		toggleAll,
		allSelected,
		someSelected,
		selectedIds,
		selectedItems,

		// columns
		columns,
		isVisible,
		showColumn,
		hideColumn,
		toggleColumn,
		visibleColumns,

		// paging
		pageSizes,
		setPageSize,
		goto,
		next,
		prev,
		hasNext,
		hasPrev,
		pageWindow
	};
};
