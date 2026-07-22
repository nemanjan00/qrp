import test from "node:test";
import assert from "node:assert/strict";
import { linear, ordinal, quantize, ticks, palette } from "../scale/index.js";

test("linear maps + clamps", () => {
	assert.equal(linear([0, 100], [0, 300])(50), 150);
	assert.equal(linear([0, 10], [0, 1], { clamp: true })(20), 1);
	assert.equal(linear([5, 5], [0, 1])(5), 0); // zero span → r0
});

test("ordinal lazily assigns + cycles", () => {
	const c = ordinal(["a", "b"]);
	assert.equal(c("x"), "a");
	assert.equal(c("y"), "b");
	assert.equal(c("z"), "a"); // wraps
	assert.equal(c("x"), "a"); // stable per value
});

test("quantize buckets", () => {
	const q = quantize([0, 1], ["low", "mid", "high"]);
	assert.equal(q(0.1), "low");
	assert.equal(q(0.9), "high");
	assert.equal(q(2), "high"); // clamped
});

test("ticks + palette", () => {
	assert.deepEqual(ticks([0, 10], 5), [0, 2, 4, 6, 8, 10]);
	assert.equal(palette.length, 8);
});
