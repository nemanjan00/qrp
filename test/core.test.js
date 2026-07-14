import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, effect, derive, raw, el, mount, scope } from "../qrp/index.js";

test("effect runs once immediately", () => {
	let runs = 0;

	effect(() => { runs++; });

	assert.equal(runs, 1);
});

test("effect re-runs only when a read key changes", () => {
	const s = state({ a: 1, b: 2 });

	let reads = 0;

	effect(() => { s.a; reads++; });

	assert.equal(reads, 1);

	s.b = 99; // not read by the effect

	assert.equal(reads, 1);

	s.a = 2;

	assert.equal(reads, 2);
});

test("setting the same value does not re-trigger", () => {
	const s = state({ a: 1 });

	let reads = 0;

	effect(() => { s.a; reads++; });

	s.a = 1;

	assert.equal(reads, 1);
});

test("nested objects are reactive", () => {
	const s = state({ user: { name: "R2" } });

	let seen;

	effect(() => { seen = s.user.name; });

	assert.equal(seen, "R2");

	s.user.name = "C3PO";

	assert.equal(seen, "C3PO");
});

test("adding a new key triggers iteration effects", () => {
	const s = state({ a: 1 });

	let keys;

	effect(() => { keys = Object.keys(s).length; });

	assert.equal(keys, 1);

	s.b = 2;

	assert.equal(keys, 2);

	delete s.b;

	assert.equal(keys, 1);
});

test("derive produces a reactive computed value", () => {
	const s = state({ first: "Luke", last: "Skywalker" });

	const full = derive(() => `${s.first} ${s.last}`);

	assert.equal(full.value, "Luke Skywalker");

	s.first = "Anakin";

	assert.equal(full.value, "Anakin Skywalker");
});

test("effect.dispose stops re-runs", () => {
	const s = state({ a: 1 });

	let reads = 0;

	const runner = effect(() => { s.a; reads++; });

	s.a = 2;
	assert.equal(reads, 2);

	runner.dispose();

	s.a = 3;
	assert.equal(reads, 2);
});

test("child effects are disposed with their parent", () => {
	const s = state({ outer: 0, inner: 0 });

	let innerRuns = 0;

	const parent = effect(() => {
		s.outer;

		effect(() => { s.inner; innerRuns++; });
	});

	assert.equal(innerRuns, 1);

	s.inner = 1;
	assert.equal(innerRuns, 2);

	// Re-running the parent should dispose the old child, not leak it.
	s.outer = 1;
	assert.equal(innerRuns, 3); // one fresh child ran

	s.inner = 2;
	assert.equal(innerRuns, 4); // only the current child, not two

	parent.dispose();

	s.inner = 3;
	assert.equal(innerRuns, 4); // no leaked children
});

test("raw unwraps a proxy", () => {
	const plain = { a: 1 };
	const s = state(plain);

	assert.equal(raw(s), plain);
});

test("state does not wrap DOM nodes stored inside it", () => {
	const node = document.createElement("div");
	const s = state({ el: node });

	// Must be the exact same node, not a Proxy — branded DOM methods must work.
	assert.equal(s.el, node);

	const parent = document.createElement("section");
	// appendChild would throw "not of type Node" if s.el were a Proxy.
	parent.appendChild(s.el);
	assert.equal(parent.firstChild, node);
});

test("state does not wrap Map/Set instances", () => {
	const map = new Map([["a", 1]]);
	const s = state({ map });

	// .size would throw "incompatible receiver" through a Proxy.
	assert.equal(s.map.size, 1);
	assert.equal(s.map.get("a"), 1);
	assert.equal(s.map, map);
});

test("scope disposes all effects created within it", () => {
	const s = state({ a: 1 });

	let reads = 0;

	const sc = scope(() => {
		effect(() => { s.a; reads++; });
		effect(() => { s.a; reads++; });
	});

	assert.equal(reads, 2);

	s.a = 2;
	assert.equal(reads, 4);

	sc.dispose();

	s.a = 3;
	assert.equal(reads, 4);
});

test("el sets attributes, props and events", () => {
	let clicked = 0;

	const button = el("button", {
		class: "big",
		id: "go",
		onclick: () => { clicked++; }
	}, "Press");

	assert.equal(button.className, "big");
	assert.equal(button.id, "go");
	assert.equal(button.textContent, "Press");

	button.click();
	assert.equal(clicked, 1);
});

test("el reactive text updates on state change", () => {
	const s = state({ n: 1 });

	const span = el("span", {}, () => `n=${s.n}`);

	assert.equal(span.textContent, "n=1");

	s.n = 5;
	assert.equal(span.textContent, "n=5");
});

test("el reactive children list updates", () => {
	const s = state({ items: ["a", "b"] });

	const ul = el("ul", {}, () => s.items.map(i => el("li", {}, i)));

	assert.equal(ul.querySelectorAll("li").length, 2);

	s.items = ["a", "b", "c"];
	assert.equal(ul.querySelectorAll("li").length, 3);
});

test("bind is two-way for text inputs", () => {
	const s = state({ name: "R2" });

	const input = el("input", { type: "text", bind: [s, "name"] });

	assert.equal(input.value, "R2");

	// state -> DOM
	s.name = "D2";
	assert.equal(input.value, "D2");

	// DOM -> state
	input.value = "BB8";
	input.dispatchEvent(new Event("input"));
	assert.equal(s.name, "BB8");
});

test("bind coerces number inputs", () => {
	const s = state({ n: 1 });

	const input = el("input", { type: "number", bind: [s, "n"] });

	input.value = "42";
	input.dispatchEvent(new Event("input"));

	assert.equal(s.n, 42);
	assert.equal(typeof s.n, "number");
});

test("bind handles checkboxes", () => {
	const s = state({ on: false });

	const input = el("input", { type: "checkbox", bind: [s, "on"] });

	assert.equal(input.checked, false);

	s.on = true;
	assert.equal(input.checked, true);

	input.checked = false;
	input.dispatchEvent(new Event("change"));
	assert.equal(s.on, false);
});

test("mount disposes component effects", () => {
	const parent = document.createElement("div");
	const s = state({ n: 0 });

	let reads = 0;

	const app = mount(parent, (view) => {
		view.appendChild(el("span", {}, () => { reads++; return `${s.n}`; }));
	});

	assert.equal(reads, 1);

	s.n = 1;
	assert.equal(reads, 2);

	app.dispose();

	s.n = 2;
	assert.equal(reads, 2); // no leak after unmount
	assert.equal(parent.innerHTML, "");
});
