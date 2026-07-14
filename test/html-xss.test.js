import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state } from "../qrp/index.js";
import { html } from "../html/index.js";

// What "XSS-safe" means for qrp's html, stated as executable attack vectors.
//
// GUARANTEE: an interpolated value in TEXT position (a child hole, ${} or #{})
// is rendered as a text node — it can never inject an element, script, or event
// handler, no matter what string it contains.
//
// BOUNDARY (documented, tested below, NOT auto-sanitized): a value in ATTRIBUTE
// position is set as that attribute's value verbatim (via setAttribute /
// property, never re-parsed as HTML — so it can't break out into a new
// attribute or tag). qrp does NOT sanitize URL schemes: a `javascript:` value
// in an href passes through, same as lit-html/Lit. Don't put untrusted data in
// href/src/style without your own check.

// --- text holes: element/script injection is impossible --------------------

test("<script> in a ${} text hole is inert text, not an element", () => {
	const payload = "<script>window.__pwned = 1;</script>";
	const node = html`<div>${payload}</div>`;

	assert.equal(node.querySelector("script"), null);
	assert.equal(node.textContent, payload);       // shown literally
	assert.equal(globalThis.__pwned, undefined);   // never executed
});

test("<img onerror> in a ${} text hole cannot create an element", () => {
	const node = html`<div>${"<img src=x onerror=alert(1)>"}</div>`;

	assert.equal(node.querySelector("img"), null);
	assert.match(node.textContent, /<img/);        // escaped, literal
});

test("html.template #{field} escapes an element payload as text", () => {
	const tpl = html.template("<div><p>#{bio}</p></div>");
	const node = tpl({ bio: "<script>evil()</script><b>x</b>" });

	assert.equal(node.querySelector("script"), null);
	assert.equal(node.querySelector("b"), null);
	assert.match(node.querySelector("p").textContent, /<script>evil/);
});

test("html.template is reactive AND escaping holds on update", () => {
	const data = state({ msg: "safe" });
	const node = html.template("<span>#{msg}</span>")(data);

	assert.equal(node.textContent, "safe");
	data.msg = "<img src=x onerror=alert(1)>";
	assert.equal(node.querySelector("img"), null);
	assert.match(node.textContent, /<img/);
});

// --- attribute holes: no breakout into new attributes/tags -----------------

test("an unquoted attribute hole cannot break out into a new attribute", () => {
	// If this were string-concatenated into markup, `x` could add an event
	// handler. qrp sets it as the single attribute VALUE, so it can't.
	const node = html`<div class=${"foo onmouseover=alert(1)"}></div>`;

	assert.equal(node.getAttribute("onmouseover"), null);      // no new attr
	assert.equal(node.className, "foo onmouseover=alert(1)");  // it's just the class value
});

test("template #{field} in an unquoted attribute cannot break out", () => {
	const tpl = html.template("<div class=#{cls}></div>");
	const node = tpl({ cls: "a b\" onclick=\"evil()" });

	assert.equal(node.getAttribute("onclick"), null);
	// the whole payload is the class value, not re-parsed
	assert.ok(node.className.includes("evil()"));
});

// --- documented BOUNDARY: URL schemes are NOT sanitized --------------------

test("BOUNDARY: a javascript: URL in an href passes through verbatim (not sanitized)", () => {
	// This is the documented limit of the guarantee: attribute values are set
	// as-is. qrp does not sanitize URL schemes (neither does Lit). If this test
	// ever starts failing because we added scheme filtering, update the docs.
	const node = html`<a href=${"javascript:alert(1)"}>x</a>`;

	assert.equal(node.getAttribute("href"), "javascript:alert(1)");
});
