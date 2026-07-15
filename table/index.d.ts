/**
 * @module table
 * A declarative data table over `collection` + `list`: sortable headers, keyed
 * row reuse, per-column config. A column is `{ key, label?, accessor?, formatter?,
 * render?, header?, sortable?, sortByFormatted?, thClass?, tdClass? }`. `fields`
 * may be a thunk for reactive columns; `expandable` adds detail rows. The
 * returned table has `.view` (the collection, for `tablePager`/`tableSummary`)
 * plus `.expanded`/`.toggleRow`.
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
	/** (rawValue, item) => display text. */
	formatter?: (value: any, item: T) => Renderable;
	/** item => Element — a custom cell (overrides formatter). */
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

export interface TableOptions<T> {
	rows: (() => readonly T[]) | readonly T[];
	/** Columns — an array, or a thunk `() => Column[]` for a reactive set
	 *  (column visibility toggle, role-gated columns; rows re-render, elements reused). */
	fields: Column<T>[] | (() => Column<T>[]);
	/** Enable expandable rows: item => the detail panel shown below the row.
	 *  A row click toggles it (interactive cells excluded); also `.toggleRow(key)`. */
	expandable?: (item: T) => Renderable;
	/** item => stable key (the :key equivalent; default item.id). */
	key?: (item: T) => unknown;
	sort?: SortState;
	page?: PageState;
	filter?: Record<string, any>;
	filterFn?: (item: T, filter: Record<string, any>) => boolean;
	rowClass?: (item: T) => string;
	/** Extra class(es) for the <table>. */
	class?: string;
	sortField?: string;
	sortDesc?: boolean;
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

/** A stock prev / windowed-pages / next control for a table().view (or any collection). */
export function tablePager(view: Collection<any>, options?: { window?: number }): HTMLElement;

/** A reactive "Showing X–Y of Z" summary for a table().view (or any collection). */
export function tableSummary(view: Collection<any>, options?: {
	label?: (from: number, to: number, total: number) => string;
}): HTMLElement;
