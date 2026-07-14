import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, el } from "../qrp/index.js";
import { table } from "../table/index.js";

const rows = () => [
	{ id: 1, account: { name: "carol" }, followers: 1200 },
	{ id: 2, account: { name: "alice" }, followers: 300 },
	{ id: 3, account: { name: "bob" }, followers: 90000 }
];

const basic = (extra = {}) => {
	const store = state({ items: rows() });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		fields: [
			{ key: "name", label: "Name", sortable: true, accessor: (i) => i.account.name },
			{ key: "followers", label: "Followers", sortable: true, formatter: (v) => v.toLocaleString(), sortByFormatted: false }
		],
		...extra
	});

	return { store, t, names: () => [...t.querySelectorAll("tbody td:first-child")].map((td) => td.textContent) };
};

test("renders headers from field labels", () => {
	const { t } = basic();

	assert.deepEqual([...t.querySelectorAll("thead th")].map((th) => th.textContent.replace(/[▲▼\s]+$/, "")), ["Name", "Followers"]);
});

test("renders cells via accessor and formatter", () => {
	const { t } = basic();

	assert.deepEqual([...t.querySelectorAll("tbody tr:first-child td")].map((td) => td.textContent), ["carol", "1,200"]);
});

test("clicking a sortable header sorts, and toggles direction", () => {
	const { t, names } = basic();

	const nameTh = t.querySelectorAll("thead th")[0];
	nameTh.click(); // asc by name
	assert.deepEqual(names(), ["alice", "bob", "carol"]);

	nameTh.click(); // desc
	assert.deepEqual(names(), ["carol", "bob", "alice"]);
});

test("numeric sort uses raw value, not string compare", () => {
	const { t, names } = basic();

	// sort by followers ascending: 300, 1200, 90000 → alice, carol, bob
	t.querySelectorAll("thead th")[1].click();
	assert.deepEqual(names(), ["alice", "carol", "bob"]);
});

test("sortByFormatted sorts by the formatted string", () => {
	const store = state({ items: [{ id: 1, n: 2 }, { id: 2, n: 10 }, { id: 3, n: 1 }] });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		fields: [{ key: "n", label: "N", sortable: true, formatter: (v) => "#" + v, sortByFormatted: true }]
	});

	t.querySelector("thead th").click();
	// formatted: "#1","#10","#2" → lexicographic → 1, 10, 2
	assert.deepEqual([...t.querySelectorAll("tbody td")].map((td) => td.textContent), ["#1", "#10", "#2"]);
});

test("render column outputs a custom element", () => {
	const store = state({ items: rows() });
	let clicked;

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		fields: [
			{ key: "name", label: "Name", accessor: (i) => i.account.name },
			{ key: "actions", label: "", render: (item) => el("button", { onclick: () => { clicked = item.id; } }, "Edit") }
		]
	});

	const btn = t.querySelector("tbody tr:first-child td:last-child button");
	assert.equal(btn.textContent, "Edit");
	btn.click();
	assert.equal(clicked, 1);
});

test("rowClass is applied and reactive", () => {
	const store = state({ items: rows() });
	const selected = state({ id: null });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		rowClass: (item) => (selected.id === item.id ? "selected" : ""),
		fields: [{ key: "name", label: "Name", accessor: (i) => i.account.name }]
	});

	assert.equal(t.querySelector("tbody tr").className, "");

	selected.id = 1;
	assert.equal(t.querySelector("tbody tr").className, "selected");
});

test("rows reuse elements across sort (keyed)", () => {
	const { t } = basic();

	const firstRowBefore = t.querySelector("tbody tr"); // carol (id 1)
	t.querySelectorAll("thead th")[0].click(); // sort by name asc → alice first

	// carol's row still exists as the same node, just moved
	const carolCellAfter = [...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "carol");
	assert.equal(carolCellAfter.parentElement, firstRowBefore);
});

test("cells self-update when the row data changes", () => {
	const { store, t } = basic();
	const firstCell = t.querySelector("tbody td");

	store.items = store.items.map((i) => (i.id === 1 ? { ...i, account: { name: "CAROL" } } : i));

	// same column position now shows updated value (new row for changed id)
	const carol = [...t.querySelectorAll("tbody td:first-child")].map((td) => td.textContent);
	assert.ok(carol.includes("CAROL"));
	assert.ok(firstCell); // sanity
});

test("adding a row inserts it and reuses existing row elements", () => {
	const { store, t } = basic();
	const bobCellBefore = [...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "bob");

	store.items = [...store.items, { id: 4, account: { name: "dave" }, followers: 42 }];

	const names = [...t.querySelectorAll("tbody td:first-child")].map((td) => td.textContent);
	assert.ok(names.includes("dave"));
	assert.equal(t.querySelectorAll("tbody tr").length, 4);

	// existing row element preserved (not rebuilt)
	const bobCellAfter = [...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "bob");
	assert.equal(bobCellAfter, bobCellBefore);
});

test("deleting a row removes it and keeps the survivors", () => {
	const { store, t } = basic();
	const carolCellBefore = [...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "carol");

	store.items = store.items.filter((i) => i.id !== 2); // drop alice

	const names = [...t.querySelectorAll("tbody td:first-child")].map((td) => td.textContent);
	assert.deepEqual(names.sort(), ["bob", "carol"]);

	// carol's element survived
	assert.equal([...t.querySelectorAll("tbody td:first-child")].find((td) => td.textContent === "carol"), carolCellBefore);
});

test("toggling filter hides and re-shows rows, reusing elements when shown again", () => {
	const store = state({ items: rows() });
	const filter = state({ q: "" });

	const t = table({
		rows: () => store.items,
		key: (i) => i.id,
		filter,
		filterFn: (item, f) => !f.q || item.account.name.indexOf(f.q) !== -1,
		fields: [{ key: "name", label: "Name", accessor: (i) => i.account.name }]
	});

	assert.equal(t.querySelectorAll("tbody tr").length, 3);
	const bobCell = [...t.querySelectorAll("tbody td")].find((td) => td.textContent === "bob");

	filter.q = "bob"; // hide all but bob
	assert.deepEqual([...t.querySelectorAll("tbody td")].map((td) => td.textContent), ["bob"]);
	assert.equal(t.querySelector("tbody td"), bobCell); // bob's element reused, not rebuilt

	filter.q = ""; // show all again
	assert.equal(t.querySelectorAll("tbody tr").length, 3);
	assert.equal([...t.querySelectorAll("tbody td")].find((td) => td.textContent === "bob"), bobCell);
});

test("exposes the collection controller for pagination", () => {
	const { t } = basic({ page: state({ index: 0, size: 2 }) });

	assert.equal(t.querySelectorAll("tbody tr").length, 2);
	assert.equal(t.view.pageCount(), 2);
	assert.equal(t.view.total(), 3);
});
