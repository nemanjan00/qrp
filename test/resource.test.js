import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { effect } from "../qrp/index.js";
import { emitter } from "../events/index.js";
import { resource } from "../resource/index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("loads: loading → data, error stays null", async () => {
	const res = resource(() => Promise.resolve([1, 2]), { immediate: false });
	assert.equal(res.data, null);
	const p = res.reload();
	assert.equal(res.loading, true);
	await p;
	assert.deepEqual(res.data, [1, 2]);
	assert.equal(res.loading, false);
	assert.equal(res.error, null);
});

test("captures errors", async () => {
	const res = resource(() => Promise.reject(new Error("boom")), { immediate: false });
	await res.reload();
	assert.equal(res.error.message, "boom");
	assert.equal(res.loading, false);
});

test("data is reactive", async () => {
	const res = resource(() => Promise.resolve(7), { immediate: false });
	let seen;
	effect(() => { seen = res.data; });
	assert.equal(seen, null);
	await res.reload();
	assert.equal(seen, 7);
});

test("refreshOn a bus event reloads", async () => {
	const b = emitter();
	let calls = 0;
	resource(() => { calls += 1; return Promise.resolve(calls); }, { bus: b, refreshOn: "refresh" });
	await tick();
	assert.equal(calls, 1);       // immediate load
	b.emit("refresh");
	await tick();
	assert.equal(calls, 2);       // reloaded on the event
});
