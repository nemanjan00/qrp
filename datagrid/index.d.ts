/**
 * @module datagrid
 * A headless data-grid state machine over collection(): row selection (with
 * select-all + indeterminate), column visibility, page-size, and a windowed
 * pager. State only — you bring markup + CSS (like the behaviors). `grid.items()`
 * feeds a `list()`/`table()`, `grid.key` is the keyed-list id. `dataGrid(source,
 * options)` where options add `{ key?, columns?, pageSizes? }` on top of every
 * collection() option.
 */
import type { Collection, CollectionOptions, SortState, PageState } from "../collection/index.js";

/** A column entry for visibility toggling (superset-compatible with table fields). */
export interface GridColumn {
	key: string;
	label?: string;
	/** Start hidden. */
	hidden?: boolean;
	[extra: string]: any;
}

export interface DataGridOptions<T> extends CollectionOptions<T> {
	/** item => stable id (default `item.id`); selection identity + keyed reuse. */
	key?: (item: T) => string | number;
	/** Column model for visibility toggling. */
	columns?: GridColumn[];
	/** Page-size options (default [10, 25, 50, 100]). */
	pageSizes?: number[];
}

export interface DataGrid<T> {
	/** The underlying collection (sort/filter/paginate). */
	view: Collection<T>;
	/** The stable-id function — pass to list()/table(). */
	key: (item: T) => string | number;

	// collection passthroughs (grid is a one-stop controller)
	/** Reactive current-page rows. Feed to list(). */
	items(): T[];
	/** Count after filtering (before paging). */
	total(): number;
	/** Number of pages at the current size. */
	pageCount(): number;
	/** Toggle sort on a key (asc, then flip). */
	toggleSort(key: string): void;
	sort: SortState;
	filter: Record<string, any>;
	page: PageState;

	// selection (by stable id, across the whole filtered set)
	/** Reactive map of selected ids `{ [id]: true }`. */
	selection: Record<string, boolean>;
	isSelected(item: T): boolean;
	select(item: T): void;
	deselect(item: T): void;
	toggle(item: T): void;
	/** Select every row in the current filtered set (all pages). */
	selectAll(): void;
	clearSelection(): void;
	/** Select-all if not all selected, else clear. */
	toggleAll(): void;
	/** True when every filtered row is selected (header checkbox checked). */
	allSelected(): boolean;
	/** True when some but not all are selected (header checkbox indeterminate). */
	someSelected(): boolean;
	selectedIds(): string[];
	/** Selected rows resolved against the current filtered set. */
	selectedItems(): T[];

	// column visibility
	columns: GridColumn[];
	isVisible(columnKey: string): boolean;
	showColumn(columnKey: string): void;
	hideColumn(columnKey: string): void;
	toggleColumn(columnKey: string): void;
	visibleColumns(): GridColumn[];

	// paging
	pageSizes: number[];
	/** Set page size and jump back to the first page. */
	setPageSize(size: number): void;
	/** Go to a page index, clamped to [0, pageCount-1]. */
	goto(index: number): void;
	next(): void;
	prev(): void;
	hasNext(): boolean;
	hasPrev(): boolean;
	/** A clamped, current-centered window of page indices (default span 5). */
	pageWindow(span?: number): number[];
}

/** Headless data-grid state machine (selection, columns, paging) over collection(). */
export function dataGrid<T>(source: () => readonly T[], options?: DataGridOptions<T>): DataGrid<T>;
