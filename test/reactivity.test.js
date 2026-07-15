import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, effect, derive, untracked, onEffectError } from "../qrp/index.js";

// These tests pin down qrp's reactivity SEMANTICS — the questions a
// reactivity-literate reader asks first. They are the spec, in code.

// --- diamond: one source → two paths → one sink ----------------------------

test("diamond dependency: sink sees consistent values (may run per-path)", () => {
	const s = state({ a: 1 });
	const b = derive(() => s.a + 1);
	const c = derive(() => s.a + 2);

	const seen = [];
	effect(() => { seen.push(b.value + c.value); });

	// initial: (1+1)+(1+2) = 5
	assert.equal(seen[0], 5);

	s.a = 10;

	// final value must be consistent: (10+1)+(10+2) = 23
	assert.equal(seen[seen.length - 1], 23);

	// qrp is glitch-PRONE by design (synchronous, no scheduler): the sink may
	// run twice (once per derived path). We assert the FINAL value is correct;
	// intermediate glitch values may appear. Documented, not hidden.
});

// --- write to state during an effect ---------------------------------------

test("writing state inside an effect propagates to other effects", () => {
	const s = state({ a: 1, b: 0 });

	// effect 1 derives b from a
	effect(() => { s.b = s.a * 2; });

	let seenB;
	effect(() => { seenB = s.b; });

	assert.equal(seenB, 2);

	s.a = 5;
	assert.equal(seenB, 10); // write-during-effect cascaded
});

test("an effect writing a key it also reads does not self-trigger", () => {
	const s = state({ n: 0 });

	let runs = 0;
	effect(() => {
		runs++;
		// read then write the same key. trigger() skips the currently-active
		// effect, so the write does NOT re-run this effect — it runs exactly
		// once and settles. (This is the safe semantic that prevents self-loops;
		// it also means a reducer-style read+write self-update is a one-shot.)
		if(s.n < 3) {
			s.n = s.n + 1;
		}
	});

	assert.equal(runs, 1);
	assert.equal(s.n, 1);
});

// --- deep mutation during an effect ----------------------------------------

test("mutating a nested object during an effect is reactive", () => {
	const s = state({ user: { name: "R2", tags: [] } });

	let name;
	effect(() => { name = s.user.name; });
	assert.equal(name, "R2");

	s.user.name = "C3PO";
	assert.equal(name, "C3PO");

	// replacing the nested object entirely also tracks
	s.user = { name: "BB8", tags: [] };
	assert.equal(name, "BB8");
});

// --- re-entrancy: effect triggering itself via a dependency ----------------

test("re-entrant trigger during propagation is handled without corruption", () => {
	const s = state({ a: 0, b: 0 });

	const log = [];
	effect(() => { log.push("A:" + s.a); if(s.a === 1) { s.b = s.b + 1; } });
	effect(() => { log.push("B:" + s.b); });

	log.length = 0;
	s.a = 1; // A runs, writes b, which triggers B

	assert.ok(log.includes("A:1"));
	assert.ok(log.some((l) => l.startsWith("B:")));
});

// --- untracked inside effect -----------------------------------------------

test("untracked reads inside an effect are not dependencies", () => {
	const s = state({ tracked: 0, hidden: 0 });

	let runs = 0;
	effect(() => {
		runs++;
		s.tracked;
		untracked(() => s.hidden);
	});

	assert.equal(runs, 1);
	s.hidden = 99;
	assert.equal(runs, 1); // hidden was read untracked → no re-run
	s.tracked = 1;
	assert.equal(runs, 2);
});

// --- array length tracking (CORE-1) ----------------------------------------

test("push triggers effects that read only .length", () => {
	const s = state({ arr: [1, 2] });

	let seen;
	effect(() => { seen = s.arr.length; });
	assert.equal(seen, 2);

	s.arr.push(3);
	assert.equal(seen, 3); // length-only reader updated on push

	s.arr.pop();
	assert.equal(seen, 2);
});

// --- NaN write does not re-trigger (CORE-7) --------------------------------

test("writing NaN over NaN does not re-run effects", () => {
	const s = state({ n: NaN });

	let runs = 0;
	effect(() => { s.n; runs++; });
	assert.equal(runs, 1);

	s.n = NaN;
	assert.equal(runs, 1); // Object.is(NaN, NaN) → no spurious re-run
});

// --- frozen root is not proxied (CORE-8) -----------------------------------

test("state() on a frozen object returns it as-is (no proxy, no throw)", () => {
	const frozen = Object.freeze({ a: 1 });
	const s = state(frozen);

	assert.equal(s, frozen);          // same object, not a proxy
	assert.equal(Object.isFrozen(s), true);
});

// --- error inside an effect: boundary behavior -----------------------------

test("a throw inside an effect propagates and does not corrupt the stack", () => {
	const s = state({ n: 0 });

	// An effect that throws on first run: the error propagates to the caller
	// (qrp does not swallow it — no silent failure). The effect stack must be
	// restored so subsequent effects still work.
	assert.throws(() => {
		effect(() => { s.n; throw new Error("boom"); });
	}, /boom/);

	// The reactive system is still usable afterwards.
	let ok;
	effect(() => { ok = s.n + 1; });
	assert.equal(ok, 1);

	s.n = 5;
	assert.equal(ok, 6);
});

test("a throw on RE-RUN propagates on the triggering write", () => {
	const s = state({ n: 0 });

	effect(() => {
		if(s.n === 2) {
			throw new Error("bad value");
		}
	});

	// writing the bad value surfaces the error at the write site
	assert.throws(() => { s.n = 2; }, /bad value/);

	// system remains usable; effect stack was unwound in the finally block
	let seen;
	effect(() => { seen = s.n; });
	assert.equal(seen, 2);
});

// --- onEffectError (central crash reporting) --------------------------------

test("onEffectError fires before the error propagates, then unsubscribes", () => {
	const seen = [];
	const off = onEffectError((err) => seen.push(err.message));

	let ctx;
	const off2 = onEffectError((_e, c) => { ctx = c; });
	assert.throws(() => effect(() => { throw new Error("kaboom"); }, { name: "widget" }), /kaboom/);
	assert.deepEqual(seen, ["kaboom"], "handler saw the error");
	assert.equal(ctx.phase, "create", "first run = create phase");
	assert.equal(ctx.name, "widget", "effect name forwarded");
	off2();

	off();
	assert.throws(() => effect(() => { throw new Error("again"); }), /again/);
	assert.deepEqual(seen, ["kaboom"], "no longer called after unsubscribe");
});

test("onEffectError also catches throws on re-run", () => {
	const seen = [];
	const off = onEffectError((err) => seen.push(err.message));
	const s = state({ n: 0 });

	let phase;
	const offP = onEffectError((_e, c) => { phase = c.phase; });
	effect(() => { if(s.n > 0) { throw new Error("on-rerun"); } });
	assert.throws(() => { s.n = 1; }, /on-rerun/);
	assert.deepEqual(seen, ["on-rerun"]);
	assert.equal(phase, "update", "a reactive re-run = update phase");
	offP();
	off();
});

// --- runaway-effect (loop) guard --------------------------------------------

test("a runaway effect is torn down and reported with phase 'loop'", () => {
	const phases = [];
	const off = onEffectError((_e, c) => phases.push(c.phase));
	const s = state({ a: 0, b: 0 });

	// Two effects writing each other's keys form an infinite synchronous
	// cascade; the second effect's creation closes the cycle and kicks it off.
	effect(() => { s.b = s.a + 1; }, { loopLimit: 10, name: "a->b" });

	assert.throws(
		() => effect(() => { s.a = s.b + 1; }, { loopLimit: 10, name: "b->a" }),
		/infinite loop/,
		"the re-entrant runaway throws once the depth ceiling is crossed",
	);

	assert.ok(phases.includes("loop"), "the runaway is reported with phase 'loop'");
	off();
});

test("normal re-runs under the ceiling never trip the loop guard", () => {
	let loops = 0;
	const off = onEffectError((_e, c) => { if(c.phase === "loop") { loops += 1; } });
	const s = state({ n: 0 });

	let runs = 0;
	effect(() => { void s.n; runs += 1; });
	Array.from({ length: 50 }, (_, i) => i + 1).forEach(i => { s.n = i; });

	assert.equal(runs, 51, "ran once on create + once per write");
	assert.equal(loops, 0, "50 legitimate re-runs stay well under the default ceiling");
	off();
});

test("a hot effect updated thousands of times in a tick does NOT trip the guard", () => {
	// The signature the guard must NOT flag: a legitimately hot cell (bulk write,
	// animation, benchmark) updated far past the ceiling SEQUENTIALLY — each run
	// completes and pops before the next write, so re-entrancy depth stays 1.
	let loops = 0;
	const off = onEffectError((_e, c) => { if(c.phase === "loop") { loops += 1; } });
	const s = state({ v: 0 });

	let runs = 0;
	effect(() => { void s.v; runs += 1; });   // reads v; does NOT write it
	Array.from({ length: 5000 }, (_, i) => i + 1).forEach(i => { s.v = i; });

	assert.equal(runs, 5001, "fired once per write, none suppressed");
	assert.equal(loops, 0, "5000 sequential updates (depth 1) never trip the depth guard");
	off();
});
