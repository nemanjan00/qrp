import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state } from "../qrp/index.js";
import { html } from "../html/index.js";

test("html() from a plain string builds a DOM node", () => {
	const node = html("<div class='card'>hi</div>");

	assert.equal(node.tagName, "DIV");
	assert.equal(node.className, "card");
	assert.equal(node.textContent, "hi");
});

test("html`` interpolates a static text hole (escaped)", () => {
	const title = "R2 & D2";
	const node = html`<h1>${title}</h1>`;

	assert.equal(node.tagName, "H1");
	assert.equal(node.textContent, "R2 & D2");
	// escaped as text, not parsed as markup
	assert.equal(node.querySelector("*"), null);
});

test("html`` string hole is escaped, not injected as markup", () => {
	const evil = "<img src=x onerror=hack>";
	const node = html`<div>${evil}</div>`;

	assert.equal(node.querySelector("img"), null); // no element created
	assert.equal(node.textContent, evil);          // shown as literal text
});

test("html`` reactive text hole updates", () => {
	const s = state({ n: 1 });
	const node = html`<span>${() => `n=${s.n}`}</span>`;

	assert.equal(node.textContent, "n=1");

	s.n = 5;
	assert.equal(node.textContent, "n=5");
});

test("html`` attribute hole applies a value", () => {
	const node = html`<a href=${"/go"}>link</a>`;

	assert.equal(node.getAttribute("href"), "/go");
});

test("html`` reactive attribute hole updates", () => {
	const s = state({ cls: "a" });
	const node = html`<div class=${() => s.cls}></div>`;

	assert.equal(node.className, "a");

	s.cls = "b";
	assert.equal(node.className, "b");
});

test("html`` on* hole wires an event listener", () => {
	let clicks = 0;
	const node = html`<button onclick=${() => { clicks++; }}>x</button>`;

	node.click();
	assert.equal(clicks, 1);
});

test("html`` inserts a Node hole as-is", () => {
	const child = html`<b>bold</b>`;
	const node = html`<p>see ${child}</p>`;

	assert.equal(node.querySelector("b"), child);
	assert.equal(node.textContent, "see bold");
});
