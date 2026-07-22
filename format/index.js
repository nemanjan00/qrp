/**
 * format/index.js — Intl-backed pure formatters for dashboards.
 *
 * Zero-dependency (Intl is built into the platform), pure, and impossible to get
 * subtly wrong by hand. Every function returns "" for nullish/NaN input so it's
 * safe straight inside a reactive binding (`() => num(row.value)`), and takes an
 * optional Intl options object to override defaults. Locale is the runtime
 * default; pass `{ ... }` (or a full Intl instance upstream) to pin one.
 */

const nf = (opts) => new Intl.NumberFormat(undefined, opts);
const bad = (value) => value == null || (typeof value === "number" && Number.isNaN(value));
const toDate = (value) => (value instanceof Date ? value : new Date(value));

/** A plain number: `num(1234.5)` → "1,234.5". Pass Intl.NumberFormat options. */
export const num = (value, opts = {}) => (bad(value) ? "" : nf(opts).format(value));

/** Compact notation: `compact(43373)` → "43.4K". */
export const compact = (value, opts = {}) =>
	num(value, { notation: "compact", maximumFractionDigits: 1, ...opts });

/** Percent of a 0–1 ratio: `pct(0.13)` → "13%". */
export const pct = (value, opts = {}) =>
	(bad(value) ? "" : nf({ style: "percent", maximumFractionDigits: 0, ...opts }).format(value));

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/** Human bytes (base 1024): `bytes(1536)` → "1.5 KB". */
export const bytes = (value, opts = {}) => {
	if(bad(value)) { return ""; }

	const sign = value < 0 ? -1 : 1;
	let n = Math.abs(value);
	let unit = 0;

	while(n >= 1024 && unit < BYTE_UNITS.length - 1) {
		n /= 1024;
		unit += 1;
	}

	return `${num(sign * n, { maximumFractionDigits: unit === 0 ? 0 : 1, ...opts })} ${BYTE_UNITS[unit]}`;
};

// [Intl unit identifier, milliseconds] — all sanctioned Intl units, largest first.
const SPANS = [
	["year", 31536e6], ["month", 2592e6], ["week", 6048e5], ["day", 864e5],
	["hour", 36e5], ["minute", 6e4], ["second", 1e3]
];

const largestSpan = (ms) => SPANS.find(([, size]) => Math.abs(ms) >= size) || SPANS[SPANS.length - 1];

/** Human duration from milliseconds: `duration(87*864e5)` → "2.9 months". */
export const duration = (ms, opts = {}) => {
	if(bad(ms)) { return ""; }

	const [unit, size] = largestSpan(ms);

	return nf({ style: "unit", unit, unitDisplay: "long", maximumFractionDigits: 1, ...opts }).format(ms / size);
};

/** Relative time vs now (Intl.RelativeTimeFormat): `relTime(iso)` → "2 hours ago". */
export const relTime = (value, opts = {}) => {
	if(value == null) { return ""; }

	const diff = toDate(value).getTime() - Date.now();
	const [unit, size] = largestSpan(diff);

	return new Intl.RelativeTimeFormat(undefined, { numeric: "auto", ...opts }).format(Math.round(diff / size), unit);
};

/** A date/time (Intl.DateTimeFormat): `date(iso)` → "Jul 17, 2026". */
export const date = (value, opts = { dateStyle: "medium" }) =>
	(value == null ? "" : new Intl.DateTimeFormat(undefined, opts).format(toDate(value)));
