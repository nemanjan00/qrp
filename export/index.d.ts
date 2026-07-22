/**
 * @module export
 * "Get this data out" — `toCSV` / `download` / `copy`. Zero-dep, pairs with
 * table/collection: `download(toCSV(view.filtered(), columns), "data.csv")`.
 */

export type ExportColumn =
	| string
	| { key: string; label?: string; value?: (row: any) => unknown; accessor?: (row: any) => unknown };

/** Rows → a CSV string (RFC-4180 quoting). Columns default to the first row's keys. */
export function toCSV(rows: readonly any[], columns?: readonly ExportColumn[]): string;
/** Trigger a browser download of `content` (string or Blob) as `filename`. */
export function download(content: string | Blob, filename: string, type?: string): void;
/** Copy text to the clipboard; returns the clipboard promise. */
export function copy(text: string): Promise<void>;
