import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, el, when, mount } from "../qrp/index.js";

test("when renders the then branch and swaps to else on flip", () => {
	const s = state({ on: true });
	const view = el("div", {}, when(
		() => s.on,
		() => el("span", { class: "then" }, "THEN"),
		() => el("span", { class: "else" }, "ELSE")
	));

	assert.equal(view.querySelector(".then").textContent, "THEN");
	assert.equal(view.querySelector(".else"), null);

	s.on = false;
	assert.equal(view.querySelector(".then"), null);
	assert.equal(view.querySelector(".else").textContent, "ELSE");

	s.on = true;
	assert.equal(view.querySelector(".then").textContent, "THEN");
});

test("when with no else renders nothing when falsy", () => {
	const s = state({ on: false });
	const view = el("div", {}, when(() => s.on, () => el("span", {}, "hi")));

	assert.equal(view.querySelector("span"), null);

	s.on = true;
	assert.equal(view.querySelector("span").textContent, "hi");
});

test("when passes the truthy value to the branch (presence guard)", () => {
	const s = state({ user: null });
	const view = el("div", {}, when(
		() => s.user,
		(user) => el("span", {}, `hi ${user.name}`),
		() => el("span", {}, "logged out")
	));

	assert.equal(view.querySelector("span").textContent, "logged out");

	s.user = { name: "R2" };
	assert.equal(view.querySelector("span").textContent, "hi R2");
});

test("when disposes the old branch's effects on flip (no leak)", () => {
	const s = state({ on: true, n: 0 });
	let thenRuns = 0;

	// building the tree installs the branch effect; we assert on thenRuns
	el("div", {}, when(
		() => s.on,
		() => el("span", {}, () => { thenRuns++; return String(s.n); })
	));

	assert.equal(thenRuns, 1);

	s.n = 1;
	assert.equal(thenRuns, 2); // then-branch effect is live

	s.on = false; // flip away — dispose the then branch
	const runsAtFlip = thenRuns;

	s.n = 2; // must NOT re-run the disposed then-branch effect
	assert.equal(thenRuns, runsAtFlip);
});

test("when does not rebuild the branch while truthiness is stable", () => {
	const s = state({ on: true, label: "a" });
	let builds = 0;

	const view = el("div", {}, when(
		() => s.on,
		() => { builds++; return el("span", {}, () => s.label); }
	));

	assert.equal(builds, 1);

	// a truthy → truthy change of an unrelated key must not rebuild the branch
	s.label = "b";
	assert.equal(builds, 1);
	assert.equal(view.querySelector("span").textContent, "b"); // updated in place
});

test("when branch effects dispose with their mount", () => {
	const s = state({ on: true, n: 0 });
	let runs = 0;

	const parent = document.createElement("div");
	const app = mount(parent, (v) => {
		v.appendChild(el("div", {}, when(() => s.on, () => el("span", {}, () => { runs++; return String(s.n); }))));
	});

	assert.equal(runs, 1);
	s.n = 1;
	assert.equal(runs, 2);

	app.dispose();
	s.n = 2;
	assert.equal(runs, 2); // no leak after unmount
});
