import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { el, effect, onDispose, scoped, state } from "../qrp/index.js";
import { island, reconcile } from "../host/index.js";

test("island renders into a foreign container and re-renders only changed props", () => {
	const box = document.createElement("div");
	let titleRuns = 0;
	const panel = island(box, (p) => el("h3", {}, () => {
		titleRuns += 1;
		return p.title;
	}), { title: "CPU", config: { n: 1 } });

	assert.equal(box.textContent, "CPU");
	panel.update({ title: "CPU", config: { n: 2 } });
	assert.equal(titleRuns, 1);
	panel.update({ title: "CPU %" });
	assert.equal(box.textContent, "CPU %");
	assert.equal("config" in panel.props, false);
	panel.dispose();
	assert.equal(box.childNodes.length, 0);
});

test("island disposes with the scope it was built in", () => {
	const box = document.createElement("div");
	const owned = scoped(() => island(box, () => el("p", {}, "x")));

	assert.equal(box.textContent, "x");
	owned.dispose();
	assert.equal(box.textContent, "");
});

test("reconcile creates, updates, recreates and destroys by key", () => {
	const s = state({ items: [{ id: 1, type: "a", v: 1 }, { id: 2, type: "a", v: 1 }] });
	const log = [];

	const r = reconcile(() => s.items, (x) => x.id, {
		create: (item) => {
			log.push(`create ${item.id}${item.type}`);
			return { id: item.id };
		},
		update: (handle, item) => log.push(`update ${handle.id} v${item.v}`),
		recreate: (prev, next) => prev.type !== next.type,
		destroy: (handle) => log.push(`destroy ${handle.id}`)
	});

	assert.deepEqual(log, ["create 1a", "create 2a"]);
	log.length = 0;
	s.items = [{ id: 1, type: "a", v: 2 }, { id: 2, type: "b", v: 1 }, { id: 3, type: "a", v: 1 }];
	assert.deepEqual(log, ["update 1 v2", "destroy 2", "create 2b", "create 3a"]);
	log.length = 0;
	s.items = [s.items[2]];
	assert.deepEqual(log, ["destroy 1", "destroy 2"]);
	assert.deepEqual([...r.handles().keys()], [3]);
	r.dispose();
	assert.deepEqual(log, ["destroy 1", "destroy 2", "destroy 3"]);
});

test("reconcile tracks only the source, owns per-item effects, and skips equal items", () => {
	const s = state({ items: [{ id: 1 }], other: 0 });
	const item = s.items[0];
	let creates = 0;
	let innerRuns = 0;
	let cleaned = 0;

	reconcile(() => s.items, (x) => x.id, {
		create: () => {
			creates += 1;
			effect(() => {
				innerRuns += 1;
				return s.other;
			});
			onDispose(() => {
				cleaned += 1;
			});
		},
		update: () => assert.fail("same item must not update")
	});

	s.items = [item];
	s.other = 1;
	assert.equal(creates, 1);
	assert.equal(innerRuns, 2);
	s.items = [];
	assert.equal(cleaned, 1);
	s.other = 2;
	assert.equal(innerRuns, 2);
});

test("reconcile is torn down with its enclosing scope, islands included", () => {
	const s = state({ panes: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });
	const grid = document.createElement("div");
	const owned = scoped(() => reconcile(() => s.panes, (p) => p.id, {
		create: (pane) => {
			const body = document.createElement("section");

			grid.appendChild(body);

			return { body, panel: island(body, (p) => el("h3", {}, () => p.pane.title), { pane }) };
		},
		update: (widget, pane) => widget.panel.update({ pane }),
		destroy: (widget) => widget.body.remove()
	}));

	assert.equal(grid.textContent, "AB");
	s.panes = [{ id: "a", title: "A2" }, s.panes[1]];
	assert.equal(grid.textContent, "A2B");
	owned.dispose();
	assert.equal(grid.childNodes.length, 0);
	s.panes = [{ id: "c", title: "C" }];
	assert.equal(grid.childNodes.length, 0);
});

test("reconcile warns on a duplicate key and keeps the first", () => {
	const warn = console.warn;
	const warnings = [];

	console.warn = (message) => warnings.push(message);

	try {
		const r = reconcile(() => [{ id: 1, v: "first" }, { id: 1, v: "second" }], (x) => x.id, { create: (x) => x.v });

		assert.equal(r.handles().get(1), "first");
		assert.equal(warnings.length, 1);
		r.dispose();
	} finally {
		console.warn = warn;
	}
});
