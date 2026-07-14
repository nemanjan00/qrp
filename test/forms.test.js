import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state } from "../qrp/index.js";
import {
	form, field, inputs, multichoice, registerInput, getInput,
	parseKV, serializeKV
} from "../forms/index.js";

test("parseKV / serializeKV round-trip", () => {
	const text = "NICK=R2\nID=42";
	const parsed = parseKV(text);

	assert.deepEqual(parsed, { NICK: "R2", ID: "42" });
	assert.equal(serializeKV(parsed), text);
});

test("declarative type resolves a native input", () => {
	const settings = state({ EMAIL: "" });

	const el = form({
		fields: { EMAIL: { name: "Email", type: "email" } },
		sections: [{ name: "All", filter: () => true }],
		settings
	});

	const input = el.querySelector("input");
	assert.equal(input.type, "email");

	input.value = "r2@droids.example";
	input.dispatchEvent(new Event("input"));
	assert.equal(settings.EMAIL, "r2@droids.example");
});

test("passthrough attributes reach native inputs", () => {
	const settings = state({ VOL: 3 });

	const el = form({
		fields: { VOL: { name: "Volume", type: "range", min: 0, max: 10, step: 1 } },
		sections: [{ name: "All", filter: () => true }],
		settings
	});

	const input = el.querySelector("input");
	assert.equal(input.type, "range");
	assert.equal(input.getAttribute("min"), "0");
	assert.equal(input.getAttribute("max"), "10");
});

test("range binds as a number", () => {
	const settings = state({ VOL: 3 });

	const el = form({
		fields: { VOL: { type: "range", min: 0, max: 10 } },
		sections: [{ name: "All", filter: () => true }],
		settings
	});

	const input = el.querySelector("input");
	input.value = "7";
	input.dispatchEvent(new Event("input"));

	assert.equal(settings.VOL, 7);
	assert.equal(typeof settings.VOL, "number");
});

test("select via declarative type + options", () => {
	const settings = state({ MODE: "dmr" });

	const el = form({
		fields: { MODE: { type: "select", options: { dmr: "DMR", ysf: "YSF" } } },
		sections: [{ name: "All", filter: () => true }],
		settings
	});

	const select = el.querySelector("select");
	assert.equal(select.querySelectorAll("option").length, 2);
	assert.equal(select.value, "dmr");
});

test("radio group sets state on change", () => {
	const settings = state({ BAND: "vhf" });

	const el = form({
		fields: { BAND: { type: "radio", options: { vhf: "VHF", uhf: "UHF" } } },
		sections: [{ name: "All", filter: () => true }],
		settings
	});

	const radios = el.querySelectorAll("input[type=radio]");
	assert.equal(radios.length, 2);

	radios[1].checked = true;
	radios[1].dispatchEvent(new Event("change"));

	assert.equal(settings.BAND, "uhf");
});

test("registerInput adds a custom type usable declaratively", () => {
	registerInput("shout", (settings, key) => {
		const input = inputs.text(settings, key);
		input.dataset.shout = "true";
		return input;
	});

	assert.equal(typeof getInput("shout"), "function");

	const settings = state({ MSG: "hi" });

	const el = form({
		fields: { MSG: { type: "shout" } },
		sections: [{ name: "All", filter: () => true }],
		settings
	});

	assert.equal(el.querySelector("input").dataset.shout, "true");
});

test("field() renders one labelled input standalone (no form needed)", () => {
	const settings = state({ NICK: "R2" });

	const row = field(settings, "NICK", { name: "Nick", type: "text", description: "your handle" });

	assert.equal(row.querySelector("label").textContent, "Nick");
	assert.equal(row.querySelector("input").value, "R2");
	assert.equal(row.querySelector(".description").textContent, "your handle");

	// still two-way bound
	const input = row.querySelector("input");
	input.value = "C3PO";
	input.dispatchEvent(new Event("input"));
	assert.equal(settings.NICK, "C3PO");
});

test("backward-compatible procedural inputs still work", () => {
	const settings = state({ NICK: "R2", MODE: "a" });

	const el = form({
		fields: {
			NICK: { input: inputs.text },
			MODE: { input: multichoice({ a: "A", b: "B" }) }
		},
		sections: [{ name: "All", filter: () => true }],
		settings
	});

	assert.equal(el.querySelector("input").value, "R2");
	assert.equal(el.querySelector("select").querySelectorAll("option").length, 2);
});
