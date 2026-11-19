import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { el, mount, scoped, state, when } from "../qrp/index.js";
import { embed } from "../behaviors/embed.js";
import { stickToBottom } from "../behaviors/stick-to-bottom.js";
import { size } from "../browser/index.js";

// A ResizeObserver tests drive by hand: fire(target, width, height).
// node --test runs each file in its own process, so the global stays local.
const observers = [];

globalThis.ResizeObserver = function(callback) {
	this.callback = callback;
	this.targets = [];
	this.disconnected = false;
	observers.push(this);
};
globalThis.ResizeObserver.prototype.observe = function(target) { this.targets.push(target); };
globalThis.ResizeObserver.prototype.disconnect = function() { this.disconnected = true; };

const fire = (target, width, height) => observers
	.filter((o) => !o.disconnected && o.targets.includes(target))
	.forEach((o) => o.callback([{ target, contentRect: { width, height } }]));

const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

test("embed creates the widget only once the host is connected", () => {
	const calls = [];
	const root = document.createElement("div");
	const owned = scoped(() => embed((host) => {
		calls.push(host.isConnected);
	}, { props: { class: "chart" } }));

	assert.equal(owned.value.className, "chart");

	return frame().then(() => {
		assert.deepEqual(calls, []);
		document.body.appendChild(root);
		root.appendChild(owned.value);

		return frame();
	}).then(() => {
		assert.deepEqual(calls, [true]);
		owned.dispose();
		root.remove();
	});
});

test("embed forwards resizes and destroys with its scope", () => {
	const log = [];
	const root = document.createElement("div");

	document.body.appendChild(root);

	const mounted = mount(root, () => embed(() => ({
		resize: (w, h) => log.push(`resize ${w}x${h}`),
		destroy: () => log.push("destroy")
	})));

	return frame().then(() => {
		const host = root.firstChild;

		fire(host, 300, 200);
		fire(host, 300, 200);
		mounted.dispose();
		fire(host, 400, 200);
		assert.deepEqual(log, ["resize 300x200", "destroy"]);
		root.remove();
	});
});

test("embed accepts a teardown function and cancels a pending create", () => {
	let torn = 0;
	let created = 0;
	const root = document.createElement("div");

	document.body.appendChild(root);

	const live = state({ on: true });
	const mounted = mount(root, () => when(() => live.on, () => embed(() => {
		created += 1;
		return () => {
			torn += 1;
		};
	})));

	live.on = false;

	return frame().then(() => {
		assert.equal(created, 0);
		live.on = true;

		return frame();
	}).then(() => {
		assert.equal(created, 1);
		mounted.dispose();
		assert.equal(torn, 1);
		root.remove();
	});
});

test("size() tracks an element and disconnects with its scope", () => {
	const node = el("div", {});
	const owned = scoped(() => size(node));

	fire(node, 120, 40);
	assert.deepEqual([owned.value.width, owned.value.height], [120, 40]);
	owned.dispose();
	fire(node, 10, 10);
	assert.equal(owned.value.width, 120);
});

// happy-dom doesn't lay out: give the scroller fixed metrics we control.
const fakeScroller = () => {
	const node = el("div", {});
	const metrics = { scrollHeight: 1000, clientHeight: 200 };

	Object.defineProperty(node, "scrollHeight", { get: () => metrics.scrollHeight });
	Object.defineProperty(node, "clientHeight", { get: () => metrics.clientHeight });
	node.scrollTop = 0;

	return { node, metrics };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("stickToBottom follows new content while pinned", () => {
	const { node, metrics } = fakeScroller();
	const stick = stickToBottom(node);

	assert.equal(node.scrollTop, 1000);
	metrics.scrollHeight = 1200;
	node.appendChild(el("p", {}, "line"));

	return settle().then(() => {
		assert.equal(node.scrollTop, 1200);
		assert.equal(stick.pinned.value, true);
		stick.dispose();
	});
});

test("stickToBottom lets go when the user scrolls up, and re-pins", () => {
	const { node, metrics } = fakeScroller();
	const stick = stickToBottom(node);

	node.scrollTop = 300;
	node.dispatchEvent(new Event("scroll"));
	assert.equal(stick.pinned.value, false);
	metrics.scrollHeight = 1500;
	node.appendChild(el("p", {}, "line"));

	return settle().then(() => {
		assert.equal(node.scrollTop, 300);
		stick.scrollToBottom();
		assert.equal(node.scrollTop, 1500);
		assert.equal(stick.pinned.value, true);
		stick.dispose();
	});
});

test("stickToBottom stops with its scope", () => {
	const { node, metrics } = fakeScroller();
	const owned = scoped(() => stickToBottom(node));

	owned.dispose();
	metrics.scrollHeight = 2000;
	node.appendChild(el("p", {}, "line"));

	return settle().then(() => assert.equal(node.scrollTop, 1000));
});
