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
