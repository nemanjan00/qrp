import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, el } from "../qrp/index.js";
import { html, ref } from "../html/index.js";

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

// --- ref(): inject a live value into a plain string ------------------------

test("ref() lets a plain string embed a real node", () => {
	const link = el("a", { href: "/x" }, "go");
	const node = html("<div>see " + ref(link) + "</div>");

	assert.equal(node.querySelector("a"), link); // same node, not stringified
	assert.equal(node.textContent, "see go");
});

test("ref() in a plain string wires a reactive binding", () => {
	const s = state({ n: 1 });
	const node = html("<span>" + ref(() => `n=${s.n}`) + "</span>");

	assert.equal(node.textContent, "n=1");
	s.n = 7;
	assert.equal(node.textContent, "n=7");
});

test("ref() in an attribute position", () => {
	const node = html("<a href=" + ref("/dest") + ">link</a>");

	assert.equal(node.getAttribute("href"), "/dest");
});

// --- html.template(): storable #{} templates -------------------------------

test("html.template fills #{field} from a data object (escaped)", () => {
	const tpl = html.template("<div><h1>#{name}</h1><p>#{bio}</p></div>");
	const node = tpl({ name: "R2 & D2", bio: "<b>astromech</b>" });

	assert.equal(node.querySelector("h1").textContent, "R2 & D2");
	// escaped as text, not parsed as markup
	assert.equal(node.querySelector("p").textContent, "<b>astromech</b>");
	assert.equal(node.querySelector("p b"), null);
});

test("html.template is reactive when filled with qrp state", () => {
	const tpl = html.template("<span>#{title}</span>");
	const data = state({ title: "one" });
	const node = tpl(data);

	assert.equal(node.textContent, "one");
	data.title = "two";
	assert.equal(node.textContent, "two");
});

test("html.template supports dotted paths and attribute fields", () => {
	const tpl = html.template("<a href='#{link.href}'>#{link.label}</a>");
	const node = tpl({ link: { href: "/go", label: "Go" } });

	assert.equal(node.getAttribute("href"), "/go");
	assert.equal(node.textContent, "Go");
});

test("html.template compiles once, fills many times independently", () => {
	const tpl = html.template("<li>#{name}</li>");
	const a = tpl({ name: "alice" });
	const b = tpl({ name: "bob" });

	assert.equal(a.textContent, "alice");
	assert.equal(b.textContent, "bob");
	assert.notEqual(a, b); // fresh DOM each call
});
