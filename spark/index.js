/**
 * spark/index.js — data in, `<svg>` out. A charting *primitive*, not a charting
 * library: pass a series, get back a reactive `el()` SVG (line / area / bar). No
 * tooltips, no legends, no interaction — if you need those, reach for D3; this
 * covers the sparkline/mini-chart 80% a dashboard actually shows. The marks read
 * their data through a thunk, so passing `() => series` makes the chart live.
 * (Enabled by qrp's SVG-namespace-aware `el`.)
 */

import { el } from "../qrp/index.js";
import { linear } from "../scale/index.js";

const accessor = (spec, fallback) => {
	if(typeof spec === "function") { return spec; }
	if(spec == null) { return fallback; }

	return (d) => d[spec];
};

/**
 * @param {Function|Array} source `() => data` (reactive) or a static array
 * @param {object} [opts]
 * @param {"line"|"area"|"bar"} [opts.kind]
 * @param {number} [opts.width] / [opts.height] / [opts.padding]
 * @param {string|Function} [opts.x] key or accessor for x (default: index)
 * @param {string|Function} [opts.y] key or accessor for y (default: the number)
 * @param {string} [opts.stroke] / [opts.fill] / [opts.class]
 * @param {number} [opts.strokeWidth]
 * @param {boolean} [opts.dots] / [opts.axis]
 * @returns {SVGElement} an `el()` `<svg>`
 */
export const spark = (source, opts = {}) => {
	const {
		kind = "line", width = 240, height = 60, padding = 2,
		stroke = "currentColor", fill = "none", strokeWidth = 1.5,
		dots = false, axis = false
	} = opts;

	const getX = accessor(opts.x, (_d, i) => i);
	const getY = accessor(opts.y, (d) => (typeof d === "number" ? d : d.y));
	const read = typeof source === "function" ? source : () => source;

	// project data → [ [screenX, screenY], … ] under the current extents
	const project = () => {
		const data = read() || [];

		if(!data.length) { return []; }

		const xs = data.map((d, i) => getX(d, i));
		const ys = data.map((d, i) => getY(d, i));
		const xScale = linear([Math.min(...xs), Math.max(...xs)], [padding, width - padding]);
		const yScale = linear([Math.min(...ys), Math.max(...ys)], [height - padding, padding]); // svg y grows down

		return data.map((_d, i) => [xScale(xs[i]), yScale(ys[i])]);
	};

	const round = (n) => n.toFixed(2);

	const linePath = () => {
		const pts = project();

		return pts.length ? "M" + pts.map(([px, py]) => `${round(px)},${round(py)}`).join(" L") : "";
	};

	const areaPath = () => {
		const pts = project();

		if(!pts.length) { return ""; }

		const base = height - padding;

		return `M${round(pts[0][0])},${round(base)} `
			+ pts.map(([px, py]) => `L${round(px)},${round(py)}`).join(" ")
			+ ` L${round(pts[pts.length - 1][0])},${round(base)} Z`;
	};

	const bars = () => {
		const data = read() || [];

		if(!data.length) { return []; }

		const ys = data.map((d, i) => getY(d, i));
		const yScale = linear([Math.min(0, ...ys), Math.max(0, ...ys)], [height - padding, padding]);
		const bandWidth = (width - padding * 2) / data.length;
		const zero = yScale(0);

		return data.map((_d, i) => {
			const v = yScale(ys[i]);

			return el("rect", {
				x: round(padding + i * bandWidth + bandWidth * 0.1),
				y: round(Math.min(v, zero)),
				width: round(bandWidth * 0.8),
				height: round(Math.abs(v - zero)),
				fill: stroke
			});
		});
	};

	const marks = [];

	if(kind === "area") {
		marks.push(el("path", { d: () => areaPath(), fill: fill === "none" ? "currentColor" : fill, "fill-opacity": 0.15, stroke: "none" }));
		marks.push(el("path", { d: () => linePath(), fill: "none", stroke, "stroke-width": strokeWidth }));
	} else if(kind === "bar") {
		marks.push(() => bars());
	} else {
		marks.push(el("path", { d: () => linePath(), fill, stroke, "stroke-width": strokeWidth }));
	}

	if(dots) {
		marks.push(() => project().map(([px, py]) => el("circle", { cx: round(px), cy: round(py), r: 2, fill: stroke })));
	}

	if(axis) {
		marks.push(el("line", {
			x1: padding, y1: height - padding, x2: width - padding, y2: height - padding,
			stroke: "currentColor", "stroke-opacity": 0.2
		}));
	}

	return el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, preserveAspectRatio: "none", class: opts.class }, ...marks);
};
