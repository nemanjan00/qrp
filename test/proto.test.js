import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { findProto, wrapMethod, onceOnly, delegate } from "../proto/index.js";

test("findProto walks the chain by constructor name", () => {
	const node = document.createElement("div");

	const proto = findProto(node, "EventTarget");

	assert.ok(proto);
	assert.equal(proto.constructor.name, "EventTarget");
	assert.equal(typeof proto.addEventListener, "function");
});

test("findProto returns undefined for an absent proto", () => {
	assert.equal(findProto({}, "Nonexistent"), undefined);
});

test("wrapMethod replaces and is idempotent", () => {
	const obj = { proto: { greet: () => "hi" } };

	let calls = 0;

	const make = original => function(...args) {
		calls++;
		return original.apply(this, args) + "!";
	};

	wrapMethod(obj.proto, "greet", make);
	assert.equal(obj.proto.greet(), "hi!");

	// second wrap with same tag is a no-op — no double "!!"
	wrapMethod(obj.proto, "greet", make);
	assert.equal(obj.proto.greet(), "hi!");
	assert.equal(calls, 2);
});

test("wrapMethod restore puts the original back", () => {
	const proto = { m: () => 1 };
	const original = proto.m;

	const restore = wrapMethod(proto, "m", orig => () => orig() + 1);

	assert.equal(proto.m(), 2);

	restore();

	assert.equal(proto.m, original);
	assert.equal(proto.m(), 1);
});

test("onceOnly runs a function at most once", () => {
	let n = 0;

	const run = onceOnly(() => { n++; });

	run();
	run();
	run();

	assert.equal(n, 1);
});

test("delegate dispatches to a selector match", () => {
	const root = document.createElement("div");
	root.innerHTML = `<a class="ext" href="#">x</a><a class="int" href="#">y</a>`;
	document.body.appendChild(root);

	let hits = 0;

	const stop = delegate(root, "a.ext", () => { hits++; });

	root.querySelector("a.ext").click();
	root.querySelector("a.int").click();

	assert.equal(hits, 1);

	stop();

	root.querySelector("a.ext").click();
	assert.equal(hits, 1);
});
