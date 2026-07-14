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

import { el, list, state } from "../qrp/index.js";
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
	const fields = options.fields || [];
	const source = typeof options.rows === "function" ? options.rows : () => options.rows;
	const keyFn = options.key || ((item) => item.id);
	const sort = options.sort || state({ key: options.sortField || null, dir: options.sortDesc ? -1 : 1 });

	const fieldByKey = {};
	fields.forEach((fieldSpec) => { fieldByKey[fieldSpec.key] = fieldSpec; });

	const view = collection(source, {
		sort,
		page: options.page,
		filter: options.filter,
		filterFn: options.filterFn,
		compare: (a, b, sortState) => {
			const fieldSpec = fieldByKey[sortState.key];

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

		return el("th", props,
			fieldSpec.label,
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

	const row = (holder) => {
		const props = {};

		if(options.rowClass) {
			props.class = () => options.rowClass(holder.item);
		}

		return el("tr", props, fields.map((fieldSpec) => bodyCell(fieldSpec, holder)));
	};

	const node = el("table", { class: "qrp-table " + (options.class || "") },
		el("thead", {}, el("tr", {}, fields.map(headerCell))),
		el("tbody", {}, list(holderSource, (holder) => holder.key, row))
	);

	// Expose the collection controller for pagination / totals UI.
	node.view = view;

	return node;
};
