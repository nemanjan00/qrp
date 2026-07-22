/**
 * @module format
 * Intl-backed pure formatters for dashboards — zero-dep, safe in reactive
 * bindings (nullish/NaN → ""). `num`, `compact`, `pct`, `bytes`, `duration`,
 * `relTime`, `date`. Each takes optional Intl options.
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
