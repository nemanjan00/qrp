import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { effect, scoped } from "../qrp/index.js";
import { socket } from "../socket/index.js";

// A scriptable WebSocket: tests open/close/message it by hand. node --test
// runs each file in its own process, so replacing the global is contained.
const installFake = () => {
	const made = [];
	const Fake = function(url, protocols) {
		this.url = url;
		this.protocols = protocols;
		this.readyState = 0;
		this.sent = [];
		this.bufferedAmount = 0;
		made.push(this);
	};

	Fake.OPEN = 1;
	Fake.prototype.send = function(data) { this.sent.push(data); };
	Fake.prototype.close = function() {
		this.readyState = 3;
		this.onclose && this.onclose({ code: 1000 });
	};
	Fake.prototype.open = function() {
		this.readyState = 1;
		this.onopen && this.onopen({});
	};
	Fake.prototype.drop = function() {
		this.readyState = 3;
		this.onclose && this.onclose({ code: 1006 });
	};
	Fake.prototype.receive = function(data) { this.onmessage({ data }); };

	globalThis.WebSocket = Fake;

	return { made };
};

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("socket resolves a path to ws(s) on the page origin", () => {
	const fake = installFake();

	const s = socket("/ws", { reconnect: false });

	assert.equal(fake.made[0].url, "wss://example.test/ws");
	s.close();
});

test("socket status is reactive and send() refuses while disconnected", () => {
	const fake = installFake();

	const s = socket("/ws", { reconnect: false });
	const seen = [];

	effect(() => seen.push(s.status.state));
	assert.equal(s.send({ a: 1 }), false);
	fake.made[0].open();
	assert.equal(s.status.connected, true);
	assert.equal(s.send({ a: 1 }), true);
	assert.equal(s.send("raw"), true);
	assert.deepEqual(fake.made[0].sent, ["{\"a\":1}", "raw"]);
	fake.made[0].drop();
	assert.deepEqual(seen, ["connecting", "open", "closed"]);
});

test("socket decodes JSON and routes by type", () => {
	const fake = installFake();

	const s = socket("/ws", { reconnect: false });
	const all = [];
	const samples = [];

	s.on("message", (m) => all.push(m));
	s.on("samples", (m) => samples.push(m.v));
	fake.made[0].open();
	fake.made[0].receive("{\"type\":\"samples\",\"v\":3}");
	fake.made[0].receive("{\"type\":\"state\"}");
	fake.made[0].receive("not json");
	assert.deepEqual(samples, [3]);
	assert.equal(all.length, 3);
	assert.equal(all[2], "not json");
	s.close();
});

test("socket reconnects with backoff, re-reading a url function", () => {
	const fake = installFake();

	let n = 0;
	const s = socket(() => `/ws?t=${n += 1}`, { reconnect: { min: 5, max: 20 } });

	fake.made[0].open();
	fake.made[0].drop();
	assert.equal(s.status.state, "connecting");
	assert.equal(s.status.attempts, 1);

	return tick(15).then(() => {
		assert.equal(fake.made.length, 2);
		assert.match(fake.made[1].url, /t=2$/);
		fake.made[1].open();
		assert.equal(s.status.attempts, 0);
		s.close();
		assert.equal(s.status.state, "closed");
	});
});

test("socket closes for good when its scope disposes", () => {
	const fake = installFake();

	const owned = scoped(() => socket("/ws", { reconnect: { min: 1 } }));

	fake.made[0].open();
	owned.dispose();
	assert.equal(owned.value.status.state, "closed");

	return tick(10).then(() => assert.equal(fake.made.length, 1));
});

test("socket.reconnect() replaces the connection without a double reconnect", () => {
	const fake = installFake();

	const s = socket("/ws", { reconnect: { min: 1 } });

	fake.made[0].open();
	s.reconnect();
	assert.equal(fake.made.length, 2);

	return tick(10).then(() => {
		assert.equal(fake.made.length, 2);
		s.close();
	});
});
