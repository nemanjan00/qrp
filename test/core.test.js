import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, effect, derive, raw, el, mount, scope, scoped, clear, onDispose } from "../qrp/index.js";

test("effect runs once immediately", () => {
	let runs = 0;

	effect(() => { runs++; });

	assert.equal(runs, 1);
});

test("effect re-runs only when a read key changes", () => {
	const s = state({ a: 1, b: 2 });

	let reads = 0;

	effect(() => { s.a; reads++; });

	assert.equal(reads, 1);

	s.b = 99; // not read by the effect

	assert.equal(reads, 1);

	s.a = 2;

	assert.equal(reads, 2);
});

test("setting the same value does not re-trigger", () => {
	const s = state({ a: 1 });

	let reads = 0;

	effect(() => { s.a; reads++; });

	s.a = 1;

	assert.equal(reads, 1);
});

test("nested objects are reactive", () => {
	const s = state({ user: { name: "R2" } });

	let seen;

	effect(() => { seen = s.user.name; });

	assert.equal(seen, "R2");

	s.user.name = "C3PO";

	assert.equal(seen, "C3PO");
});

test("adding a new key triggers iteration effects", () => {
	const s = state({ a: 1 });

	let keys;

	effect(() => { keys = Object.keys(s).length; });

	assert.equal(keys, 1);

	s.b = 2;

	assert.equal(keys, 2);

	delete s.b;

	assert.equal(keys, 1);
});

test("derive produces a reactive computed value", () => {
	const s = state({ first: "Luke", last: "Skywalker" });

	const full = derive(() => `${s.first} ${s.last}`);

	assert.equal(full.value, "Luke Skywalker");

	s.first = "Anakin";

	assert.equal(full.value, "Anakin Skywalker");
});

test("effect.dispose stops re-runs", () => {
	const s = state({ a: 1 });

	let reads = 0;

	const runner = effect(() => { s.a; reads++; });

	s.a = 2;
	assert.equal(reads, 2);

	runner.dispose();

	s.a = 3;
	assert.equal(reads, 2);
});

test("child effects are disposed with their parent", () => {
	const s = state({ outer: 0, inner: 0 });

	let innerRuns = 0;

	const parent = effect(() => {
		s.outer;

		effect(() => { s.inner; innerRuns++; });
	});

	assert.equal(innerRuns, 1);

	s.inner = 1;
	assert.equal(innerRuns, 2);

	// Re-running the parent should dispose the old child, not leak it.
	s.outer = 1;
	assert.equal(innerRuns, 3); // one fresh child ran

	s.inner = 2;
	assert.equal(innerRuns, 4); // only the current child, not two

	parent.dispose();

	s.inner = 3;
	assert.equal(innerRuns, 4); // no leaked children
});

test("raw unwraps a proxy", () => {
	const plain = { a: 1 };
	const s = state(plain);

	assert.equal(raw(s), plain);
});

test("state does not wrap DOM nodes stored inside it", () => {
	const node = document.createElement("div");
	const s = state({ el: node });

	// Must be the exact same node, not a Proxy — branded DOM methods must work.
	assert.equal(s.el, node);

	const parent = document.createElement("section");
	// appendChild would throw "not of type Node" if s.el were a Proxy.
	parent.appendChild(s.el);
	assert.equal(parent.firstChild, node);
});

test("state does not wrap Map/Set instances", () => {
	const map = new Map([["a", 1]]);
	const s = state({ map });

	// .size would throw "incompatible receiver" through a Proxy.
	assert.equal(s.map.size, 1);
	assert.equal(s.map.get("a"), 1);
	assert.equal(s.map, map);
});

test("scope disposes all effects created within it", () => {
	const s = state({ a: 1 });

	let reads = 0;

	const sc = scope(() => {
		effect(() => { s.a; reads++; });
		effect(() => { s.a; reads++; });
	});

	assert.equal(reads, 2);

	s.a = 2;
	assert.equal(reads, 4);

	sc.dispose();

	s.a = 3;
	assert.equal(reads, 4);
});

test("reactive region does not crash after its anchor's parent is cleared", () => {
	const s = state({ n: 0 });
	const inner = el("div", {}, () => `n=${s.n}`);
	el("div", {}, inner); // parent wrapper

	assert.equal(inner.textContent, "n=0");

	// clear the region's direct parent, detaching the anchor
	clear(inner);

	// the next write must NOT throw (null insertBefore); it just no-ops the DOM
	assert.doesNotThrow(() => { s.n = 1; });
});

test("clear empties a node", () => {
	const parent = el("div", {}, el("span", {}, "a"), el("span", {}, "b"), "text");

	assert.equal(parent.childNodes.length, 3);

	clear(parent);

	assert.equal(parent.childNodes.length, 0);
	assert.equal(parent.innerHTML, "");
});

test("el sets attributes, props and events", () => {
	let clicked = 0;

	const button = el("button", {
		class: "big",
		id: "go",
		onclick: () => { clicked++; }
	}, "Press");

	assert.equal(button.className, "big");
	assert.equal(button.id, "go");
	assert.equal(button.textContent, "Press");

	button.click();
	assert.equal(clicked, 1);
});

test("el reactive text updates on state change", () => {
	const s = state({ n: 1 });

	const span = el("span", {}, () => `n=${s.n}`);

	assert.equal(span.textContent, "n=1");

	s.n = 5;
	assert.equal(span.textContent, "n=5");
});

test("el reactive children list updates", () => {
	const s = state({ items: ["a", "b"] });

	const ul = el("ul", {}, () => s.items.map(i => el("li", {}, i)));

	assert.equal(ul.querySelectorAll("li").length, 2);

	s.items = ["a", "b", "c"];
	assert.equal(ul.querySelectorAll("li").length, 3);
});

test("bind is two-way for text inputs", () => {
	const s = state({ name: "R2" });

	const input = el("input", { type: "text", bind: [s, "name"] });

	assert.equal(input.value, "R2");

	// state -> DOM
	s.name = "D2";
	assert.equal(input.value, "D2");

	// DOM -> state
	input.value = "BB8";
	input.dispatchEvent(new Event("input"));
	assert.equal(s.name, "BB8");
});

test("bind coerces number inputs", () => {
	const s = state({ n: 1 });

	const input = el("input", { type: "number", bind: [s, "n"] });

	input.value = "42";
	input.dispatchEvent(new Event("input"));

	assert.equal(s.n, 42);
	assert.equal(typeof s.n, "number");
});

test("bind handles checkboxes", () => {
	const s = state({ on: false });

	const input = el("input", { type: "checkbox", bind: [s, "on"] });

	assert.equal(input.checked, false);

	s.on = true;
	assert.equal(input.checked, true);

	input.checked = false;
	input.dispatchEvent(new Event("change"));
	assert.equal(s.on, false);
});

test("mount disposes component effects", () => {
	const parent = document.createElement("div");
	const s = state({ n: 0 });

	let reads = 0;

	const app = mount(parent, (view) => {
		view.appendChild(el("span", {}, () => { reads++; return `${s.n}`; }));
	});

	assert.equal(reads, 1);

	s.n = 1;
	assert.equal(reads, 2);

	app.dispose();

	s.n = 2;
	assert.equal(reads, 2); // no leak after unmount
	assert.equal(parent.innerHTML, "");
});

test("scoped returns the built value and a dispose that tears its effects down", () => {
	const s = state({ n: 0 });
	let runs = 0;

	// built OUTSIDE any render/scope (like a modal opened from onclick)
	const { value, dispose } = scoped(() => {
		effect(() => { void s.n; runs++; });
		return el("div", {}, "modal");
	});

	assert.equal(value.textContent, "modal");
	assert.equal(runs, 1);

	s.n = 1;
	assert.equal(runs, 2, "effect is live while scoped");

	dispose();
	s.n = 2;
	assert.equal(runs, 2, "effect disposed — no leak");
});

test("scoped() called inside a running effect owns its effects and disposers", () => {
	const s = state({ x: 0 });
	let runs = 0;
	let cleaned = 0;
	let handle;

	effect(() => {
		handle = scoped(() => {
			effect(() => { void s.x; runs++; });
			onDispose(() => { cleaned++; });
		});
	});

	assert.equal(runs, 1);

	handle.dispose();
	assert.equal(cleaned, 1, "the scope's onDispose ran");

	s.x++;
	assert.equal(runs, 1, "the scope's effect was disposed with it");
});

test("mount() called inside a running effect disposes its component's effects", () => {
	const s = state({ x: 0 });
	const host = document.createElement("div");
	let runs = 0;
	let handle;

	effect(() => {
		handle = mount(host, () => {
			effect(() => { void s.x; runs++; });
			return el("span", {}, "hi");
		});
	});

	handle.dispose();
	s.x++;

	assert.equal(runs, 1);
	assert.equal(host.childNodes.length, 0);
});

test("a scope created inside an effect is disposed when that effect re-runs or is disposed", () => {
	const s = state({ x: 0, outer: 0 });
	let runs = 0;
	let cleaned = 0;

	const outer = effect(() => {
		void s.outer;
		scope(() => {
			effect(() => { void s.x; runs++; });
			onDispose(() => { cleaned++; });
		});
	});

	assert.equal(runs, 1);

	s.outer++;
	assert.equal(cleaned, 1, "the previous run's scope was disposed");
	assert.equal(runs, 2, "the new run built a fresh inner effect");

	s.x++;
	assert.equal(runs, 3, "only the live inner effect re-runs");

	outer.dispose();
	assert.equal(cleaned, 2);

	s.x++;
	assert.equal(runs, 3);
});

test("a scope inside an effect keeps nested effects owned by their own effect", () => {
	const s = state({ x: 0, y: 0 });
	let innerRuns = 0;
	let handle;

	effect(() => {
		handle = scoped(() => {
			effect(() => {
				void s.x;
				effect(() => { void s.y; innerRuns++; });
			});
		});
	});

	s.x++;
	s.y++;
	assert.equal(innerRuns, 3, "the re-run's grandchild replaced the old one");

	handle.dispose();
	s.y++;
	assert.equal(innerRuns, 3);
});

test("mount appends the component's RETURN value (the docs' () => el(...) style)", () => {
	const parent = document.createElement("div");
	const s = state({ n: 0 });
	mount(parent, () => el("button", { onclick: () => s.n++ }, () => `n ${s.n}`));
	assert.equal(parent.children.length, 1);
	assert.equal(parent.querySelector("button").textContent, "n 0");
	s.n = 1;
	assert.equal(parent.querySelector("button").textContent, "n 1");
});

test("mount does NOT double-append when the component appends to its view", () => {
	const parent = document.createElement("div");
	mount(parent, (view) => view.appendChild(el("p", {}, "once")));   // returns the appended node
	assert.equal(parent.querySelectorAll("p").length, 1, "not doubled");
});

test("el(): null/undefined/false on a DOM property removes the attribute", () => {
	const a = el("a", { href: null, title: null, id: undefined, class: false });

	assert.equal(a.hasAttribute("href"), false);
	assert.equal(a.hasAttribute("title"), false);
	assert.equal(a.hasAttribute("id"), false);
	assert.equal(a.hasAttribute("class"), false);
});

test("el(): a reactive prop going falsy removes the attribute it set", () => {
	const s = state({ on: true, href: "/x" });
	const a = el("a", { class: () => s.on && "active", href: () => s.href });

	assert.equal(a.getAttribute("class"), "active");
	assert.equal(a.getAttribute("href"), "/x");

	s.on = false;
	s.href = null;

	assert.equal(a.hasAttribute("class"), false);
	assert.equal(a.hasAttribute("href"), false);
});

test("el(): boolean props still take false; value null becomes empty", () => {
	const s = state({ on: true });
	const input = el("input", { disabled: () => s.on, checked: () => s.on, hidden: () => s.on, value: null });

	assert.equal(input.disabled, true);
	assert.equal(input.checked, true);
	assert.equal(input.hidden, true);
	assert.equal(input.value, "");

	s.on = false;

	assert.equal(input.disabled, false);
	assert.equal(input.checked, false);
	assert.equal(input.hidden, false);
	assert.equal(input.hasAttribute("disabled"), false);
});

test("el(): bind applies after other props, so type is set first", () => {
	const s = state({ ok: true });
	const box = el("input", { bind: [s, "ok"], type: "checkbox" });

	assert.equal(box.checked, true);

	box.checked = false;
	box.dispatchEvent(new Event("change"));

	assert.equal(s.ok, false);
});

test("el(): style object sets CSS custom properties", () => {
	const s = state({ w: "10px" });
	const div = el("div", { style: () => ({ "--w": s.w, color: "red" }) });

	assert.equal(div.style.getPropertyValue("--w"), "10px");
	assert.equal(div.style.color, "red");

	s.w = "20px";

	assert.equal(div.style.getPropertyValue("--w"), "20px");
});

test("el(): false keeps its meaning on aria* and contentEditable", () => {
	// happy-dom lacks ARIA reflection; browsers reflect ariaExpanded ↔ aria-expanded.
	const proto = HTMLElement.prototype;
	const had = Object.getOwnPropertyDescriptor(proto, "ariaExpanded");
	Object.defineProperty(proto, "ariaExpanded", {
		configurable: true,
		get() { return this.getAttribute("aria-expanded"); },
		set(v) {
			if(v === null) { this.removeAttribute("aria-expanded"); } else { this.setAttribute("aria-expanded", String(v)); }
		}
	});

	try {
		const s = state({ open: true });
		const div = el("div", { ariaExpanded: () => s.open, contentEditable: () => s.open });

		s.open = false;

		assert.equal(div.getAttribute("aria-expanded"), "false");
		assert.equal(div.contentEditable, "false");
	} finally {
		if(had) { Object.defineProperty(proto, "ariaExpanded", had); } else { delete proto.ariaExpanded; }
	}
});

test("el(): read-only props (list, form) fall back to the attribute", () => {
	const s = state({ list: "suggestions" });
	const input = el("input", { list: () => s.list, form: "settings" });

	assert.equal(input.getAttribute("list"), "suggestions");
	assert.equal(input.getAttribute("form"), "settings");

	s.list = null;

	assert.equal(input.hasAttribute("list"), false);
});

test("el(): clearing htmlFor removes the for attribute", () => {
	const s = state({ target: "name" });
	const label = el("label", { htmlFor: () => s.target });

	assert.equal(label.getAttribute("for"), "name");

	s.target = null;

	assert.equal(label.hasAttribute("for"), false);
});
