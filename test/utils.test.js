import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

// Import each from its own file — proves the helpers stand alone with no
// hidden cross-file coupling (except memoize → lru, which is explicit).
import { lru } from "../utils/lru.js";
import { memoize } from "../utils/memoize.js";
import { cacheForever, precache, precacheWithRefresh } from "../utils/cache.js";
import { paginate, pageCount } from "../utils/paginate.js";
import { limit } from "../utils/limit.js";
import { debounce, throttle } from "../utils/debounce.js";
import { validate } from "../utils/validate.js";

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

// --- paginate ---------------------------------------------------------------

test("paginate slices by page, size 0 returns a copy of all", () => {
	const data = [1, 2, 3, 4, 5];

	assert.deepEqual(paginate(data, 0, 2), [1, 2]);
	assert.deepEqual(paginate(data, 2, 2), [5]);
	assert.deepEqual(paginate(data, 0, 0), data);
	assert.notEqual(paginate(data, 0, 0), data); // fresh copy, not the source
	assert.equal(pageCount(5, 2), 3);
	assert.equal(pageCount(5, 0), 1);
});

test("paginate clamps negative index to the first page", () => {
	const data = [1, 2, 3, 4, 5, 6];

	assert.deepEqual(paginate(data, -1, 3), [1, 2, 3]); // not a wrap-slice from the end
	assert.deepEqual(paginate(data, -5, 2), [1, 2]);
});

test("memoize max:0 retains nothing (not unbounded)", () => {
	let calls = 0;
	const fn = memoize((n) => { calls++; return n; }, { max: 0 });

	fn(1);
	fn(1); // nothing retained → recomputed
	assert.equal(calls, 2);
});

// --- limit (concurrency + rate + timeout) -----------------------------------

test("limit caps concurrent in-flight calls (FIFO)", async () => {
	let active = 0, peak = 0;
	const fn = limit((n) => new Promise((r) => {
		active++; peak = Math.max(peak, active);
		setTimeout(() => { active--; r(n); }, 20);
	}), 2);

	const results = await Promise.all([1, 2, 3, 4, 5].map(fn));
	assert.deepEqual(results, [1, 2, 3, 4, 5]);
	assert.equal(peak, 2, "never more than 2 at once");
});

test("limit rejects a call that exceeds its timeout", async () => {
	const fn = limit(() => new Promise((r) => setTimeout(r, 50)), { max: 1, timeout: 10 });
	await assert.rejects(fn(), /timeout/);
});

test("limit surfaces a rejection and keeps draining the queue", async () => {
	const fn = limit((n) => n === 2 ? Promise.reject(new Error("boom")) : Promise.resolve(n), 1);
	const settled = await Promise.allSettled([fn(1), fn(2), fn(3)]);
	assert.deepEqual(settled.map((s) => s.status), ["fulfilled", "rejected", "fulfilled"]);
});

// --- debounce / throttle ----------------------------------------------------

test("debounce fires once after the quiet period", async () => {
	let calls = 0, last;
	const d = debounce((x) => { calls++; last = x; }, 15);
	d(1); d(2); d(3);
	assert.equal(calls, 0, "not yet");
	await new Promise((r) => setTimeout(r, 30));
	assert.equal(calls, 1);
	assert.equal(last, 3, "trailing args win");
});

test("debounce.cancel drops the pending call", async () => {
	let calls = 0;
	const d = debounce(() => calls++, 15);
	d(); d.cancel();
	await new Promise((r) => setTimeout(r, 30));
	assert.equal(calls, 0);
});

test("throttle runs on the leading edge then caps the rate", async () => {
	let calls = 0;
	const t = throttle(() => calls++, 30);
	t(); // leading, runs now
	t(); t(); // coalesced into one trailing
	assert.equal(calls, 1, "leading only, so far");
	await new Promise((r) => setTimeout(r, 50));
	assert.equal(calls, 2, "one trailing after the window");
});

// --- memoize ttl + invalidate -----------------------------------------------

test("memoize ttl expires an entry after it settles", async () => {
	let calls = 0;
	const fn = memoize(async (x) => { calls++; return x * 2; }, { ttl: 20 });

	assert.equal(await fn(2), 4);
	assert.equal(await fn(2), 4);
	assert.equal(calls, 1, "cached within ttl");

	await new Promise((r) => setTimeout(r, 35));
	assert.equal(await fn(2), 4);
	assert.equal(calls, 2, "recomputed after ttl");
});

test("memoize.invalidate clears one key or all", () => {
	let calls = 0;
	const fn = memoize((x) => { calls++; return x; });

	fn(1); fn(2);
	assert.equal(calls, 2);
	fn(1);
	assert.equal(calls, 2, "cached");

	fn.invalidate(1);
	fn(1);
	assert.equal(calls, 3, "recomputed after single invalidate");

	fn.invalidate();   // clear all
	fn(2);
	assert.equal(calls, 4, "recomputed after clear-all");
});

test("lru.clear empties the store", () => {
	const store = lru(3);
	store.set("a", 1);
	store.set("b", 2);
	store.clear();
	assert.equal(store.size, 0);
	assert.equal(store.has("a"), false);
});

// --- validate ---------------------------------------------------------------

test("validate returns { errors, value }; [] errors for valid data", () => {
	const schema = {
		name: { type: "string", required: true, min: 2 },
		age: { type: "number", min: 0, max: 120 },
		role: { enum: ["admin", "user"] }
	};
	assert.deepEqual(validate(schema, { name: "Ada", age: 36, role: "admin" }).errors, []);

	const errs = validate(schema, { name: "A", age: 200, role: "root" }).errors;
	const paths = errs.map((e) => e.path).sort();
	assert.deepEqual(paths, ["age", "name", "role"]);
});

test("validate COERCES form strings and checks the coerced value", () => {
	const schema = {
		age: { type: "number", min: 0, max: 120 },
		active: { type: "boolean" },
		name: { type: "string" }
	};
	// strings from inputs → declared types; checks run on coerced value
	const { errors, value } = validate(schema, { age: "37", active: "true", name: "Ada" });
	assert.deepEqual(errors, []);
	assert.strictEqual(value.age, 37);
	assert.strictEqual(value.active, true);
	assert.strictEqual(value.name, "Ada");

	// coerced value is what fails the bound (200 > 120), not the raw string
	assert.equal(validate(schema, { age: "200" }).errors[0].path, "age");
	// un-coercible stays a string and fails the type check
	assert.equal(validate(schema, { age: "abc" }).errors[0].path, "age");
});

test("validate handles required, custom check, and nested fields (+ coerces nested)", () => {
	const schema = {
		email: { required: true, pattern: /@/, message: "needs @" },
		pin: { check: (v) => v === 1234 ? true : "wrong pin" },
		prefs: { fields: { theme: { enum: ["light", "dark"] }, size: { type: "number" } } }
	};
	const { errors, value } = validate(schema, { pin: 9, prefs: { theme: "neon", size: "14" } });
	const map = Object.fromEntries(errors.map((e) => [e.path, e.message]));
	assert.equal(map.email, "needs @");
	assert.equal(map.pin, "wrong pin");
	assert.equal(map["prefs.theme"], "prefs.theme must be one of light, dark");
	assert.strictEqual(value.prefs.size, 14, "nested value coerced too");
});

test("validate strict rejects unknown keys (recursively); default lets them pass", () => {
	const schema = { name: { type: "string" }, prefs: { fields: { theme: {} } } };

	// default: unknown keys pass into value, no error
	const loose = validate(schema, { name: "Ada", extra: 1, prefs: { theme: "dark", junk: 2 } });
	assert.deepEqual(loose.errors, []);
	assert.equal(loose.value.extra, 1);

	// strict: unknown keys at any depth are errors
	const strict = validate(schema, { name: "Ada", extra: 1, prefs: { theme: "dark", junk: 2 } }, { strict: true });
	const paths = strict.errors.map((e) => e.path).sort();
	assert.deepEqual(paths, ["extra", "prefs.junk"]);
});

test("validate distinguishes absent from empty-string for optional fields", () => {
	// optional field with a 'must not be empty' check
	const schema = { note: { check: (v) => v.trim() !== "" || "must not be empty" } };

	// absent → skipped (optional)
	assert.deepEqual(validate(schema, {}).errors, []);
	// present but empty → validated, check fires
	assert.equal(validate(schema, { note: "" }).errors[0].message, "must not be empty");
	// present and non-empty → ok
	assert.deepEqual(validate(schema, { note: "hi" }).errors, []);

	// required still fails on both absent and ""
	const req = { email: { required: true, pattern: /@/ } };
	assert.equal(validate(req, {}).errors[0].message, "email is required");
	assert.equal(validate(req, { email: "" }).errors[0].message, "email is required");
});
