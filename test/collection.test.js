import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, el, list } from "../qrp/index.js";
import { collection } from "../collection/index.js";

const rows = () => [
	{ id: 1, name: "carol", age: 30 },
	{ id: 2, name: "alice", age: 25 },
	{ id: 3, name: "bob", age: 35 }
];

test("collection sorts by key and direction", () => {
	const source = state({ items: rows() });
	const view = collection(() => source.items, { sort: state({ key: "name", dir: 1 }) });

	assert.deepEqual(view.items().map((r) => r.name), ["alice", "bob", "carol"]);

	view.sort.dir = -1;
	assert.deepEqual(view.items().map((r) => r.name), ["carol", "bob", "alice"]);
});

test("toggleSort flips direction on repeat, resets on new key", () => {
	const source = state({ items: rows() });
	const view = collection(() => source.items, { sort: state({ key: null, dir: 1 }) });

	view.toggleSort("age");
	assert.deepEqual(view.items().map((r) => r.age), [25, 30, 35]);

	view.toggleSort("age"); // same key → desc
	assert.deepEqual(view.items().map((r) => r.age), [35, 30, 25]);

	view.toggleSort("name"); // new key → asc
	assert.deepEqual(view.items().map((r) => r.name), ["alice", "bob", "carol"]);
});

test("collection filters via filterFn + filter state", () => {
	const source = state({ items: rows() });
	const filter = state({ q: "" });
	const view = collection(() => source.items, {
		filter,
		filterFn: (row, f) => row.name.indexOf(f.q) !== -1
	});

	assert.equal(view.items().length, 3);

	filter.q = "a";
	assert.deepEqual(view.items().map((r) => r.name).sort(), ["alice", "carol"]);
	assert.equal(view.total(), 2);
});

test("collection paginates and reports pageCount", () => {
	const source = state({ items: rows() });
	const page = state({ index: 0, size: 2 });
	const view = collection(() => source.items, { page });

	assert.equal(view.items().length, 2);
	assert.equal(view.pageCount(), 2);
	assert.equal(view.total(), 3);

	page.index = 1;
	assert.equal(view.items().length, 1); // last page has the remainder
});

test("collection.items drives a keyed list reactively", () => {
	const source = state({ items: rows() });
	const filter = state({ q: "" });
	const view = collection(() => source.items, {
		sort: state({ key: "name", dir: 1 }),
		filter,
		filterFn: (row, f) => row.name.indexOf(f.q) !== -1
	});

	const ul = el("ul", {}, list(view.items, (r) => r.id, (r) => el("li", {}, () => r.name)));

	assert.deepEqual([...ul.querySelectorAll("li")].map((li) => li.textContent), ["alice", "bob", "carol"]);

	filter.q = "o"; // bob, carol
	assert.deepEqual([...ul.querySelectorAll("li")].map((li) => li.textContent), ["bob", "carol"]);
});
