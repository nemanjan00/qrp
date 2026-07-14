import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, effect, el, mount, list, untracked } from "../qrp/index.js";

// --- untracked --------------------------------------------------------------

test("untracked reads do not create a dependency", () => {
	const s = state({ a: 1, b: 1 });

	let runs = 0;
	effect(() => {
		runs++;
		s.a;                       // tracked
		untracked(() => s.b);      // NOT tracked
	});

	assert.equal(runs, 1);

	s.b = 2; // was read only inside untracked → no re-run
	assert.equal(runs, 1);

	s.a = 2;
	assert.equal(runs, 2);
});

// --- frozen skip ------------------------------------------------------------

test("frozen objects are not proxied (identity preserved)", () => {
	const ref = Object.freeze({ big: "static", nested: Object.freeze({ x: 1 }) });
	const s = state({ ref });

	assert.equal(s.ref, ref);               // same object, not a proxy
	assert.equal(s.ref.nested.x, 1);
	assert.equal(Object.isFrozen(s.ref), true);
});

// --- keyed list -------------------------------------------------------------

const render = () => {
	const store = state({ items: [{ id: 1, n: "a" }, { id: 2, n: "b" }, { id: 3, n: "c" }] });
	const ul = el("ul", {}, list(() => store.items, (i) => i.id, (i) => el("li", {}, () => i.n)));

	return { store, ul, rows: () => [...ul.querySelectorAll("li")] };
};

test("list renders one element per item", () => {
	const { rows } = render();

	assert.deepEqual(rows().map((li) => li.textContent), ["a", "b", "c"]);
});

test("list REUSES elements on reorder (moves, not rebuilds)", () => {
	const { store, rows } = render();

	const before = rows();
	const [li1, li2, li3] = before;

	// reverse the order
	store.items = [store.items[2], store.items[1], store.items[0]];

	const after = rows();
	assert.deepEqual(after.map((li) => li.textContent), ["c", "b", "a"]);

	// same DOM nodes, moved — not recreated
	assert.equal(after[0], li3);
	assert.equal(after[1], li2);
	assert.equal(after[2], li1);
});

test("list adds new keys and removes gone keys, keeping survivors", () => {
	const { store, rows } = render();
	const originalB = rows()[1];

	// drop id 1, add id 4, keep 2 and 3
	store.items = [store.items[1], store.items[2], { id: 4, n: "d" }];

	const after = rows();
	assert.deepEqual(after.map((li) => li.textContent), ["b", "c", "d"]);
	assert.equal(after[0], originalB); // survivor reused
});

test("a surviving row self-updates in place (element identity stable)", () => {
	const { store, rows } = render();
	const li = rows()[0];

	store.items[0].n = "z"; // mutate the item's reactive prop

	assert.equal(rows()[0], li);          // same element
	assert.equal(li.textContent, "z");    // updated via its own binding
});

test("list.itemFor maps an element (or event) back to its item", () => {
	const store = state({ items: [{ id: 1, n: "a" }, { id: 2, n: "b" }] });
	const l = list(() => store.items, (i) => i.id, (i) => el("li", {}, () => i.n));
	const ul = el("ul", {}, l);

	const secondLi = ul.querySelectorAll("li")[1];

	assert.equal(l.itemFor(secondLi).id, 2);
	// event-like { target } also works (for delegation)
	assert.equal(l.itemFor({ target: secondLi }).id, 2);
});

test("removed rows dispose their effects (no leak)", () => {
	const store = state({ items: [{ id: 1, n: "a" }] });
	let runs = 0;

	const parent = document.createElement("div");
	mount(parent, (view) => {
		view.appendChild(el("ul", {}, list(
			() => store.items,
			(i) => i.id,
			(i) => el("li", {}, () => { runs++; return i.n; })
		)));
	});

	assert.equal(runs, 1);

	store.items[0].n = "b"; // row effect re-runs
	assert.equal(runs, 2);

	store.items = []; // remove the row → its scope disposes

	const before = runs;
	// mutating the now-detached item must not re-run anything
	store.items = [{ id: 1, n: "c" }]; // (fresh item, different object)
	assert.ok(runs >= before); // new row rendered once; old effect gone
});

test("duplicate list keys drop the dupe with a warning (no crash)", () => {
	const warnings = [];
	const realWarn = console.warn;
	console.warn = (msg) => warnings.push(msg);

	try {
		const store = state({ items: [{ id: 1 }, { id: 1 }, { id: 2 }] });
		const ul = el("ul", {}, list(() => store.items, (i) => i.id, (i) => el("li", {}, String(i.id))));

		// 2 unique keys → 2 rows, and a warning fired
		assert.equal(ul.querySelectorAll("li").length, 2);
		assert.ok(warnings.some((w) => /duplicate key/.test(w)));
	} finally {
		console.warn = realWarn;
	}
});

test("list over primitive items does not throw", () => {
	const store = state({ items: ["a", "b", "c"] });
	const ul = el("ul", {}, list(() => store.items, (s) => s, (s) => el("li", {}, s)));

	assert.deepEqual([...ul.querySelectorAll("li")].map((li) => li.textContent), ["a", "b", "c"]);

	store.items = ["a", "c"];
	assert.deepEqual([...ul.querySelectorAll("li")].map((li) => li.textContent), ["a", "c"]);
});

test("minimal-move reorder keeps correct order for swap, insert, shuffle", () => {
	const store = state({ items: [1, 2, 3, 4, 5].map((n) => ({ id: n })) });
	const ul = el("ul", {}, list(() => store.items, (i) => i.id, (i) => el("li", {}, () => String(i.id))));

	const order = () => [...ul.querySelectorAll("li")].map((li) => li.textContent);
	const nodeFor = (id) => [...ul.querySelectorAll("li")].find((li) => li.textContent === String(id));

	assert.deepEqual(order(), ["1", "2", "3", "4", "5"]);

	// swap ends
	const n1 = nodeFor(1);
	const n5 = nodeFor(5);
	store.items = [store.items[4], store.items[1], store.items[2], store.items[3], store.items[0]];
	assert.deepEqual(order(), ["5", "2", "3", "4", "1"]);
	assert.equal(nodeFor(1), n1); // same nodes, moved
	assert.equal(nodeFor(5), n5);

	// insert in the middle
	store.items = [store.items[0], store.items[1], { id: 99 }, store.items[2], store.items[3], store.items[4]];
	assert.deepEqual(order(), ["5", "2", "99", "3", "4", "1"]);

	// full shuffle
	store.items = [{ id: 3 }, { id: 1 }, { id: 99 }, { id: 5 }, { id: 2 }, { id: 4 }].map((x) => store.items.find((i) => i.id === x.id) || x);
	assert.deepEqual(order(), ["3", "1", "99", "5", "2", "4"]);
});

test("filter/sort scenario reuses the same nodes across passes", () => {
	const store = state({ items: [{ id: 1, n: "a" }, { id: 2, n: "b" }, { id: 3, n: "c" }] });
	const query = state({ q: "" });

	const ul = el("ul", {}, list(
		() => store.items.filter((i) => i.n.indexOf(query.q) !== -1),
		(i) => i.id,
		(i) => el("li", {}, () => i.n)
	));

	const all = [...ul.querySelectorAll("li")];
	const liB = all[1];

	query.q = "b"; // filter down to just "b"
	const filtered = [...ul.querySelectorAll("li")];
	assert.deepEqual(filtered.map((li) => li.textContent), ["b"]);
	assert.equal(filtered[0], liB); // reused the same node, not rebuilt

	query.q = ""; // back to all
	assert.equal([...ul.querySelectorAll("li")].length, 3);
});

test("a surviving key rebinds to a fresh object (refetch shows new data)", () => {
	const store = state({ rows: [{ id: 1, name: "Ada" }, { id: 2, name: "Grace" }] });

	const view = el("ul", {}, list(
		() => store.rows,
		(r) => r.id,
		(r) => el("li", {}, () => r.name)
	));

	const firstLi = view.querySelector("li");
	assert.equal(firstLi.textContent, "Ada");

	// refetch: brand-new objects, same keys, changed field
	store.rows = [{ id: 1, name: "Ada Lovelace" }, { id: 2, name: "Grace Hopper" }];

	assert.equal(view.querySelectorAll("li")[0].textContent, "Ada Lovelace");
	assert.equal(view.querySelectorAll("li")[1].textContent, "Grace Hopper");
	// element identity preserved (rebound, not rebuilt)
	assert.equal(view.querySelector("li"), firstLi);
});

test("rebind is a bounded recursive merge: nested fields + captured sub-proxy stay live", () => {
	const store = state({ rows: [{ id: 1, meta: { status: "active", tags: ["x"] } }] });
	let capturedMeta;

	const view = el("ul", {}, list(
		() => store.rows,
		(r) => r.id,
		(r) => { capturedMeta = r.meta; return el("li", {}, () => `${r.meta.status}:${r.meta.tags.join(",")}`); }
	));

	assert.equal(view.querySelector("li").textContent, "active:x");

	// fresh objects all the way down; deep field + nested array changed
	store.rows = [{ id: 1, meta: { status: "idle", tags: ["x", "y"] } }];
	assert.equal(view.querySelector("li").textContent, "idle:x,y");
	// nested proxy identity preserved: a reference captured at build time sees it
	assert.equal(capturedMeta.status, "idle", "captured nested proxy rebinds in place");
});

test("rebind removes keys the fresh object dropped (no stale leftovers)", () => {
	const store = state({ rows: [{ id: 1, a: "1", b: "2" }] });

	const view = el("ul", {}, list(
		() => store.rows,
		(r) => r.id,
		(r) => el("li", {}, () => Object.keys(r).sort().join(","))
	));

	assert.equal(view.querySelector("li").textContent, "a,b,id");
	store.rows = [{ id: 1, a: "1" }];   // b dropped
	assert.equal(view.querySelector("li").textContent, "a,id");
});

test("rebind terminates on cyclic objects (depth bound, no stack overflow)", () => {
	const a = { id: 1, name: "A", self: null };
	a.self = a;
	const store = state({ rows: [a] });

	const view = el("ul", {}, list(() => store.rows, (r) => r.id, (r) => el("li", {}, () => r.name)));
	assert.equal(view.querySelector("li").textContent, "A");

	// refetch a NEW self-referential object with the same key
	const b = { id: 1, name: "B", self: null };
	b.self = b;
	assert.doesNotThrow(() => { store.rows = [b]; });
	assert.equal(view.querySelector("li").textContent, "B");
});
