import test from "node:test";
import assert from "node:assert/strict";
import { deltas, rate, rolling, bucket, downsample } from "../timeseries/index.js";

const pts = (ys, step = 1000) => ys.map((y, i) => ({ x: i * step, y }));

test("deltas + rate", () => {
	assert.deepEqual(deltas(pts([1, 3, 6])).map((p) => p.y), [2, 3]);
	assert.deepEqual(rate(pts([0, 10], 1000)).map((p) => p.y), [10]); // 10 over 1s
});

test("rolling average", () => {
	assert.deepEqual(rolling(pts([2, 4, 6]), 2).map((p) => p.y), [2, 3, 5]);
});

test("bucket by interval (mean)", () => {
	const b = bucket(pts([1, 3, 10, 20], 1000), 2000); // buckets [0,2s)->{1,3}, [2s,4s)->{10,20}
	assert.deepEqual(b.map((p) => p.y), [2, 15]);
});

test("downsample keeps endpoints + hits threshold", () => {
	const big = pts(Array.from({ length: 1000 }, (_, i) => Math.sin(i / 20)));
	const d = downsample(big, 100);
	assert.equal(d.length, 100);
	assert.equal(d[0].x, big[0].x);
	assert.equal(d[d.length - 1].x, big[big.length - 1].x);
	assert.deepEqual(downsample(big, 5000), big); // under threshold → unchanged length
});
