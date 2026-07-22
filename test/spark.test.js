import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../qrp/index.js";
import { spark } from "../spark/index.js";

const SVG_NS = "http://www.w3.org/2000/svg";

test("spark line → svg with a path", () => {
	const svg = spark([1, 3, 2, 5], { kind: "line" });
	assert.equal(svg.namespaceURI, SVG_NS);
	assert.ok(svg.querySelector("path").getAttribute("d").startsWith("M"));
});

test("spark is reactive to its source thunk", () => {
	const s = state({ data: [1, 2] });
	const svg = spark(() => s.data);
	const before = svg.querySelector("path").getAttribute("d");
	s.data = [1, 50, 1];
	assert.notEqual(svg.querySelector("path").getAttribute("d"), before);
});

test("spark bar → one rect per point", () => {
	assert.equal(spark([1, 2, 3], { kind: "bar" }).querySelectorAll("rect").length, 3);
});

test("spark empty data → empty path (no crash)", () => {
	assert.equal(spark([], {}).querySelector("path").getAttribute("d"), "");
});

test("a single point renders centered, not in the corner", () => {
	const svg = spark([5], { kind: "line", dots: true, width: 200, height: 100 });
	const dot = svg.querySelector("circle");
	// centered: ~width/2, ~height/2 (not padding/bottom-left)
	assert.ok(Math.abs(Number(dot.getAttribute("cx")) - 100) < 1, "cx centered");
	assert.ok(Math.abs(Number(dot.getAttribute("cy")) - 50) < 1, "cy centered");
});

test("a flat series sits on the vertical middle", () => {
	const svg = spark([7, 7, 7], { kind: "line", dots: true, height: 100 });
	const cys = [...svg.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cy")));
	cys.forEach((cy) => assert.ok(Math.abs(cy - 50) < 1, "flat → vertical middle"));
});
