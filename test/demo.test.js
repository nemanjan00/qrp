import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { state, el, define, router } from "../qrp/index.js";
import { form, inputs, textual, parseKV } from "../forms/index.js";

// Exercises the exact patterns the demo page wires up, end to end.

test("form + textual edit the same state, both directions", () => {
	const settings = state(parseKV("NICK=R2\nID=42"));

	const outlet = document.createElement("div");
	outlet.appendChild(form({
		fields: { NICK: { name: "Nick", input: inputs.text }, ID: { name: "ID", input: inputs.number } },
		sections: [{ name: "All", filter: () => true }],
		settings
	}));

	const area = textual(settings);
	outlet.appendChild(area);

	// state seeded into both the form and the textarea
	assert.match(area.value, /NICK=R2/);

	const nickInput = outlet.querySelector("input[type=text]");
	assert.equal(nickInput.value, "R2");

	// form -> state -> textarea
	nickInput.value = "C3PO";
	nickInput.dispatchEvent(new Event("input"));

	assert.equal(settings.NICK, "C3PO");
	assert.match(area.value, /NICK=C3PO/);

	// textarea -> state -> form
	area.value = "NICK=BB8\nID=99";
	area.dispatchEvent(new Event("input"));

	assert.equal(settings.NICK, "BB8");
	assert.equal(nickInput.value, "BB8");
});

test("counter route param drives initial state", () => {
	history.replaceState(null, "", "/counter/3");

	const outlet = document.createElement("div");

	const counter = (view, ctx) => {
		const c = state({ n: Number(ctx.params.start) || 0 });

		view.appendChild(el("h2", {}, () => `Count: ${c.n}`));
		view.appendChild(el("button", { onclick: () => c.n++ }, "+1"));
	};

	const app = router({ "/counter/:start": counter }, outlet);

	assert.equal(outlet.querySelector("h2").textContent, "Count: 3");

	outlet.querySelector("button").click();
	assert.equal(outlet.querySelector("h2").textContent, "Count: 4");

	app.dispose();
});

test("custom element cleans up on disconnect via qrp:disconnect", () => {
	let cleaned = false;

	define("qrp-resourceful", (host) => {
		host.addEventListener("qrp:disconnect", () => { cleaned = true; });
		host.appendChild(el("span", {}, "alive"));
	});

	const node = document.createElement("qrp-resourceful");
	document.body.appendChild(node);

	assert.equal(node.querySelector("span").textContent, "alive");

	node.remove();

	assert.equal(cleaned, true);
});
