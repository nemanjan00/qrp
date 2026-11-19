import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { toCSV, download } from "../export/index.js";

test("toCSV with string columns + RFC-4180 escaping", () => {
	const rows = [{ a: 1, b: "x,y" }, { a: 2, b: "he said \"hi\"" }];
	const csv = toCSV(rows, ["a", "b"]);
	assert.equal(csv, "a,b\r\n1,\"x,y\"\r\n2,\"he said \"\"hi\"\"\"");
});

test("toCSV with {key,label,value} columns", () => {
	const rows = [{ id: 1, n: "Ada" }];
	const csv = toCSV(rows, [{ key: "id", label: "ID" }, { key: "n", label: "Name", value: (r) => r.n.toUpperCase() }]);
	assert.equal(csv, "ID,Name\r\n1,ADA");
});

test("toCSV empty → header only (derived keys)", () => {
	assert.equal(toCSV([], ["a", "b"]), "a,b");
});

test("toCSV guards formula-looking string cells by default (CSV injection)", () => {
	const rows = [
		{ v: "=HYPERLINK(\"http://evil\")" },
		{ v: "+cmd" },
		{ v: "-2+3" },
		{ v: "@SUM(A1)" },
		{ v: "\tx" },
		{ v: "\rx" },
		{ v: "safe" }
	];
	const csv = toCSV(rows, ["v"]);
	assert.equal(csv, [
		"v",
		"\"'=HYPERLINK(\"\"http://evil\"\")\"",
		"'+cmd",
		"'-2+3",
		"'@SUM(A1)",
		"'\tx",
		"\"'\rx\"",
		"safe"
	].join("\r\n"));
});

test("toCSV formula guard leaves numbers and numeric strings alone", () => {
	const rows = [{ n: -5, s: "-5", f: "+1.5e3", d: "-0.25" }];
	assert.equal(toCSV(rows), "n,s,f,d\r\n-5,-5,+1.5e3,-0.25");
});

test("toCSV formula guard leaves formatted numbers and a lone dash alone", () => {
	const values = ["-", "-1,234.50", "-10%", "-$5", "+381 64 123", "-5\u00a0€"];
	const csv = toCSV(values.map((v) => ({ v })), ["v"]);

	assert.deepEqual(csv.split("\r\n").slice(1), ["-", "\"-1,234.50\"", "-10%", "-$5", "+381 64 123", "-5\u00a0€"]);
});

test("toCSV formula guard still catches formulas that start like numbers", () => {
	const values = ["-2+3", "-A1", "-1)", "+1|calc"];
	const csv = toCSV(values.map((v) => ({ v })), ["v"]);

	assert.deepEqual(csv.split("\r\n").slice(1), ["'-2+3", "'-A1", "'-1)", "'+1|calc"]);
});

test("toCSV guards header labels too", () => {
	assert.equal(toCSV([], [{ key: "a", label: "=1+1" }]), "'=1+1");
});

test("toCSV { formulaGuard: false } writes cells unchanged", () => {
	const rows = [{ v: "=1+1" }];
	assert.equal(toCSV(rows, ["v"], { formulaGuard: false }), "v\r\n=1+1");
	assert.equal(toCSV(rows, undefined, { formulaGuard: false }), "v\r\n=1+1");
});

test("download creates + clicks an anchor (no throw)", () => {
	const origCreate = URL.createObjectURL, origRevoke = URL.revokeObjectURL, origTimeout = globalThis.setTimeout;
	URL.createObjectURL = () => "blob:x";
	URL.revokeObjectURL = () => {};
	// the deferred revoke would hold the test process open for 30 s
	globalThis.setTimeout = () => 0;
	try {
		let clicked = false;
		const realCreate = document.createElement.bind(document);
		document.createElement = (t) => { const el = realCreate(t); if(t === "a") { el.click = () => { clicked = true; }; } return el; };
		download("a,b\n1,2", "x.csv");
		assert.equal(clicked, true);
		document.createElement = realCreate;
	} finally {
		URL.createObjectURL = origCreate; URL.revokeObjectURL = origRevoke; globalThis.setTimeout = origTimeout;
	}
});
