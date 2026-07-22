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

test("download creates + clicks an anchor (no throw)", () => {
	const origCreate = URL.createObjectURL, origRevoke = URL.revokeObjectURL;
	URL.createObjectURL = () => "blob:x";
	URL.revokeObjectURL = () => {};
	try {
		let clicked = false;
		const realCreate = document.createElement.bind(document);
		document.createElement = (t) => { const el = realCreate(t); if(t === "a") { el.click = () => { clicked = true; }; } return el; };
		download("a,b\n1,2", "x.csv");
		assert.equal(clicked, true);
		document.createElement = realCreate;
	} finally {
		URL.createObjectURL = origCreate; URL.revokeObjectURL = origRevoke;
	}
});
