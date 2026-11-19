import test from "node:test";
import assert from "node:assert/strict";

import { si, parseSI } from "../format/index.js";

test("si picks the SI prefix and appends the unit", () => {
	assert.equal(si(0.0012, "V"), "1.2 mV");
	assert.equal(si(433.92e6, "Hz"), "433.92 MHz");
	assert.equal(si(-381.042e-3, "V"), "-381.042 mV");
	assert.equal(si(1500), "1.5 k");
	assert.equal(si(12), "12");
	assert.equal(si(0, "V"), "0 V");
	assert.equal(si(4.7e-6, "F"), "4.7 µF");
});

test("si steps up a prefix when rounding reaches 1000", () => {
	assert.equal(si(999.9996), "1 k");
	assert.equal(si(999999.9, "Hz"), "1 MHz");
});

test("si clamps to the prefix range and is blank for bad input", () => {
	assert.equal(si(2e18, "Hz"), "2,000 PHz");
	assert.equal(si(null), "");
	assert.equal(si(NaN, "V"), "");
	assert.equal(si(Infinity, "V"), "");
});

test("si takes Intl options", () => {
	assert.equal(si(1234.5678, "Hz", { maximumFractionDigits: 1 }), "1.2 kHz");
	assert.equal(si(1000, "Hz", { minimumFractionDigits: 2 }), "1.00 kHz");
});

test("parseSI reads prefixes, units and exponents", () => {
	assert.equal(parseSI("2.4G"), 2.4e9);
	assert.equal(parseSI("100m"), 0.1);
	assert.equal(parseSI("3.3 kV", "V"), 3300);
	assert.equal(parseSI("3.3k", "V"), 3300);
	assert.equal(parseSI("2 V", "V"), 2);
	assert.equal(parseSI("-5 mV", "V"), -0.005);
	assert.equal(parseSI("−5m"), -0.005);
	assert.equal(parseSI("1e3"), 1000);
	assert.equal(parseSI("1.5e-3k"), 1.5);
	assert.equal(parseSI(42), 42);
});

test("parseSI accepts typed spellings of micro and kilo", () => {
	assert.equal(parseSI("4.7u"), 4.7e-6);
	assert.equal(parseSI("4.7μF", "F"), 4.7e-6);
	assert.equal(parseSI("10K"), 10000);
});

test("parseSI is case-sensitive: m is milli, M is mega", () => {
	assert.equal(parseSI("1m"), 0.001);
	assert.equal(parseSI("1M"), 1e6);
});

test("parseSI returns NaN for anything that isn't a number", () => {
	[parseSI("12:30"), parseSI("5 x"), parseSI("abc"), parseSI(""), parseSI(null), parseSI("1.2.3"), parseSI("5 mA", "V")]
		.forEach((value) => assert.ok(Number.isNaN(value)));
});

test("parseSI round-trips si", () => {
	[0.0012, 433.92e6, -2.5e-9, 1500].forEach((value) => {
		assert.ok(Math.abs(parseSI(si(value, "Hz"), "Hz") - value) <= Math.abs(value) * 1e-9);
	});
});
