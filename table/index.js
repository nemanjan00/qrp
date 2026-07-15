/**
 * table/index.js — a declarative data table combiner.
 *
 * The form()-of-tables: describe columns as data, hand it a reactive row
 * source, and it renders sortable headers + keyed rows on top of collection +
 * list — sort/filter/paginate reactive, elements reused, cells self-updating.
 * You still style it (qrp ships behavior, not CSS); classes are yours to theme.
 *
 *   const t = table({
 *     rows: () => store.items,
 *     key: item => item.id,
 *     fields: [
 *       { key: "name", label: "Name", sortable: true,
 *         accessor: i => i.account.name },
 *       { key: "followers", label: "Followers", sortable: true,
 *         formatter: v => v.toLocaleString(), sortByFormatted: true },
 *       { key: "actions", label: "",
 *         render: item => el("button", { onclick: () => edit(item) }, "Edit") }
 *     ],
 *     page: state({ index: 0, size: 20 }),   // optional
 *     filter: state({ q: "" }),               // optional
 *     filterFn: (item, f) => matches(item, f) // optional
 *   });
 *
 *   view.appendChild(t);          // t is the <table> element
 *   t.view.pageCount();           // collection controller, for pagination UI
 *
 * Column descriptor:
 *   key            unique id + default value path (item[key])
 *   label          header text
 *   accessor       item => rawValue (default item[key]); supports nesting
 *   formatter      (rawValue, item) => display text
 *   render         item => Element  (custom cell; overrides formatter)
 *   sortable       header toggles sort on this column
 *   sortByFormatted  sort by formatter output instead of the raw value
 *   thClass/tdClass  class strings for header/cell (e.g. responsive-hide)
 */

import { el, list, state, when } from "../qrp/index.js";
import { collection } from "../collection/index.js";

const resolveValue = (fieldSpec, item) => {
	const accessor = fieldSpec.accessor || ((row) => row[fieldSpec.key]);

	return accessor(item);
};

const sortValue = (fieldSpec, item) => {
	const raw = resolveValue(fieldSpec, item);

	if(fieldSpec.sortByFormatted && fieldSpec.formatter) {
		return fieldSpec.formatter(raw, item);
	}

	return raw;
};

/**
 * Build a data table.
 *
 * @param {object} options
 * @param {(Function|Array)} options.rows reactive source or array
 * @param {object[]} options.fields column descriptors (see file header)
 * @param {Function} [options.key] item => stable key (default item.id)
 * @param {object} [options.sort] state({ key, dir }); dir 1 asc, -1 desc
 * @param {object} [options.page] state({ index, size }) for pagination
 * @param {object} [options.filter] filter state consumed by filterFn
 * @param {Function} [options.filterFn] (item, filterState) => boolean
 * @param {Function} [options.rowClass] item => class string for the <tr>
 * @param {string} [options.class] extra class(es) for the <table>
 * @returns {HTMLTableElement} the table element (with .view = collection)
 */
export const table = (options) => {
	// `fields` may be a THUNK (() => Column[]) for reactive column sets — a
	// visibility toggle, role-gated columns. currentFields() reads the live set;
	// dynamicFields gates the reactive-region path so static tables keep the
	// build-once fast path (zero regression).
	const dynamicFields = typeof options.fields === "function";
	const currentFields = dynamicFields ? options.fields : () => (options.fields || []);
	const lookupField = (key) => currentFields().find((fieldSpec) => fieldSpec.key === key);

	const source = typeof options.rows === "function" ? options.rows : () => options.rows;
	const keyFn = options.key || ((item) => item.id);
	const sort = options.sort || state({ key: options.sortField || null, dir: options.sortDesc ? -1 : 1 });

	const view = collection(source, {
		sort,
		page: options.page,
		filter: options.filter,
		filterFn: options.filterFn,
		compare: (a, b, sortState) => {
			const fieldSpec = lookupField(sortState.key);

			if(!fieldSpec) {
				return 0;
			}

			const av = sortValue(fieldSpec, a);
			const bv = sortValue(fieldSpec, b);

			if(av === bv) {
				return 0;
			}

			return (av > bv ? 1 : -1) * (sortState.dir || 1);
		}
	});

	const indicator = (fieldSpec) => {
		if(sort.key !== fieldSpec.key) {
			return "";
		}

		return sort.dir === -1 ? " ▼" : " ▲";
	};

	const headerCell = (fieldSpec) => {
		const props = { class: () => "qrp-th " + (fieldSpec.thClass || "") };

		if(fieldSpec.sortable) {
			props.class = () => "qrp-th qrp-sortable " + (fieldSpec.thClass || "");
			props.onclick = () => view.toggleSort(fieldSpec.key);
		}

		// header() gives full control of the th content (a select-all checkbox, a
		// filter icon…); stopPropagation so its own clicks don't trigger the sort.
		const content = fieldSpec.header
			? el("span", { onclick: (e) => e.stopPropagation() }, fieldSpec.header(fieldSpec))
			: fieldSpec.label;

		return el("th", props,
			content,
			fieldSpec.sortable ? el("span", { class: "qrp-sort" }, () => indicator(fieldSpec)) : null
		);
	};

	// A row's element is reused across sort/filter AND across data refetches
	// (same key). Because the dashboard model replaces rows immutably, cells
	// must read the CURRENT object, not the one captured at build time. So each
	// key gets a stable reactive holder whose .item we swap on replace; cells
	// read holder.item and re-run when it changes — element preserved.
	const holders = new Map();

	const holderSource = () => {
		const items = view.items();
		const present = new Set();

		const result = items.map((item) => {
			const key = keyFn(item);

			present.add(key);

			let holder = holders.get(key);

			if(!holder) {
				holder = state({ item, key });
				holders.set(key, holder);
			} else if(holder.item !== item) {
				holder.item = item;
			}

			return holder;
		});

		holders.forEach((_holder, key) => {
			if(!present.has(key)) {
				holders.delete(key);
			}
		});

		return result;
	};

	const bodyCell = (fieldSpec, holder) => {
		const props = fieldSpec.tdClass ? { class: fieldSpec.tdClass } : {};

		if(fieldSpec.render) {
			// Reactive: re-invoke render when the row's item is replaced (refetch),
			// so custom/action cells reflect fresh data instead of the item they
			// were built with. Reading holder.item in the thunk tracks it.
			return el("td", props, () => fieldSpec.render(holder.item));
		}

		return el("td", props, () => {
			const raw = resolveValue(fieldSpec, holder.item);

			return fieldSpec.formatter ? fieldSpec.formatter(raw, holder.item) : raw;
		});
	};

	// Expandable rows: a per-key open flag + a detail panel rendered below the
	// row via when(). Enabled by options.expandable(item) => Renderable.
	const expandable = options.expandable;
	const open = state({});
	const toggleRow = (key) => { open[key] = !open[key]; };

	const cellsFor = (holder, fieldList) => fieldList.map((fieldSpec) => bodyCell(fieldSpec, holder));

	const row = (holder) => {
		const props = {};

		if(options.rowClass) {
			props.class = () => options.rowClass(holder.item);
		}

		if(expandable) {
			props.style = "cursor:pointer";
			// toggle on row click, but not when an interactive cell was clicked
			props.onclick = (event) => {
				if(event.target.closest("button, a, input, select, label, [data-no-expand]")) {
					return;
				}

				toggleRow(holder.key);
			};
		}

		// Static fields → build cells once (fast path). Dynamic fields → a reactive
		// region so a column toggle re-renders the cells (row element preserved).
		return dynamicFields
			? el("tr", props, () => cellsFor(holder, currentFields()))
			: el("tr", props, ...cellsFor(holder, options.fields || []));
	};

	// A row group: the row plus its (conditional) detail row. Only used when
	// expandable — one <tbody> per key so the detail <tr> stays with its row.
	const rowGroup = (holder) => el("tbody", { class: "qrp-rowgroup" },
		row(holder),
		when(() => !!open[holder.key], () =>
			el("tr", { class: "qrp-expand" },
				el("td", { colspan: () => currentFields().length }, expandable(holder.item))))
	);

	const headerRow = dynamicFields
		? el("tr", {}, () => currentFields().map(headerCell))
		: el("tr", {}, ...(options.fields || []).map(headerCell));

	const node = el("table", { class: "qrp-table " + (options.class || "") },
		el("thead", {}, headerRow),
		// non-expandable → one <tbody> of <tr> (unchanged). expandable → a list of
		// <tbody> row-groups (multiple tbodies is valid HTML).
		expandable
			? list(holderSource, (holder) => holder.key, rowGroup)
			: el("tbody", {}, list(holderSource, (holder) => holder.key, row))
	);

	// Expose the collection controller (pagination/totals UI) + expansion control.
	node.view = view;
	node.expanded = open;
	node.toggleRow = toggleRow;

	return node;
};

// Windowed page list: first, last, current±window, "…" for gaps.
const pageWindow = (current, count, window) => {
	const keep = new Set([0, count - 1]);

	for(let i = current - window; i <= current + window; i++) {
		if(i >= 0 && i < count) {
			keep.add(i);
		}
	}

	const sorted = [...keep].sort((a, b) => a - b);
	const out = [];
	let prev = -1;

	sorted.forEach(page => {
		if(page - prev > 1) {
			out.push("…");
		}

		out.push(page);
		prev = page;
	});

	return out;
};

/**
 * A stock pagination control for a table()'s `.view` (or any collection):
 * prev / windowed page numbers / next, clamped, reactive. Renders nothing when
 * there's one page or fewer.
 *
 * @param {object} view a collection controller (table().view)
 * @param {object} [options]
 * @param {number} [options.window] page numbers to show either side of current (default 1)
 * @returns {HTMLElement}
 */
export const tablePager = (view, options = {}) => {
	const window = options.window === undefined ? 1 : options.window;

	const go = (index) => {
		view.page.index = Math.max(0, Math.min(index, view.pageCount() - 1));
	};

	const button = (label, target, { active, disabled } = {}) => el("button", {
		type: "button",
		class: "qrp-pager-btn" + (active ? " active" : ""),
		disabled: !!disabled,
		"aria-current": active ? "page" : null,
		onclick: () => go(target)
	}, label);

	return el("nav", { class: "qrp-pager", "aria-label": "Pagination" }, () => {
		const count = view.pageCount();
		const current = view.page.index;

		if(count <= 1) {
			return [];
		}

		return [
			button("‹", current - 1, { disabled: current === 0 }),
			...pageWindow(current, count, window).map(page =>
				page === "…"
					? el("span", { class: "qrp-pager-gap" }, "…")
					: button(String(page + 1), page, { active: page === current })),
			button("›", current + 1, { disabled: current === count - 1 })
		];
	});
};

/**
 * A reactive "Showing X–Y of Z" summary for a table()'s `.view`. Pass `label` to
 * customize the text.
 *
 * @param {object} view a collection controller (table().view)
 * @param {object} [options]
 * @param {(from:number,to:number,total:number)=>string} [options.label]
 * @returns {HTMLElement}
 */
export const tableSummary = (view, options = {}) => {
	const label = options.label || ((from, to, total) => `Showing ${from}–${to} of ${total}`);

	return el("span", { class: "qrp-summary" }, () => {
		const total = view.total();
		const size = view.page.size;

		if(total === 0) {
			return "No results";
		}

		if(!size) {
			return `${total} total`;
		}

		const from = view.page.index * size + 1;
		const to = Math.min(from + size - 1, total);

		return label(from, to, total);
	});
};
