import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { el, mount } from "../qrp/index.js";
import { emitter } from "../events/index.js";
import { createToasts } from "../toasts/index.js";

// Each test gets its own emitter so the global bus isn't shared across tests.
const setup = (options = {}) => {
	const bus = emitter();
	const ctl = createToasts({ bus, timeout: 0, ...options });

	const root = document.createElement("div");
	mount(root, ctl.component);

	return { bus, ctl, root };
};

test("string toast renders with title and body", () => {
	const { ctl, root } = setup();

	ctl.success("Saved");

	const toast = root.querySelector(".qrp-toast-success");
	assert.ok(toast);
	assert.equal(toast.querySelector(".qrp-toast-title").textContent, "Success");
	assert.equal(toast.querySelector(".qrp-toast-body").textContent, "Saved");
});

test("error and success are distinct variants", () => {
	const { ctl, root } = setup();

	ctl.error("Boom");
	ctl.success("Yay");

	assert.equal(root.querySelectorAll(".qrp-toast-error").length, 1);
	assert.equal(root.querySelectorAll(".qrp-toast-success").length, 1);
});

test("renderable node content is rendered", () => {
	const { ctl, root } = setup();

	ctl.error(el("a", { href: "/logs" }, "see logs"));

	const link = root.querySelector(".qrp-toast-body a");
	assert.ok(link);
	assert.equal(link.getAttribute("href"), "/logs");
	assert.equal(link.textContent, "see logs");
});

test("thunk content builds fresh nodes (safe for reuse)", () => {
	const { ctl, root } = setup();

	const make = () => el("strong", {}, "retry");

	ctl.info(make);
	ctl.info(make);

	// Two independent nodes, one per toast — not the same node moved.
	const strongs = root.querySelectorAll(".qrp-toast-body strong");
	assert.equal(strongs.length, 2);
	assert.notEqual(strongs[0], strongs[1]);
});

test("duplicate string messages are deduped within the window", () => {
	const { ctl, root } = setup({ dedupeWindow: 1000 });

	ctl.error("Timeout");
	ctl.error("Timeout");
	ctl.error("Timeout");

	assert.equal(root.querySelectorAll(".qrp-toast-error").length, 1);
});

test("custom title via meta", () => {
	const { ctl, root } = setup();

	ctl.warning("Low battery", { title: "Heads up" });

	assert.equal(root.querySelector(".qrp-toast-title").textContent, "Heads up");
});

test("bus events raise toasts (global event pipe)", () => {
	const { bus, root } = setup();

	bus.emit("success", { message: "Via bus" });
	bus.emit("error", "Bare string too");

	assert.equal(root.querySelector(".qrp-toast-success .qrp-toast-body").textContent, "Via bus");
	assert.equal(root.querySelector(".qrp-toast-error .qrp-toast-body").textContent, "Bare string too");
});

test("dismiss removes a toast", () => {
	const { ctl, root } = setup();

	ctl.info("Note");
	const before = root.querySelectorAll(".qrp-toast").length;
	assert.equal(before, 1);

	const id = ctl.store.items[0].id;
	ctl.dismiss(id);

	assert.equal(root.querySelectorAll(".qrp-toast").length, 0);
});

test("auto-dismiss after timeout", async () => {
	const { ctl, root } = setup({ timeout: 30 });

	ctl.info("Fleeting");
	assert.equal(root.querySelectorAll(".qrp-toast").length, 1);

	await new Promise((resolve) => setTimeout(resolve, 60));

	assert.equal(root.querySelectorAll(".qrp-toast").length, 0);
});
