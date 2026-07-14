import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { effect } from "../qrp/index.js";
import { emitter } from "../events/index.js";
import { createHttp } from "../http/index.js";

// Fetch stub returning a Response-like; records calls.
const stubFetch = (ok, body, status = 200) => {
	globalThis.fetch = (url, init) => {
		globalThis.fetch.calls.push({ url, init });

		return Promise.resolve({
			ok,
			status,
			text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body))
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
		assert.equal(call.init.headers.authorization, "Bearer tok");
		assert.equal(call.init.headers["x-authorization-client"], "web");
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
		() => { assert.equal(errored, "Boom"); }
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

test("302 rejects silently (no error emitted)", () => {
	stubFetch(false, {}, 302);

	const bus = emitter();
	let errored = false;
	bus.on("error", () => { errored = true; });

	const http = createHttp({ baseUrl: "/api", bus });

	return http.get("/thing").then(
		() => assert.fail("should reject"),
		(response) => {
			assert.equal(response.status, 302);
			assert.equal(errored, false);
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
