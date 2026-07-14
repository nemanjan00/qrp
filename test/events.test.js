import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, effect } from "../qrp/index.js";
import { emitter, bus, fromEvent, broadcast } from "../events/index.js";

test("emitter on/emit delivers payloads", () => {
	const e = emitter();

	let got;
	e.on("ping", payload => { got = payload; });

	e.emit("ping", { n: 1 });

	assert.deepEqual(got, { n: 1 });
});

test("off unsubscribes", () => {
	const e = emitter();

	let count = 0;
	const off = e.on("ping", () => { count++; });

	e.emit("ping");
	off();
	e.emit("ping");

	assert.equal(count, 1);
});

test("once resolves on the next event", async () => {
	const e = emitter();

	const p = e.once("ready");
	e.emit("ready", "go");

	assert.equal(await p, "go");
});

test("request/respond round-trips through the bus", async () => {
	const e = emitter();

	e.respond("add", ({ a, b }) => a + b);

	const result = await e.request("add", { a: 2, b: 3 });

	assert.equal(result, 5);
});

test("request rejects on responder error", async () => {
	const e = emitter();

	e.respond("boom", () => { throw new Error("nope"); });

	await assert.rejects(() => e.request("boom", {}), /nope/);
});

test("request times out with no responder", async () => {
	const e = emitter();

	await assert.rejects(() => e.request("silence", {}, { timeout: 20 }), /timed out/);
});

test("fromEvent turns bus events into reactive state", () => {
	const last = fromEvent(bus, "user:login", u => u.name, "nobody");

	let seen;
	effect(() => { seen = last.value; });

	assert.equal(seen, "nobody");

	bus.emit("user:login", { name: "Nemanja" });

	assert.equal(seen, "Nemanja");
});

test("broadcast mirrors state changes onto an emitter", () => {
	const e = emitter();

	const store = state({ value: 0 });

	const seen = [];
	e.on("count", v => seen.push(v));

	broadcast(e, "count", store);

	store.value = 1;
	store.value = 2;

	// initial effect run emits 0, then 1, then 2
	assert.deepEqual(seen, [0, 1, 2]);
});
