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

test("browser factories clean up their listeners on scope dispose", async () => {
	const { scope } = await import("../qrp/index.js");

	let added = 0;
	let removed = 0;
	const realAdd = window.addEventListener;
	const realRemove = window.removeEventListener;
	window.addEventListener = function(...args) { added++; return realAdd.apply(this, args); };
	window.removeEventListener = function(...args) { removed++; return realRemove.apply(this, args); };

	try {
		const sc = scope(() => {
			viewport();
			online(); // online + offline = 2 window listeners
		});

		assert.ok(added >= 3, `expected listeners added, got ${added}`);

		sc.dispose();

		assert.equal(removed, added, "every added listener should be removed on dispose");
	} finally {
		window.addEventListener = realAdd;
		window.removeEventListener = realRemove;
	}
});
