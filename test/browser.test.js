import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { effect } from "../qrp/index.js";
import { persisted, query, media, viewport, online } from "../browser/index.js";

test("persisted loads defaults and writes through to localStorage", () => {
	localStorage.clear();

	const store = persisted("prefs", { theme: "dark" });

	assert.equal(store.theme, "dark");

	store.theme = "light";

	assert.equal(JSON.parse(localStorage.getItem("prefs")).theme, "light");
});

test("persisted restores an existing value over the default", () => {
	localStorage.clear();
	localStorage.setItem("prefs2", JSON.stringify({ theme: "solarized" }));

	const store = persisted("prefs2", { theme: "dark" });

	assert.equal(store.theme, "solarized");
});

test("query reflects the URL and is reactive", () => {
	history.replaceState(null, "", "/?q=droids");

	const params = query();

	let seen;
	effect(() => { seen = params.q; });

	assert.equal(seen, "droids");

	params.q = "jawas";

	assert.equal(seen, "jawas");
	assert.match(location.search, /q=jawas/);
});

test("media wraps matchMedia matches", () => {
	const m = media("(min-width: 600px)");

	assert.equal(typeof m.matches, "boolean");
});

test("viewport exposes width and height", () => {
	const v = viewport();

	assert.equal(typeof v.width, "number");
	assert.equal(typeof v.height, "number");
});

test("online reflects navigator.onLine", () => {
	const o = online();

	assert.equal(o.online, navigator.onLine);
});
