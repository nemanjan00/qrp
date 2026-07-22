/**
 * @module scale
 * Micro scales for charts — `linear`, `ordinal`, `quantize`, `ticks`, and a
 * colourblind-safe categorical `palette`. Pure, zero-dep; pairs with `spark`.
 */

/** Map numeric domain [d0,d1] onto range [r0,r1]. `{ clamp }` bounds the output. */
export function linear(domain: readonly [number, number], range: readonly [number, number], opts?: { clamp?: boolean }): (x: number) => number;
/** Assign values to a cycling range (series → colour), lazily by first-seen order. */
export function ordinal<T>(range: readonly T[], domain?: readonly unknown[]): (value: unknown) => T;
/** Bucket a numeric domain into `range.length` bands. */
export function quantize<T>(domain: readonly [number, number], range: readonly T[]): (x: number) => T;
/** Evenly spaced tick values across [d0,d1] (count+1 points, ends included). */
export function ticks(domain: readonly [number, number], count?: number): number[];
/** Okabe–Ito colourblind-safe categorical palette (8 hues). */
export const palette: string[];
