/**
 * @module table
 * A declarative data table over `collection` + `list`: sortable headers, keyed
 * row reuse, per-column config. A column is `{ key, label?, accessor?, formatter?,
 * render?, header?, sortable?, sortByFormatted?, thClass?, tdClass? }`. `fields`
 * may be a thunk for reactive columns; `expandable` adds detail rows. The
 * returned table has `.view` (the collection, for `tablePager`/`tableSummary`)
 * plus `.expanded`/`.toggleRow`. Every part carries a stable `qrp-*` class; style
 * it through a design system with `classes` (per part), `attrs` (reactive
 * attributes per part) and `sortIndicator`; share a `collection`/`dataGrid` with
 * the `view` option.
 * @example
 * const t = table({
 *   rows: () => store.rows, key: (r) => r.id, filter, page,
 *   fields: [
 *     { key: "name", label: "Name", sortable: true },
 *     { key: "signups", label: "Signups", sortable: true, formatter: (v) => v.toLocaleString() },
 *     { key: "actions", label: "", render: (r) => el("button", { onclick: () => open(r) }, "View") }
 *   ]
 * });
 */
import type { Renderable } from "../qrp/index.js";
import type { Collection, SortState, PageState } from "../collection/index.js";

/** A column descriptor for table(). */
export interface Column<T> {
	/** Unique id and default value path (item[key]). */
	key: string;
	label?: string;
	/** item => raw value (default item[key]); supports nesting. */
	accessor?: (item: T) => unknown;
	/** (rawValue, item) => display text. Already reactive (see `render`). */
	formatter?: (value: any, item: T) => Renderable;
	/** item => Element — a custom cell (overrides formatter).
	 *
	 *  **Already reactive — no thunk needed.** table() calls `render` inside a
	 *  reactive region of its own (the `<td>`'s child is `() => render(item)`), so
	 *  the cell re-renders whenever the row's item is REPLACED (refetch) or any
	 *  state `render` reads changes. Returning plain values is fine and stays live.
	 *  Inner thunks are an optimization, not a requirement: with
	 *  `render: (r) => el("b", {}, () => r.count)` only the text node updates; without
	 *  the thunk the whole cell's content is rebuilt (matters for cells holding
	 *  focus, an `<input>`, or expensive markup — not for correctness).
	 *  `formatter` and `expandable` follow the same rule. */
	render?: (item: T) => Renderable;
	/** column => Renderable — custom header content (a select-all box, filter…);
	 *  its own clicks don't trigger the column sort. Overrides `label`. */
	header?: (column: Column<T>) => Renderable;
	sortable?: boolean;
	/** Sort by the formatter output instead of the raw value. */
	sortByFormatted?: boolean;
	thClass?: string;
	tdClass?: string;
}

/** Where a table() gets its rows: a `rows` source, or a shared `view`. */
export type TableRows<T> = (() => readonly T[]) | readonly T[];

/** What table() needs from a shared `view` (a collection() or dataGrid). */
export type TableView<T> = Pick<Collection<T>, "items" | "sort" | "toggleSort"> & Partial<Collection<T>>;

/** table() options: `rows`, or a shared `view` (then `rows` is optional and ignored). */
export type TableOptions<T> = TableBaseOptions<T> & (
	| { rows: TableRows<T>; view?: undefined }
	| {
		/** Render through an existing collection() or dataGrid (anything with
		 *  `items()`, `sort` and `toggleSort`) instead of building a second one. It
		 *  owns rows/sort/filter/page — those options and `filterFn` are ignored —
		 *  and sorting uses its compare. Share it with a toolbar/pager so both agree. */
		view: TableView<T>;
		/** Ignored when `view` is given. */
		rows?: TableRows<T>;
	}
);

/** The table() options shared by both row sources (see TableOptions). */
export interface TableBaseOptions<T> {
	/** Columns — an array, or a thunk `() => Column[]` for a reactive set
	 *  (column visibility toggle, role-gated columns; rows re-render, elements reused). */
	fields: Column<T>[] | (() => Column<T>[]);
	/** Enable expandable rows: item => the detail panel shown below the row.
	 *  A row click toggles it (interactive cells excluded); also `.toggleRow(key)`. */
	expandable?: (item: T) => Renderable;
	/** item => stable key (the :key equivalent; default item.id). */
	key?: (item: T) => unknown;
	/**
	 * Sort state. A plain object literal is wrapped in `state()` for you; pass
	 * `state({ key, dir })` when you want a handle to drive the sort yourself.
	 */
	sort?: SortState;
	page?: PageState;
	filter?: Record<string, any>;
	filterFn?: (item: T, filter: Record<string, any>) => boolean;
	/** Header clicks cycle asc → desc → off (source order) instead of asc ⇄ desc. */
	clearSort?: boolean;
	rowClass?: (item: T) => string;
	/** Extra class(es) for the <table>. */
	class?: string;
	/** Extra classes per part, merged with the qrp-* classes and the per-column
	 *  thClass/tdClass and rowClass. `tr` may be a function of the row's item. */
	classes?: TableClasses<T>;
	/** Custom sort indicator for sortable headers (replaces ▲/▼). `dir` is 1
	 *  (ascending), -1 (descending) or 0 (not the sort column). */
	sortIndicator?: (dir: 1 | -1 | 0) => Renderable;
	/** Reactive attribute hooks (null/false removes): a selected row's
	 *  `data-state`/`aria-selected`, a cell's `data-label`, a header's `scope`. */
	attrs?: {
		tr?: (item: T) => Record<string, string | number | boolean | null | undefined>;
		td?: (column: Column<T>, item: T) => Record<string, string | number | boolean | null | undefined>;
		th?: (column: Column<T>) => Record<string, string | number | boolean | null | undefined>;
	};
	sortField?: string;
	sortDesc?: boolean;
}

/** Extra classes for each part of a table(). */
export interface TableClasses<T> {
	thead?: string;
	headRow?: string;
	th?: string;
	tbody?: string;
	tr?: string | ((item: T) => string);
	td?: string;
	expandRow?: string;
	expandCell?: string;
}

/** The table element: `.view` (the collection), plus expansion controls. */
export type TableElement<T> = HTMLTableElement & {
	view: Collection<T>;
	/** Reactive per-key open flags for expandable rows (`expanded[key]`). */
	expanded: Record<string, boolean>;
	/** Toggle a row's detail panel by its key. */
	toggleRow: (key: unknown) => void;
};

/** Build a declarative, sortable, keyed, paginated data table. */
export function table<T>(options: TableOptions<T>): TableElement<T>;

/** A stock prev / windowed-pages / next control for a table().view (or any
 *  collection / dataGrid — it only reads `page` and `pageCount()`). */
export function tablePager(view: Pick<Collection<any>, "page" | "pageCount">, options?: {
	window?: number;
	/** Extra classes: the <nav>, every button, the current page's button, the "…" gap. */
	classes?: { nav?: string; button?: string; active?: string; gap?: string };
}): HTMLElement;

/** A reactive "Showing X–Y of Z" summary for a table().view (or any
 *  collection / dataGrid — it only reads `page` and `total()`). */
export function tableSummary(view: Pick<Collection<any>, "page" | "total">, options?: {
	label?: (from: number, to: number, total: number) => string;
}): HTMLElement;
