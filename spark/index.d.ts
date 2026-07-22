/**
 * @module spark
 * A charting *primitive*: data in, a reactive `el()` `<svg>` out (line / area /
 * bar). No tooltips/legends/interaction — the sparkline/mini-chart 80%. Pass
 * `() => series` for a live chart. Composes `scale`; enabled by SVG-aware `el`.
 *
 * **Colour & theming:** the mark uses `stroke` (default `"currentColor"`), so it
 * inherits the surrounding text colour and works in any theme — set `color` on a
 * parent, or pass `stroke`/`fill`. A single-point (or perfectly flat) series
 * renders centered, not pinned to the corner.
 *
 * **`axis: true`** draws only a **baseline rule** (a `<line>` in `currentColor` at
 * low opacity) — no tick labels; this is a primitive, not an axis component. For
 * labelled ticks, add your own `<text>` (see `scale.ticks`) or a caption next to
 * the chart.
 */

export interface SparkOptions {
	kind?: "line" | "area" | "bar";
	width?: number;
	height?: number;
	padding?: number;
	/** key or accessor for x (default: array index). */
	x?: string | ((d: any, i: number) => number);
	/** key or accessor for y (default: the number itself, or `d.y`). */
	y?: string | ((d: any, i: number) => number);
	stroke?: string;
	fill?: string;
	strokeWidth?: number;
	dots?: boolean;
	/** Draw a baseline rule (currentColor, low opacity). No tick labels. */
	axis?: boolean;
	class?: string;
}

/** Data → a reactive `<svg>` mini-chart. Pass `() => data` to make it live. */
export function spark(source: (() => readonly any[]) | readonly any[], opts?: SparkOptions): SVGElement;
