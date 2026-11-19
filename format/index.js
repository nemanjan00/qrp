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

// A default maximumFractionDigits that never undercuts the caller's
// minimumFractionDigits (Intl throws a RangeError when min > max).
const maxFraction = (fallback, opts) => Math.max(fallback, opts.minimumFractionDigits ?? 0);

// The fraction digits a value will actually be shown with: the caller's
// explicit maximumFractionDigits, else the (widened) default.
const shownDigits = (fallback, opts) => opts.maximumFractionDigits ?? maxFraction(fallback, opts);

// `n` rounded exactly as Intl will display it, so a unit can be picked after rounding.
const rounded = (n, digits) =>
	Number(new Intl.NumberFormat("en", { useGrouping: false, maximumFractionDigits: digits }).format(n));

/** A plain number: `num(1234.5)` → "1,234.5". Pass Intl.NumberFormat options. */
export const num = (value, opts = {}) => (bad(value) ? "" : nf(opts).format(value));

/** Compact notation: `compact(43373)` → "43.4K". */
export const compact = (value, opts = {}) =>
	num(value, { notation: "compact", maximumFractionDigits: maxFraction(1, opts), ...opts });

/** Percent of a 0–1 ratio: `pct(0.13)` → "13%". */
export const pct = (value, opts = {}) =>
	(bad(value) ? "" : nf({ style: "percent", maximumFractionDigits: maxFraction(0, opts), ...opts }).format(value));

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

	const fallback = () => (unit === 0 ? 0 : 1);

	// 1023.96 KB would display as "1,024 KB": step up once rounding reaches 1024.
	if(unit < BYTE_UNITS.length - 1 && rounded(n, shownDigits(fallback(), opts)) >= 1024) {
		n /= 1024;
		unit += 1;
	}

	return `${num(sign * n, { maximumFractionDigits: maxFraction(fallback(), opts), ...opts })} ${BYTE_UNITS[unit]}`;
};

// [Intl unit identifier, milliseconds] — all sanctioned Intl units, largest first.
const SPANS = [
	["year", 31536e6], ["month", 2592e6], ["week", 6048e5], ["day", 864e5],
	["hour", 36e5], ["minute", 6e4], ["second", 1e3]
];

// The largest unit `ms` fills — judged after rounding to `digits`, so 59.99 s
// shown with 1 digit is "1 minute", not "60 seconds".
const largestSpan = (ms, digits) => {
	const found = SPANS.findIndex(([, size]) => Math.abs(ms) >= size);
	const i = found === -1 ? SPANS.length - 1 : found;
	const size = SPANS[i][1];

	return i > 0 && rounded(Math.abs(ms) / size, digits) * size >= SPANS[i - 1][1] ? SPANS[i - 1] : SPANS[i];
};

/** Human duration from milliseconds: `duration(87*864e5)` → "2.9 months". */
export const duration = (ms, opts = {}) => {
	if(bad(ms)) { return ""; }

	const [unit, size] = largestSpan(ms, shownDigits(1, opts));

	return nf({ style: "unit", unit, unitDisplay: "long", maximumFractionDigits: maxFraction(1, opts), ...opts }).format(ms / size);
};

/** Relative time vs now (Intl.RelativeTimeFormat): `relTime(iso)` → "2 hours ago". */
export const relTime = (value, opts = {}) => {
	const time = value == null ? NaN : toDate(value).getTime();

	if(!Number.isFinite(time)) { return ""; }

	const diff = time - Date.now();
	const [unit, size] = largestSpan(diff, 0);

	return new Intl.RelativeTimeFormat(undefined, { numeric: "auto", ...opts }).format(Math.round(diff / size), unit);
};

/** A date/time (Intl.DateTimeFormat): `date(iso)` → "Jul 17, 2026". */
export const date = (value, opts = { dateStyle: "medium" }) => {
	const when = value == null ? null : toDate(value);

	return when && Number.isFinite(when.getTime()) ? new Intl.DateTimeFormat(undefined, opts).format(when) : "";
};

// SI prefixes by power of ten. "µ" (U+00B5) is the one si() writes; parseSI()
// also reads "u", Greek "μ" and "K" (as in "10K"), the spellings people type.
const SI_PREFIXES = [
	["f", -15], ["p", -12], ["n", -9], ["µ", -6], ["m", -3], ["", 0],
	["k", 3], ["M", 6], ["G", 9], ["T", 12], ["P", 15]
];
const SI_ALIASES = { u: "µ", "μ": "µ", K: "k" };
const SI_POWER = new Map(SI_PREFIXES);
const SI_MIN = -15;
const SI_MAX = 15;

// A number (optionally signed with "-", "+" or the typographic minus,
// optionally with an exponent), then whatever follows it.
const SI_NUMBER = /^([+\-−]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(.*)$/i;

const prefixFor = (power) => SI_PREFIXES.find(([, p]) => p === power)[0];

/**
 * Engineering notation with an SI prefix: `si(0.0012, "V")` → "1.2 mV",
 * `si(433.92e6, "Hz")` → "433.92 MHz", `si(1500)` → "1.5 k". Picks the prefix
 * after rounding, so 999.9996 shows as "1 k", not "1,000". Defaults to 3
 * fraction digits; pass Intl.NumberFormat options to change it.
 * @param {number} value in base units
 * @param {string} [unit] base unit appended after the prefix ("V", "Hz", "s")
 * @param {Intl.NumberFormatOptions} [opts]
 * @returns {string}
 */
export const si = (value, unit = "", opts = {}) => {
	if(bad(value) || !Number.isFinite(value)) { return ""; }

	const digits = shownDigits(3, opts);
	const magnitude = value === 0 ? 0 : Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
	const first = Math.min(SI_MAX, Math.max(SI_MIN, magnitude));
	// rounding can carry into the next prefix (999.9996 k → 1 M)
	const power = first < SI_MAX && Math.abs(rounded(value / 10 ** first, digits)) >= 1000 ? first + 3 : first;
	const shown = num(value / 10 ** power, { maximumFractionDigits: maxFraction(3, opts), ...opts });
	const suffix = prefixFor(power) + unit;

	return suffix ? `${shown} ${suffix}` : shown;
};

/**
 * Parse a number typed with an optional SI prefix — the inverse of si():
 * `parseSI("2.4G")` → 2.4e9, `parseSI("100m")` → 0.1, `parseSI("3.3 kV", "V")`
 * → 3300, `parseSI("-5 mV", "V")` → -0.005. With `unit`, a trailing unit is
 * optional ("3.3k" also parses). Prefixes are case-sensitive (m = milli,
 * M = mega); "u"/"μ" read as µ and "K" as k. Returns NaN for anything else,
 * so `Number.isFinite(parseSI(input))` is the validity check.
 * @param {string|number} text
 * @param {string} [unit]
 * @returns {number}
 */
export const parseSI = (text, unit = "") => {
	if(typeof text === "number") { return text; }
	if(typeof text !== "string") { return NaN; }

	const match = SI_NUMBER.exec(text.trim());

	if(!match) { return NaN; }

	const rest = match[2].trim();
	const prefix = unit && rest.endsWith(unit) ? rest.slice(0, -unit.length).trim() : rest;
	const power = SI_POWER.get(SI_ALIASES[prefix] || prefix);

	if(power === undefined) { return NaN; }

	const [mantissa, exponent = "0"] = match[1].replace("−", "-").split(/e/i);

	return Number(`${mantissa}e${Number(exponent) + power}`);
};
