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
 *
 * **Recipe — multiple series on a shared scale** (actual-vs-target,
 * before-vs-after). `spark()` is deliberately single-series; the multi-line 80%
 * chart is a short composition in the same idiom — a static `el()` `<svg>`
 * skeleton, one reactive `points` binding per series over a *shared* y-domain,
 * and `list()` for grid lines keyed by tick value:
 * @example
 * const SERIES = [{ key: "total", stroke: "var(--c1)" }, { key: "balance", stroke: "var(--c2)" }];
 * const chart = (data, w = 240, h = 60) => {          // data: () => [{ x, total, balance }]
 *   const yDomain = () => {                           // SHARED across all series
 *     const ys = data().flatMap((d) => SERIES.map((s) => d[s.key]));
 *     return [Math.min(...ys), Math.max(...ys)];
 *   };
 *   const sx = (d) => linear([data()[0]?.x ?? 0, data().at(-1)?.x ?? 1], [0, w])(d);
 *   const sy = (v) => linear(yDomain(), [h, 0])(v);
 *   const pts = (key) => () => data().map((d) => `${sx(d.x)},${sy(d[key])}`).join(" ");
 *   return el("svg", { viewBox: `0 0 ${w} ${h}` },
 *     list(() => ticks(yDomain(), 4), (t) => t, (t) =>            // grid, keyed by value
 *       el("line", { x1: 0, x2: w, y1: () => sy(t), y2: () => sy(t), stroke: "currentColor", opacity: 0.1 })),
 *     ...SERIES.map((s) => el("polyline", { points: pts(s.key), fill: "none", stroke: s.stroke, "stroke-width": 1.5 })));
 * };
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
