/**
 * @module timeseries
 * Pure math over time-series points `{ x, y }` (x = ms, y = value) — `deltas`,
 * `rate`, `rolling`, `bucket`, `downsample` (LTTB), plus `mean`/`sum`. Zero-dep;
 * pairs with `spark`.
 */

export interface Point { x: number; y: number; }

export function mean(ys: readonly number[]): number;
export function sum(ys: readonly number[]): number;
/** Successive differences (length n-1). */
export function deltas(points: readonly Point[]): Point[];
/** Per-second rate of change between samples (length n-1). */
export function rate(points: readonly Point[]): Point[];
/** Trailing moving average over the last `window` points (same length). */
export function rolling(points: readonly Point[], window: number): Point[];
/** Group into fixed `interval`-ms buckets, aggregating y (default mean). */
export function bucket(points: readonly Point[], interval: number, agg?: (ys: number[]) => number): Point[];
/** Downsample to ~`threshold` points via Largest-Triangle-Three-Buckets. */
export function downsample(points: readonly Point[], threshold: number): Point[];
