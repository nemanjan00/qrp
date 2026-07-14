import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

// Import each from its own file — proves the helpers stand alone with no
// hidden cross-file coupling (except memoize → lru, which is explicit).
import { lru } from "../utils/lru.js";
import { memoize } from "../utils/memoize.js";
import { cacheForever, precache, precacheWithRefresh } from "../utils/cache.js";
import { roundRobinByKey } from "../utils/round-robin.js";
import { weightedPool } from "../utils/weighted-pool.js";
import { paginate, pageCount } from "../utils/paginate.js";

// --- lru --------------------------------------------------------------------

test("lru evicts the least-recently-used entry", () => {
	const store = lru(2);

	store.set("a", 1);
	store.set("b", 2);
	store.get("a");      // touch a → b is now oldest
	store.set("c", 3);   // evicts b

	assert.equal(store.has("a"), true);
	assert.equal(store.has("b"), false);
	assert.equal(store.has("c"), true);
	assert.equal(store.size, 2);
});

// --- memoize ----------------------------------------------------------------

test("memoize caches sync results by args", () => {
	let calls = 0;
	const fn = memoize((a, b) => { calls++; return a + b; });

	assert.equal(fn(1, 2), 3);
	assert.equal(fn(1, 2), 3);
	assert.equal(fn(2, 2), 4);
	assert.equal(calls, 2); // (1,2) computed once, (2,2) once
});

test("memoize dedups in-flight async calls", () => {
	let calls = 0;
	const fn = memoize((n) => { calls++; return Promise.resolve(n * 2); });

	const a = fn(5);
	const b = fn(5); // same key, before a resolves

	assert.equal(a, b); // identical promise → one execution
	assert.equal(calls, 1);

	return a.then((v) => assert.equal(v, 10));
});

test("memoize evicts rejected promises so retries work", () => {
	let calls = 0;
	const fn = memoize(() => {
		calls++;
		return calls === 1 ? Promise.reject(new Error("fail")) : Promise.resolve("ok");
	});

	return fn().then(
		() => assert.fail("first should reject"),
		() => {
			// allow the .catch eviction to run
			return Promise.resolve().then(() => fn().then((v) => {
				assert.equal(v, "ok");
				assert.equal(calls, 2);
			}));
		}
	);
});

test("memoize honors a custom key and LRU max", () => {
	let calls = 0;
	const fn = memoize((obj) => { calls++; return obj.id; }, { key: (args) => args[0].id, max: 2 });

	fn({ id: "a" });
	fn({ id: "b" });
	fn({ id: "a" }); // cached
	assert.equal(calls, 2);

	fn({ id: "c" }); // evicts b
	fn({ id: "b" }); // recomputed
	assert.equal(calls, 4);
});

// --- cacheForever -----------------------------------------------------------

test("cacheForever runs once, even for falsy results", () => {
	let calls = 0;
	const get = cacheForever(() => { calls++; return 0; });

	assert.equal(get(), 0);
	assert.equal(get(), 0);
	assert.equal(calls, 1); // 0 is cached, not recomputed
});

// --- precache ---------------------------------------------------------------

test("precache starts eagerly and returns a stable promise", () => {
	let calls = 0;
	const get = precache(() => { calls++; return Promise.resolve("x"); });

	const p1 = get();
	const p2 = get();
	assert.equal(p1, p2);

	return p1.then((v) => {
		assert.equal(v, "x");
		assert.equal(calls, 1);
	});
});

// --- precacheWithRefresh ----------------------------------------------------

test("precacheWithRefresh serves current and swaps on refresh, stop() clears", () => {
	let n = 0;
	const get = precacheWithRefresh(() => Promise.resolve(++n), 999999);

	return get().then((first) => {
		assert.equal(first, 1);

		return get.refresh().then((second) => {
			assert.equal(second, 2);

			return get().then((now) => {
				assert.equal(now, 2); // current swapped to the refreshed promise
				get.stop();
			});
		});
	});
});

// --- roundRobinByKey --------------------------------------------------------

test("roundRobinByKey interleaves buckets, preserving input order within each", () => {
	const items = [
		{ team: "a", n: 1 }, { team: "a", n: 2 },
		{ team: "b", n: 3 }, { team: "c", n: 4 }, { team: "a", n: 5 }
	];

	const picked = roundRobinByKey(items, 4, (i) => i.team).map((i) => i.n);

	// round 1: a(1), b(3), c(4); round 2: a(2)
	assert.deepEqual(picked, [1, 3, 4, 2]);
});

test("roundRobinByKey respects the limit and empty edge", () => {
	assert.deepEqual(roundRobinByKey([1, 2, 3], 0, (x) => x), []);
	assert.equal(roundRobinByKey([1, 2, 3, 4], 2, (x) => x % 2).length, 2);
});

// --- weightedPool -----------------------------------------------------------

test("weightedPool picks by weight (deterministic with seed)", () => {
	const pool = weightedPool();
	pool.push("light", 1);
	pool.push("heavy", 9); // caps: [1, 10], max 10

	assert.equal(pool.pick(0), "light");   // 0 < 1
	assert.equal(pool.pick(5), "heavy");   // 1 <= 5 < 10
	assert.deepEqual(pool.all(), ["light", "heavy"]);
});

test("weightedPool delete recalculates and empty pick is undefined", () => {
	const pool = weightedPool();
	assert.equal(pool.pick(), undefined);

	pool.push("a", 1);
	pool.push("b", 1);
	pool.delete("a");

	assert.deepEqual(pool.all(), ["b"]);
	assert.equal(pool.pick(0), "b");
});

// --- paginate ---------------------------------------------------------------

test("paginate slices by page, size 0 returns all", () => {
	const data = [1, 2, 3, 4, 5];

	assert.deepEqual(paginate(data, 0, 2), [1, 2]);
	assert.deepEqual(paginate(data, 2, 2), [5]);
	assert.deepEqual(paginate(data, 0, 0), data);
	assert.equal(pageCount(5, 2), 3);
	assert.equal(pageCount(5, 0), 1);
});
