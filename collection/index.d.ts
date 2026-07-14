export interface SortState {
	key: string | null;
	/** 1 ascending, -1 descending. */
	dir?: number;
}

export interface PageState {
	index: number;
	/** items per page; 0 = no paging. */
	size: number;
}

export interface CollectionOptions<T> {
	sort?: SortState;
	page?: PageState;
	filter?: Record<string, any>;
	filterFn?: (item: T, filter: Record<string, any>) => boolean;
	compare?: (a: T, b: T, sort: SortState) => number;
}

export interface Collection<T> {
	sort: SortState;
	filter: Record<string, any>;
	page: PageState;
	/** Reactive: sorted → filtered → paged items. Feed to list(). */
	items(): T[];
	/** Count after filtering (before paging). */
	total(): number;
	/** Number of pages at the current size. */
	pageCount(): number;
	/** Toggle sort direction on the same key, else sort by it ascending. */
	toggleSort(key: string): void;
}

/** Reactive sort / filter / paginate over a dataset. */
export function collection<T>(source: () => readonly T[], options?: CollectionOptions<T>): Collection<T>;
