/**
 * @module spark
 * A charting *primitive*: data in, a reactive `el()` `<svg>` out (line / area /
 * bar). No tooltips/legends/interaction — the sparkline/mini-chart 80%. Pass
 * `() => series` for a live chart. Composes `scale`; enabled by SVG-aware `el`.
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
	axis?: boolean;
	class?: string;
}

/** Data → a reactive `<svg>` mini-chart. Pass `() => data` to make it live. */
export function spark(source: (() => readonly any[]) | readonly any[], opts?: SparkOptions): SVGElement;
