import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { define, el } from "../qrp/index.js";

test("define registers a working custom element without classes", () => {
	define("qrp-greeting", (host, attrs) => {
		host.appendChild(el("p", {}, () => `Hello, ${attrs.name || "world"}`));
	}, { attrs: ["name"] });

	const node = document.createElement("qrp-greeting");
	node.setAttribute("name", "Nemanja");
	document.body.appendChild(node);

	assert.equal(node.querySelector("p").textContent, "Hello, Nemanja");

	// The constructor's prototype chain is HTMLElement — real component proto.
	assert.ok(node instanceof HTMLElement);
});

test("custom element reacts to attribute changes", () => {
	define("qrp-counter-label", (host, attrs) => {
		host.appendChild(el("span", {}, () => `count: ${attrs.count}`));
	}, { attrs: ["count"] });

	const node = document.createElement("qrp-counter-label");
	node.setAttribute("count", "1");
	document.body.appendChild(node);

	assert.equal(node.querySelector("span").textContent, "count: 1");

	node.setAttribute("count", "2");

	assert.equal(node.querySelector("span").textContent, "count: 2");
});

test("custom element disposes its scope on disconnect", () => {
	define("qrp-throwaway", (host, attrs) => {
		host.appendChild(el("span", {}, () => attrs.label));
	}, { attrs: ["label"] });

	const node = document.createElement("qrp-throwaway");
	node.setAttribute("label", "hi");
	document.body.appendChild(node);

	assert.equal(node.querySelector("span").textContent, "hi");

	node.remove();

	assert.equal(node.innerHTML, "");
});
