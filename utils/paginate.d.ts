/** Return the slice of `array` for a zero-based page (size 0 = a copy of all). */
export function paginate<T>(array: readonly T[], index: number, size: number): T[];
/** Number of pages for `total` items at `size` per page. */
export function pageCount(total: number, size: number): number;
