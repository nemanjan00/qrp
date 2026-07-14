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
	sortable?: boolean;
	/** Sort by the formatter output instead of the raw value. */
	sortByFormatted?: boolean;
	thClass?: string;
	tdClass?: string;
}

export interface TableOptions<T> {
	rows: (() => readonly T[]) | readonly T[];
	fields: Column<T>[];
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

/** The table element, with `.view` exposing the underlying collection. */
export type TableElement<T> = HTMLTableElement & { view: Collection<T> };

/** Build a declarative, sortable, keyed, paginated data table. */
export function table<T>(options: TableOptions<T>): TableElement<T>;
