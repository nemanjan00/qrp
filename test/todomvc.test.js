import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, el, mount } from "../qrp/index.js";

// Reproduces the TodoMVC model logic to prove the reactive flows end to end.
const makeStore = () => {
	const store = state({ items: [], seq: 1 });

	return {
		store,
		add: (title) => { store.items = [...store.items, { id: store.seq++, title, done: false }]; },
		remove: (id) => { store.items = store.items.filter(t => t.id !== id); },
		setDone: (id, done) => { store.items = store.items.map(t => t.id === id ? { ...t, done } : t); },
		clearDone: () => { store.items = store.items.filter(t => !t.done); },
		setAll: (done) => { store.items = store.items.map(t => ({ ...t, done })); }
	};
};

test("todo list renders and reacts to add/remove", () => {
	const { store, add, remove } = makeStore();

	const parent = document.createElement("div");

	mount(parent, (view) => {
		view.appendChild(el("ul", {}, () => store.items.map(t => el("li", {}, t.title))));
	});

	assert.equal(parent.querySelectorAll("li").length, 0);

	add("Beep at C3PO");
	add("Fix the compressor");
	assert.equal(parent.querySelectorAll("li").length, 2);

	remove(store.items[0].id);
	assert.equal(parent.querySelectorAll("li").length, 1);
	assert.equal(parent.querySelector("li").textContent, "Fix the compressor");
});

test("active count is reactive", () => {
	const { store, add, setDone } = makeStore();

	const parent = document.createElement("div");

	mount(parent, (view) => {
		view.appendChild(el("span", {}, () => `${store.items.filter(t => !t.done).length} left`));
	});

	add("a");
	add("b");
	assert.equal(parent.querySelector("span").textContent, "2 left");

	setDone(store.items[0].id, true);
	assert.equal(parent.querySelector("span").textContent, "1 left");
});

test("filter shows the right subset", () => {
	const { store, add, setDone } = makeStore();

	add("a");
	add("b");
	setDone(store.items[0].id, true);

	const active = store.items.filter(t => !t.done);
	const completed = store.items.filter(t => t.done);

	assert.equal(active.length, 1);
	assert.equal(completed.length, 1);
	assert.equal(completed[0].title, "a");
});

test("clear completed and toggle all", () => {
	const { store, add, setAll, clearDone } = makeStore();

	add("a");
	add("b");

	setAll(true);
	assert.equal(store.items.every(t => t.done), true);

	clearDone();
	assert.equal(store.items.length, 0);
});
