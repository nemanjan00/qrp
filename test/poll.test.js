import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { scoped } from "../qrp/index.js";
import { poll } from "../browser/index.js";

test("immediate runs fn once up front", () => {
	let n = 0;
	const { stop } = poll(() => { n += 1; }, 10000, { immediate: true });
	assert.equal(n, 1);
	stop();
});

test("fires on the interval, and stop() halts it", async () => {
	let n = 0;
	const { stop } = poll(() => { n += 1; }, 10);
	await new Promise((r) => setTimeout(r, 35));
	stop();
	const after = n;
	assert.ok(after >= 1, "fired at least once");
	await new Promise((r) => setTimeout(r, 30));
	assert.equal(n, after, "no more ticks after stop()");
});

test("scope dispose clears the interval", async () => {
	let n = 0;
	const { dispose } = scoped(() => { poll(() => { n += 1; }, 10); });
	dispose();
	const after = n;
	await new Promise((r) => setTimeout(r, 30));
	assert.equal(n, after, "disposed → no ticks");
});
