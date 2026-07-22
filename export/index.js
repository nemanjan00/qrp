/**
 * export/index.js — "get this data out": toCSV / download / copy. Zero-dep,
 * pairs with table/collection (`download(toCSV(view.filtered(), columns), …)`).
 * Every dashboard needs it; nobody should hand-roll CSV escaping again.
 */

const escapeCell = (value) => {
	const s = value == null ? "" : String(value);

	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
};

// Normalize a column spec to { label, value }. A string is a key; an object may
// give { key, label?, value?/accessor? } (matches table's field descriptors).
const normalizeColumn = (column) => {
	if(typeof column === "string") {
		return { label: column, value: (row) => row[column] };
	}

	return {
		label: column.label != null ? column.label : column.key,
		value: column.value || column.accessor || ((row) => row[column.key])
	};
};

/**
 * Rows → a CSV string (RFC-4180 quoting). `columns` is a list of key strings or
 * `{ key, label?, value? }` descriptors; omitted, it uses the first row's keys.
 */
export const toCSV = (rows, columns) => {
	const source = columns && columns.length ? columns : Object.keys(rows[0] || {});
	const cols = source.map(normalizeColumn);
	const header = cols.map((c) => escapeCell(c.label)).join(",");
	const body = rows.map((row) => cols.map((c) => escapeCell(c.value(row))).join(",")).join("\r\n");

	return rows.length ? `${header}\r\n${body}` : header;
};

/** Trigger a browser download of `content` (string or Blob) as `filename`. */
export const download = (content, filename, type = "text/csv;charset=utf-8") => {
	const blob = content instanceof Blob ? content : new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");

	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
};

/** Copy text to the clipboard; returns the clipboard promise. */
export const copy = (text) => navigator.clipboard.writeText(text);
