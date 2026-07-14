import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { effect, el } from "../qrp/index.js";
import { portal } from "../behaviors/portal.js";
import { dismissable } from "../behaviors/dismissable.js";
import { trapFocus } from "../behaviors/trap-focus.js";
import { anchored } from "../behaviors/anchored.js";
import { disclosure } from "../behaviors/disclosure.js";
import { busyWhile } from "../behaviors/busy-while.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const key = (name, extra = {}) => Object.assign(new Event("keydown", { bubbles: true }), { key: name, ...extra });

// --- portal -----------------------------------------------------------------

test("portal moves a node to a target and dispose removes it", () => {
	const node = el("div", {}, "hi");
	const target = document.createElement("section");
	document.body.appendChild(target);

	const dispose = portal(node, target);
	assert.equal(node.parentNode, target);

	dispose();
	assert.equal(node.parentNode, null);
});

// --- dismissable ------------------------------------------------------------

test("dismissable fires on Escape", () => {
	const node = el("div", {});
	document.body.appendChild(node);

	let dismissed = 0;
	const dispose = dismissable(node, () => { dismissed++; });

	document.dispatchEvent(key("Escape"));
	assert.equal(dismissed, 1);

	dispose();
	document.dispatchEvent(key("Escape"));
	assert.equal(dismissed, 1); // no longer listening
});

test("dismissable fires on outside pointerdown but not inside", async () => {
	const node = el("div", {}, el("button", {}, "inside"));
	document.body.appendChild(node);

	let dismissed = 0;
	const dispose = dismissable(node, () => { dismissed++; });

	await tick(); // outside listener attaches on next tick

	// inside: no dismiss
	node.querySelector("button").dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.equal(dismissed, 0);

	// outside: dismiss
	document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
	assert.equal(dismissed, 1);

	dispose();
});

// --- trapFocus --------------------------------------------------------------

test("trapFocus focuses the first focusable and restores on dispose", () => {
	const before = el("input", { type: "text" });
	document.body.appendChild(before);
	before.focus();

	const modal = el("div", {}, el("button", {}, "a"), el("button", {}, "b"));
	document.body.appendChild(modal);

	const dispose = trapFocus(modal);
	assert.equal(document.activeElement, modal.querySelectorAll("button")[0]);

	dispose();
	assert.equal(document.activeElement, before); // focus restored
});

test("trapFocus wraps Tab from last to first", () => {
	const modal = el("div", {}, el("button", {}, "a"), el("button", {}, "b"));
	document.body.appendChild(modal);

	trapFocus(modal);
	const [first, last] = modal.querySelectorAll("button");

	last.focus();
	modal.dispatchEvent(key("Tab"));
	assert.equal(document.activeElement, first);
});

// --- anchored ---------------------------------------------------------------

test("anchored positions the floating element (fixed) and dispose is a fn", () => {
	const trigger = el("button", {}, "open");
	const floating = el("div", {}, "menu");
	document.body.appendChild(trigger);
	document.body.appendChild(floating);

	const dispose = anchored(trigger, floating);
	assert.equal(floating.style.position, "fixed");
	assert.equal(typeof dispose, "function");
	assert.equal(typeof dispose.update, "function");

	dispose();
});

// --- disclosure -------------------------------------------------------------

test("disclosure toggles reactive state and wires aria", () => {
	const d = disclosure(false);

	let seen;
	effect(() => { seen = d.state.open; });
	assert.equal(seen, false);

	const trigger = el("button", {});
	const panel = el("div", {});
	d.connect(trigger, panel);

	assert.equal(trigger.getAttribute("aria-expanded"), "false");
	assert.equal(panel.hidden, true);

	trigger.click();
	assert.equal(seen, true);
	assert.equal(trigger.getAttribute("aria-expanded"), "true");
	assert.equal(panel.hidden, false);
});

// --- busyWhile --------------------------------------------------------------

test("busyWhile tracks in-flight promises reactively", () => {
	const b = busyWhile();
	assert.equal(b.active, false);

	let resolve;
	const p = b.run(new Promise((r) => { resolve = r; }));
	assert.equal(b.state.pending, 1);
	assert.equal(b.active, true);

	resolve();
	return p.then(() => {
		assert.equal(b.state.pending, 0);
		assert.equal(b.active, false);
	});
});
