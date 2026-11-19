import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state } from "../qrp/index.js";
import { collection, searchFilter } from "../collection/index.js";

const ROWS = [
	{ id: 1, name: "disk usage", status: "error", host: "db-1" },
	{ id: 2, name: "cpu", status: "ok", host: "db-2" },
	{ id: 3, name: "disk io", status: "ok", host: "web-1" },
	{ id: 4, name: "backup at 12:30", status: "error", host: "web-2" }
];

const ids = (rows) => rows.map((r) => r.id);

test("searchFilter ANDs case-insensitive terms across fields", () => {
	const filter = state({ q: "DISK error" });
	const view = collection(() => ROWS, { filter, filterFn: searchFilter(["name", "status"]) });

	assert.deepEqual(ids(view.items()), [1]);
	filter.q = "";
	assert.equal(view.items().length, 4);
});

test("searchFilter scopes field:text terms, by exact or prefix label", () => {
	const filter = state({ q: "host:web" });
	const view = collection(() => ROWS, { filter, filterFn: searchFilter(["name", "status", "host"]) });

	assert.deepEqual(ids(view.items()), [3, 4]);
	filter.q = "stat:ok host:db";
	assert.deepEqual(ids(view.items()), [2]);
});

test("searchFilter keeps an unknown field:text as a plain term", () => {
	const filter = state({ q: "12:30" });
	const view = collection(() => ROWS, { filter, filterFn: searchFilter(["name"]) });

	assert.deepEqual(ids(view.items()), [4]);
});

test("searchFilter keeps quoted phrases together", () => {
	const filter = state({ q: "name:\"disk io\"" });
	const view = collection(() => ROWS, { filter, filterFn: searchFilter(["name"]) });

	assert.deepEqual(ids(view.items()), [3]);
});

test("searchFilter takes column descriptors, a label map, and a custom key", () => {
	const filter = state({ search: "machine:web-2" });
	const descriptors = searchFilter([{ key: "host", label: "machine" }], { key: "search" });
	const map = searchFilter({ machine: (r) => r.host }, { key: "search" });

	assert.deepEqual(ids(collection(() => ROWS, { filter, filterFn: descriptors }).items()), [4]);
	assert.deepEqual(ids(collection(() => ROWS, { filter, filterFn: map }).items()), [4]);
});

test("sorted() is filtered and sorted but unpaged", () => {
	const filter = state({ q: "ok" });
	const view = collection(() => ROWS, {
		filter,
		filterFn: searchFilter(["status"]),
		sort: { key: "name", dir: -1 },
		page: { index: 0, size: 1 }
	});

	assert.deepEqual(ids(view.items()), [3]);
	assert.deepEqual(ids(view.sorted()), [3, 2]);
});

test("clearSort cycles asc → desc → off", () => {
	const view = collection(() => ROWS, { clearSort: true });

	view.toggleSort("name");
	assert.deepEqual([view.sort.key, view.sort.dir], ["name", 1]);
	view.toggleSort("name");
	assert.deepEqual([view.sort.key, view.sort.dir], ["name", -1]);
	view.toggleSort("name");
	assert.equal(view.sort.key, null);
	assert.deepEqual(ids(view.items()), [1, 2, 3, 4]);
});

test("without clearSort, toggleSort still flips asc ⇄ desc", () => {
	const view = collection(() => ROWS);

	view.toggleSort("name");
	view.toggleSort("name");
	view.toggleSort("name");
	assert.deepEqual([view.sort.key, view.sort.dir], ["name", 1]);
});
