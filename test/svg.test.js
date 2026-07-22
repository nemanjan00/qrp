import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, el } from "../qrp/index.js";

const SVG_NS = "http://www.w3.org/2000/svg";

test("el() creates SVG tags in the SVG namespace", () => {
	const svg = el("svg", { viewBox: "0 0 100 100" }, el("path", { d: "M0 0 L10 10" }));
	assert.equal(svg.namespaceURI, SVG_NS);
	assert.equal(svg.firstChild.namespaceURI, SVG_NS, "path is SVG-namespaced");
	// SVG attributes go through setAttribute, readable via getAttribute
	assert.equal(svg.getAttribute("viewBox"), "0 0 100 100");
	assert.equal(svg.firstChild.getAttribute("d"), "M0 0 L10 10");
});

test("class on an SVG node uses setAttribute (no className crash)", () => {
	const circle = el("circle", { class: "dot", cx: 5, cy: 5, r: 3 });
	assert.equal(circle.getAttribute("class"), "dot");
	assert.equal(circle.getAttribute("cx"), "5");
});

test("reactive SVG attribute updates", () => {
	const s = state({ y: 0 });
	const line = el("line", { x1: 0, y1: () => s.y, x2: 10, y2: 10 });
	assert.equal(line.getAttribute("y1"), "0");
	s.y = 42;
	assert.equal(line.getAttribute("y1"), "42");
});

test("foreignObject holds HTML-namespaced children", () => {
	const fo = el("foreignObject", {}, el("div", { class: "x" }, "hi"));
	assert.equal(fo.namespaceURI, SVG_NS);
	assert.notEqual(fo.firstChild.namespaceURI, SVG_NS, "div stays HTML");
	assert.equal(fo.firstChild.className, "x", "HTML className still works");
});

test("HTML el() still uses properties (regression)", () => {
	const input = el("input", { value: "hi", class: "field" });
	assert.equal(input.value, "hi");       // property set
	assert.equal(input.className, "field"); // className path
});
