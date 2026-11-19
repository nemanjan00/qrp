import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { copy, download } from "../export/index.js";

const withClipboard = (clipboard, fn) => {
	const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

	Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });

	return Promise.resolve().then(fn).finally(() => {
		if(descriptor) {
			Object.defineProperty(navigator, "clipboard", descriptor);
		} else {
			delete navigator.clipboard;
		}
	});
};

const withExecCommand = (impl, fn) => {
	const previous = document.execCommand;

	document.execCommand = impl;

	return Promise.resolve().then(fn).finally(() => {
		document.execCommand = previous;
	});
};

test("copy uses navigator.clipboard when it exists", () => {
	const written = [];

	return withClipboard({ writeText: (text) => Promise.resolve(written.push(text)) }, () => copy("hi"))
		.then(() => assert.deepEqual(written, ["hi"]));
});

test("copy falls back to execCommand without navigator.clipboard (plain http)", () => {
	const copied = [];

	return withClipboard(undefined, () => withExecCommand((command) => {
		copied.push([command, document.querySelector("textarea").value]);
		return true;
	}, () => copy("http only"))).then(() => {
		assert.deepEqual(copied, [["copy", "http only"]]);
		assert.equal(document.querySelector("textarea"), null);
	});
});

test("copy rejects (never throws) when the browser refuses", () => {
	let result;

	return withClipboard(undefined, () => withExecCommand(() => false, () => {
		result = copy("nope");
		return result.then(() => assert.fail("should reject"), (error) => assert.match(error.message, /refused/));
	})).then(() => assert.ok(result instanceof Promise));
});

test("copy falls back when navigator.clipboard rejects", () => {
	const copied = [];

	return withClipboard({ writeText: () => Promise.reject(new Error("denied")) }, () => withExecCommand(() => {
		copied.push(true);
		return true;
	}, () => copy("x"))).then(() => assert.equal(copied.length, 1));
});

test("download revokes the object URL later, not synchronously", () => {
	const origCreate = URL.createObjectURL;
	const origRevoke = URL.revokeObjectURL;
	const origTimeout = globalThis.setTimeout;
	const revoked = [];
	const timers = [];

	URL.createObjectURL = () => "blob:x";
	URL.revokeObjectURL = (url) => revoked.push(url);
	globalThis.setTimeout = (fn, ms) => timers.push([fn, ms]);

	try {
		download("a,b", "x.csv");
		assert.deepEqual(revoked, []);
		assert.ok(timers[0][1] >= 1000);
		timers[0][0]();
		assert.deepEqual(revoked, ["blob:x"]);
	} finally {
		URL.createObjectURL = origCreate;
		URL.revokeObjectURL = origRevoke;
		globalThis.setTimeout = origTimeout;
	}
});
