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

	// a11y: the select is associated with its label (fixes Lighthouse select-name)
	assert.ok(select.id, "select gets an id");
	assert.equal(el.querySelector("label").getAttribute("for"), select.id);
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

	// a11y: the label is associated with the control (for -> id)
	const label = row.querySelector("label");
	const control = row.querySelector("input");
	assert.ok(control.id, "control gets an id");
	assert.equal(label.getAttribute("for"), control.id, "label.for points at the control");

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

test("field passes native attrs through (class, disabled, rows, aria-*)", () => {
	const settings = state({ BIO: "" });
	const row = field(settings, "BIO", {
		name: "Bio", type: "text",
		class: "form-control", disabled: true, "aria-describedby": "hint", placeholder: "…"
	});
	const input = row.querySelector("input");
	assert.equal(input.getAttribute("class"), "form-control");
	assert.equal(input.getAttribute("placeholder"), "…");
	assert.equal(input.getAttribute("aria-describedby"), "hint");
	assert.ok(input.hasAttribute("disabled"));
	// meta keys never leak onto the control as attributes
	assert.equal(input.hasAttribute("type") && input.getAttribute("type"), "text");
	assert.equal(input.hasAttribute("name"), false);
	assert.equal(input.hasAttribute("description"), false);
});

test("form renders the fields spec even when settings lacks the key (+ seeds default)", () => {
	const settings = state({});   // server hasn't sent anything yet
	const el = form({
		fields: { MODE: { name: "Mode", type: "text", default: "sta" } },
		settings
	});
	const input = el.querySelector("input");
	assert.ok(input, "field renders from the spec, not from settings keys");
	assert.equal(input.value, "sta", "default seeded into settings");
	assert.equal(settings.MODE, "sta");
});

test("form does not render unknown settings keys as mystery inputs", () => {
	const settings = state({ MODE: "sta", secretInternalFlag: true });
	const el = form({ fields: { MODE: { type: "text" } }, settings });
	assert.equal(el.querySelectorAll("input").length, 1, "only the declared field");
});

test("form supports dotted paths (nested settings), two-way bound", () => {
	const settings = state({ wifi: { ssid: "home" } });
	const el = form({
		fields: { "wifi.ssid": { name: "SSID", type: "text" } },
		settings
	});
	const input = el.querySelector("input");
	assert.equal(input.value, "home");

	input.value = "office";
	input.dispatchEvent(new Event("input"));
	assert.equal(settings.wifi.ssid, "office", "writes through the nested path");
});

test("form dotted path creates intermediate objects + seeds nested default", () => {
	const settings = state({});
	form({ fields: { "a.b.c": { type: "text", default: "x" } }, settings });
	assert.equal(settings.a.b.c, "x");
});
