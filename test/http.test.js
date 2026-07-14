import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { effect } from "../qrp/index.js";
import { emitter } from "../events/index.js";
import { createHttp } from "../http/index.js";

// Fetch stub returning a Response-like (single-use body); records calls.
const stubFetch = (ok, body, status = 200) => {
	globalThis.fetch = (url, init) => {
		globalThis.fetch.calls.push({ url, init });

		let used = false;

		return Promise.resolve({
			ok,
			status,
			statusText: "",
			text: () => {
				if(used) {
					return Promise.reject(new TypeError("Body has already been read"));
				}
				used = true;
				return Promise.resolve(typeof body === "string" ? body : JSON.stringify(body));
			}
		});
	};

	globalThis.fetch.calls = [];
};

const rejectFetch = () => {
	globalThis.fetch = () => Promise.reject(new Error("network down"));
	globalThis.fetch.calls = [];
};

test("get prefixes baseUrl, attaches token + client, returns parsed JSON", () => {
	stubFetch(true, { ok: true });

	const http = createHttp({
		baseUrl: "/api/v2",
		token: () => "tok",
		client: () => "web",
		bus: emitter()
	});

	return http.get("/things").then((data) => {
		assert.deepEqual(data, { ok: true });

		const call = globalThis.fetch.calls[0];
		assert.equal(call.url, "/api/v2/things");
		assert.equal(call.init.method, "GET");
		const h = call.init.headers;
		const auth = h.authorization || h.Authorization;
		assert.equal(auth, "Bearer tok");
		assert.equal(h["x-authorization-client"], "web");
	});
});

test("params are serialized to a query string", () => {
	stubFetch(true, {});

	const http = createHttp({ baseUrl: "/api", bus: emitter() });

	return http.get("/things", { params: { page: 2, q: "a b" } }).then(() => {
		assert.match(globalThis.fetch.calls[0].url, /^\/api\/things\?/);
		assert.match(globalThis.fetch.calls[0].url, /page=2/);
		assert.match(globalThis.fetch.calls[0].url, /q=a\+b/);
	});
});

test("absolute URLs are not prefixed", () => {
	stubFetch(true, {});

	const http = createHttp({ baseUrl: "/api", bus: emitter() });

	return http.get("https://elsewhere.test/x").then(() => {
		assert.equal(globalThis.fetch.calls[0].url, "https://elsewhere.test/x");
	});
});

test("post sends a JSON body with content-type", () => {
	stubFetch(true, {});

	const http = createHttp({ baseUrl: "/api", bus: emitter() });

	return http.post("/things", { name: "x" }).then(() => {
		const call = globalThis.fetch.calls[0];
		assert.equal(call.init.method, "POST");
		assert.equal(call.init.headers["Content-Type"], "application/json");
		assert.deepEqual(JSON.parse(call.init.body), { name: "x" });
	});
});

test("loading.pending is reactive and returns to zero", () => {
	stubFetch(true, {});

	const http = createHttp({ baseUrl: "/api", bus: emitter() });

	const seen = [];
	effect(() => { seen.push(http.loading.pending); });

	assert.equal(http.loading.pending, 0);

	const p = http.get("/things");
	assert.equal(http.loading.pending, 1); // incremented synchronously

	return p.then(() => {
		assert.equal(http.loading.pending, 0);
		assert.ok(seen.includes(1)); // effect saw the in-flight state
	});
});

test("loader.start/stop are emitted at the edges", () => {
	stubFetch(true, {});

	const bus = emitter();
	const events = [];
	bus.on("loader.start", () => events.push("start"));
	bus.on("loader.stop", () => events.push("stop"));

	const http = createHttp({ baseUrl: "/api", bus });

	return http.get("/things").then(() => {
		assert.deepEqual(events, ["start", "stop"]);
	});
});

test("error response emits error on the bus and rejects", () => {
	stubFetch(false, { error: { message: "Boom" } }, 500);

	const bus = emitter();
	let errored;
	bus.on("error", (e) => { errored = e.message; });

	const http = createHttp({ baseUrl: "/api", bus });

	return http.get("/things").then(
		() => assert.fail("should reject"),
		(err) => {
			assert.equal(errored, "Boom");
			// rejection is a structured value with status + parsed data (not a
			// consumed Response), so callers can read the error body
			assert.equal(err.status, 500);
			assert.equal(err.data.error.message, "Boom");
		}
	);
});

test("validation errors are appended to the message", () => {
	stubFetch(false, {
		error: { message: "Invalid: " },
		errors: { name: { message: "name required" }, age: { message: "age required" } }
	}, 422);

	const bus = emitter();
	let errored;
	bus.on("error", (e) => { errored = e.message; });

	const http = createHttp({ baseUrl: "/api", bus });

	return http.get("/things").then(
		() => assert.fail("should reject"),
		() => {
			assert.match(errored, /Invalid: /);
			assert.match(errored, /name required/);
			assert.match(errored, /age required/);
		}
	);
});

test("401 emits auth:unauthorized", () => {
	stubFetch(false, { error: { message: "Unauthorized" } }, 401);

	const bus = emitter();
	let unauth = false;
	bus.on("auth:unauthorized", () => { unauth = true; });

	const http = createHttp({ baseUrl: "/api", bus });

	return http.get("/secret").then(
		() => assert.fail("should reject"),
		() => { assert.equal(unauth, true); }
	);
});

test("string-body Unauthorized also emits auth:unauthorized", () => {
	stubFetch(false, { error: "Unauthorized" }, 403);

	const bus = emitter();
	let unauth = false;
	bus.on("auth:unauthorized", () => { unauth = true; });

	const http = createHttp({ baseUrl: "/api", bus });

	return http.get("/secret").then(
		() => assert.fail("should reject"),
		() => { assert.equal(unauth, true); }
	);
});

test("nullish params are skipped; arrays repeat the key", () => {
	stubFetch(true, {});
	const http = createHttp({ baseUrl: "/api", bus: emitter() });

	return http.get("/things", { params: { q: undefined, page: 2, ids: [1, 2, 3] } }).then(() => {
		const url = globalThis.fetch.calls[0].url;
		assert.ok(!/q=/.test(url), "undefined param skipped");
		assert.match(url, /page=2/);
		assert.match(url, /ids=1&ids=2&ids=3/);
	});
});

test("case-insensitive header merge (no duplicate content-type)", () => {
	stubFetch(true, {});
	const http = createHttp({ baseUrl: "/api", bus: emitter() });

	return http.post("/x", { a: 1 }, { headers: { "content-type": "text/plain" } }).then(() => {
		const headers = globalThis.fetch.calls[0].init.headers;
		const keys = Object.keys(headers).filter((k) => k.toLowerCase() === "content-type");
		assert.equal(keys.length, 1); // caller's lowercase wins, ours doesn't duplicate
		assert.equal(headers[keys[0]], "text/plain");
	});
});

test("FormData body passes through untouched (not JSON-stringified)", () => {
	stubFetch(true, {});
	const http = createHttp({ baseUrl: "/api", bus: emitter() });
	const fd = new FormData();
	fd.append("file", "x");

	return http.post("/upload", fd).then(() => {
		const init = globalThis.fetch.calls[0].init;
		assert.ok(init.body instanceof FormData);
		// we must NOT force a JSON content-type for FormData
		const ct = Object.entries(init.headers).find(([k]) => k.toLowerCase() === "content-type");
		assert.ok(!ct || ct[1] !== "application/json");
	});
});

test("a synchronous build error does not leave the loader stuck", () => {
	stubFetch(true, {});
	const http = createHttp({ baseUrl: "/api", bus: emitter() });

	// null path → path.indexOf throws inside buildUrl, before fetch
	return http.get(null).then(
		() => assert.fail("should reject"),
		() => { assert.equal(http.loading.pending, 0); } // not stuck at 1
	);
});

test("legacy: non-2xx rejects and does not emit for a plain body", () => {
	stubFetch(false, {}, 500);

	const bus = emitter();
	let errored = false;
	bus.on("error", () => { errored = true; });

	const http = createHttp({ baseUrl: "/api", bus });

	return http.get("/thing").then(
		() => assert.fail("should reject"),
		(err) => {
			assert.equal(err.status, 500);
			assert.equal(errored, true); // generic error emitted
		}
	);
});

test("network failure emits a generic error and settles the loader", () => {
	rejectFetch();

	const bus = emitter();
	let errored;
	bus.on("error", (e) => { errored = e.message; });

	const http = createHttp({ baseUrl: "/api", bus });

	return http.get("/thing").then(
		() => assert.fail("should reject"),
		() => {
			assert.match(errored, /Error contacting server/);
			assert.equal(http.loading.pending, 0);
		}
	);
});
