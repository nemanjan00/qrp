/**
 * timeseries/index.js — pure math over time-series points, the transforms a
 * metrics dashboard rebuilds by hand. Points are `{ x, y }` (x = time in ms,
 * y = value); every function returns the same shape. Zero-dep. Pairs with spark
 * (`downsample` keeps a 10k-point series from choking the SVG path).
 */

export const mean = (ys) => (ys.length ? ys.reduce((sum, y) => sum + y, 0) / ys.length : 0);
export const sum = (ys) => ys.reduce((total, y) => total + y, 0);

/** Successive differences: `y[i] - y[i-1]`. Length n-1. */
export const deltas = (points) =>
	points.slice(1).map((p, i) => ({ x: p.x, y: p.y - points[i].y }));

/** Per-second rate of change between samples (for counters). Length n-1. */
export const rate = (points) =>
	points.slice(1).map((p, i) => {
		const dt = (p.x - points[i].x) / 1000;

		return { x: p.x, y: dt === 0 ? 0 : (p.y - points[i].y) / dt };
	});

/** Trailing moving average over the last `window` points. Same length. */
export const rolling = (points, window) =>
	points.map((p, i) => {
		const slice = points.slice(Math.max(0, i - window + 1), i + 1);

		return { x: p.x, y: mean(slice.map((q) => q.y)) };
	});

/**
 * Group points into fixed `interval`-ms buckets (by floor(x/interval)),
 * aggregating each bucket's y-values (default mean). x is the bucket start.
 */
export const bucket = (points, interval, agg = mean) => {
	const groups = new Map();

	points.forEach((p) => {
		const key = Math.floor(p.x / interval) * interval;

		if(!groups.has(key)) { groups.set(key, []); }

		groups.get(key).push(p.y);
	});

	return [...groups.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([x, ys]) => ({ x, y: agg(ys) }));
};

/**
 * Downsample to ~`threshold` points with Largest-Triangle-Three-Buckets — keeps
 * the visual shape (peaks/troughs) far better than naive every-Nth sampling.
 * Returns the input unchanged when it's already at/under the threshold.
 */
export const downsample = (points, threshold) => {
	const n = points.length;

	if(threshold >= n || threshold < 3) {
		return points.slice();
	}

	// Numeric kernel — indexed loops are clearest here (and the area math is hot).
	const sampled = [points[0]];
	const bucketSize = (n - 2) / (threshold - 2);
	let a = 0;

	for(let i = 0; i < threshold - 2; i += 1) {
		// mean point of the NEXT bucket (the triangle's far vertex)
		const nextStart = Math.floor((i + 1) * bucketSize) + 1;
		const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
		const nextCount = Math.max(1, nextEnd - nextStart);
		let avgX = 0;
		let avgY = 0;

		for(let j = nextStart; j < nextEnd; j += 1) {
			avgX += points[j].x;
			avgY += points[j].y;
		}

		avgX /= nextCount;
		avgY /= nextCount;

		// pick the point in THIS bucket forming the largest triangle with a & avg
		const curStart = Math.floor(i * bucketSize) + 1;
		const curEnd = Math.floor((i + 1) * bucketSize) + 1;
		const pa = points[a];
		let maxArea = -1;
		let chosen = curStart;

		for(let j = curStart; j < curEnd; j += 1) {
			const area = Math.abs(
				(pa.x - avgX) * (points[j].y - pa.y) - (pa.x - points[j].x) * (avgY - pa.y)
			);

			if(area > maxArea) {
				maxArea = area;
				chosen = j;
			}
		}

		sampled.push(points[chosen]);
		a = chosen;
	}

	sampled.push(points[n - 1]);

	return sampled;
};
