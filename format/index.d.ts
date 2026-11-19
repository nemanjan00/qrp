/**
 * @module format
 * Intl-backed pure formatters for dashboards — zero-dep, safe in reactive
 * bindings (nullish/NaN → ""). `num`, `compact`, `pct`, `bytes`, `duration`,
 * `relTime`, `date`, plus SI/engineering notation `si` and its inverse
 * `parseSI` ("2.4G", "100m", "3.3 kV") for instrument/IoT/latency readouts
 * and numeric inputs. Each formatter takes optional Intl options.
 */

/** A plain number: `num(1234.5)` → "1,234.5". */
export function num(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string;
/** Compact notation: `compact(43373)` → "43.4K". */
export function compact(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string;
/** Percent of a 0–1 ratio: `pct(0.13)` → "13%". */
export function pct(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string;
/** Human bytes (base 1024): `bytes(1536)` → "1.5 KB". */
export function bytes(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string;
/** Human duration from milliseconds: `duration(87*864e5)` → "2.9 months". */
export function duration(ms: number | null | undefined, opts?: Intl.NumberFormatOptions): string;
/** Relative time vs now: `relTime(iso)` → "2 hours ago". */
export function relTime(value: Date | string | number | null | undefined, opts?: Intl.RelativeTimeFormatOptions): string;
/** A date/time: `date(iso)` → "Jul 17, 2026". */
export function date(value: Date | string | number | null | undefined, opts?: Intl.DateTimeFormatOptions): string;
/**
 * Engineering notation with an SI prefix: `si(0.0012, "V")` → "1.2 mV",
 * `si(433.92e6, "Hz")` → "433.92 MHz", `si(1500)` → "1.5 k". The prefix is
 * picked after rounding (999.9996 → "1 k"). Defaults to 3 fraction digits.
 */
export function si(value: number | null | undefined, unit?: string, opts?: Intl.NumberFormatOptions): string;
/**
 * Parse a number with an optional SI prefix — the inverse of `si`:
 * `parseSI("2.4G")` → 2.4e9, `parseSI("3.3 kV", "V")` → 3300. Prefixes are
 * case-sensitive (m = milli, M = mega); "u"/"μ" read as µ, "K" as k. Returns
 * NaN when the text isn't a number (check with `Number.isFinite`).
 */
export function parseSI(text: string | number | null | undefined, unit?: string): number;
