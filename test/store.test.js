import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { effect, list, el, mount, scoped, state } from "../qrp/index.js";
import { assign, append, coalesce } from "../store/index.js";

test("assign writes only changed keys, in one batch", () => {
	const shared = [1];
	const s = state({ a: 1, b: shared, c: "x" });
	let aRuns = 0;
	let both = 0;

	effect(() => {
		aRuns += 1;
		return s.a;
	});
	effect(() => {
		both += 1;
		return [s.b, s.c];
	});

	const changed = assign(s, { a: 1, b: shared, c: "y" });

	assert.deepEqual(changed, ["c"]);
	assert.equal(aRuns, 1);
	assert.equal(both, 2);
});

test("assign adds new keys and prunes missing ones on request", () => {
	const s = state({ a: 1, gone: true });

	assign(s, { b: 2 });
	assert.deepEqual(Object.keys(s).sort(), ["a", "b", "gone"]);
	assert.deepEqual(assign(s, { a: 1, b: 2 }, { prune: true }), ["gone"]);
	assert.deepEqual(Object.keys(s).sort(), ["a", "b"]);
});

test("append caps a feed and reconciles a list once", () => {
	const s = state({ feed: [1, 2, 3] });
	let lengthRuns = 0;

	effect(() => {
		lengthRuns += 1;
		return s.feed.length;
	});
	append(s.feed, [4, 5], 4);
	assert.deepEqual([...s.feed], [2, 3, 4, 5]);
	assert.equal(lengthRuns, 2);
	append(s.feed, 6, 4);
	assert.deepEqual([...s.feed], [3, 4, 5, 6]);
});

test("append keeps a keyed list() in step", () => {
	const s = state({ feed: [{ id: 1 }, { id: 2 }] });
	const root = document.createElement("ul");
	const mounted = mount(root, () => list(() => s.feed, (x) => x.id, (x) => el("li", {}, String(x.id))));

	append(s.feed, [{ id: 3 }, { id: 4 }], 3);
	assert.equal(root.textContent, "234");
	mounted.dispose();
});

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("coalesce applies the latest value per key once per interval", () => {
	const live = state({ v1: 0, v2: 0 });
	let runs = 0;

	effect(() => {
		runs += 1;
		return [live.v1, live.v2];
	});

	const values = coalesce(live, { interval: 10 });

	[1, 2, 3].forEach((n) => values.set("v1", n));
	values.set("v2", 9);
	assert.equal(live.v1, 0);

	return tick(25).then(() => {
		assert.deepEqual([live.v1, live.v2], [3, 9]);
		assert.equal(runs, 2);
		values.set("v1", 3);

		return tick(25);
	}).then(() => assert.equal(runs, 2));
});

test("coalesce flush() is immediate and dispose drops pending values", () => {
	const live = state({ v: 0 });
	const owned = scoped(() => coalesce(live, { interval: 5 }));

	owned.value.set("v", 1);
	owned.value.flush();
	assert.equal(live.v, 1);
	owned.value.set("v", 2);
	owned.dispose();
	owned.value.set("v", 3);

	return tick(15).then(() => assert.equal(live.v, 1));
});
