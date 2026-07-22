import test from "node:test";
import assert from "node:assert/strict";
import { num, compact, pct, bytes, duration, relTime, date } from "../format/index.js";

test("format: num/compact/pct/bytes", () => {
	assert.equal(num(1234.5), "1,234.5");
	assert.equal(compact(43373), "43.4K");
	assert.equal(pct(0.13), "13%");
	assert.equal(bytes(1536), "1.5 KB");
	assert.equal(bytes(500), "500 B");
});

test("format: duration picks the largest unit", () => {
	assert.equal(duration(87 * 864e5), "2.9 months");
	assert.match(duration(90 * 1000), /1\.5 minutes/);
});

test("format: relTime + date", () => {
	assert.equal(relTime(new Date(Date.now() - 2 * 36e5)), "2 hours ago");
	assert.match(date("2026-07-17T00:00:00Z", { dateStyle: "medium", timeZone: "UTC" }), /2026/);
});

test("format: nullish/NaN → empty string", () => {
	assert.equal(num(null), "");
	assert.equal(compact(undefined), "");
	assert.equal(bytes(NaN), "");
	assert.equal(date(null), "");
});
