import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { onChange, scoped, state } from "../qrp/index.js";

test("onChange calls back on change, not for the initial value", () => {
	const s = state({ a: 1 });
	const calls = [];

	onChange(() => s.a, (next, previous) => calls.push([next, previous]));
	s.a = 2;
	s.a = 2;
	s.a = 3;
	assert.deepEqual(calls, [[2, 1], [3, 2]]);
});

test("onChange immediate also runs for the initial value", () => {
	const s = state({ a: 1 });
	const calls = [];

	onChange(() => s.a, (next, previous) => calls.push([next, previous]), { immediate: true });
	assert.deepEqual(calls, [[1, undefined]]);
});

test("onChange tracks only the source, never what the callback reads", () => {
	const s = state({ key: "x", data: 0 });
	let runs = 0;

	onChange(() => s.key, () => {
		runs += 1;
		return s.data;
	});
	s.key = "y";
	s.data = 1;
	s.data = 2;
	assert.equal(runs, 1);
});

test("onChange honours a custom equals", () => {
	const s = state({ list: [1, 2] });
	let runs = 0;

	onChange(() => [...s.list], () => {
		runs += 1;
	}, { equals: (a, b) => a.join() === b.join() });
	s.list = [1, 2];
	assert.equal(runs, 0);
	s.list = [1, 2, 3];
	assert.equal(runs, 1);
});

test("onChange stops with its scope or handle", () => {
	const s = state({ a: 1 });
	let runs = 0;
	const owned = scoped(() => onChange(() => s.a, () => {
		runs += 1;
	}));

	s.a = 2;
	owned.dispose();
	s.a = 3;
	assert.equal(runs, 1);

	const handle = onChange(() => s.a, () => {
		runs += 1;
	});

	handle.dispose();
	s.a = 4;
	assert.equal(runs, 1);
});
