import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, reactive, raw, el, mount } from "../qrp/index.js";

test("reactive node: function assignment becomes a live binding", () => {
	const s = state({ n: 1 });

	const span = reactive(document.createElement("span"));
	span.textContent = () => `count: ${s.n}`;

	assert.equal(raw(span).textContent, "count: 1");

	s.n = 5;
	assert.equal(raw(span).textContent, "count: 5");
});

test("reactive node: plain assignment sets once", () => {
	const div = reactive(document.createElement("div"));
	div.className = "big";

	assert.equal(raw(div).className, "big");
});

test("reactive node: on* assignment adds a listener", () => {
	let clicks = 0;

	const button = reactive(document.createElement("button"));
	button.onclick = () => { clicks++; };

	raw(button).click();
	assert.equal(clicks, 1);
});

test("reactive node auto-unwraps when appended via qrp", () => {
	const s = state({ label: "hi" });

	const child = reactive(document.createElement("span"));
	child.textContent = () => s.label;

	// el() appends it — must not throw and must attach the real node.
	const parent = el("div", {}, child);

	assert.equal(parent.querySelector("span").textContent, "hi");

	s.label = "bye";
	assert.equal(parent.querySelector("span").textContent, "bye");
});

test("reactive node bindings dispose with their mount", () => {
	const s = state({ n: 0 });

	const parent = document.createElement("div");

	const app = mount(parent, (view) => {
		const span = reactive(document.createElement("span"));
		span.textContent = () => `${s.n}`;
		view.appendChild(raw(span));
	});

	s.n = 1;
	assert.equal(parent.querySelector("span").textContent, "1");

	app.dispose();

	s.n = 2;
	// after dispose the binding is gone; DOM was cleared by mount
	assert.equal(parent.innerHTML, "");
});

test("reactive node methods stay bound to the node", () => {
	const el1 = reactive(document.createElement("div"));

	// append is a real DOM method; must not lose `this`.
	el1.append(document.createElement("span"));

	assert.equal(raw(el1).querySelectorAll("span").length, 1);
});
