import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import "../qrp/index.js";

test("a second copy of the core warns once, naming both URLs", async () => {
	const warnings = [];
	const original = console.warn;

	console.warn = (...args) => {
		warnings.push(args.join(" "));
	};

	try {
		// A query string makes Node load the same file as a separate module
		// instance — the same thing two CDN URLs do in a browser.
		await import("../qrp/index.js?second-copy");
	} finally {
		console.warn = original;
	}

	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /second copy of qrp's core/);
	assert.match(warnings[0], /second-copy/);
	assert.match(warnings[0], /first: \S+qrp\/index\.js\)/);
});

test("the first copy records itself on globalThis", () => {
	const entry = globalThis[Symbol.for("qrp.core")];

	assert.ok(entry);
	assert.match(entry.url, /qrp\/index\.js$/);
});
