/**
 * forms/index.js — the dashboard's settings-form engine, generalized.
 *
 * You describe fields declaratively; values live in one reactive state
 * object; inputs are two-way bound through the Proxy. Because bindings are
 * live, a "textual mode" textarea and the generated form can edit the SAME
 * state at the same time.
 *
 *   const settings = state(parseKV(text));
 *
 *   const fields = {
 *     NICK: { name: "Nick", description: "Name, nickname, etc.", input: inputs.text, default: "..." },
 *     SCREENS: { name: "Screensaver", input: inputs.multichoice({ "0": "Off", "1": "1" }) }
 *   };
 *
 *   const sections = [
 *     { name: "User", filter: key => ["NICK", "CS"].includes(key) },
 *     { name: "Other", filter: () => true }
 *   ];
 *
 *   view.appendChild(form({ fields, sections, settings }));
 *   ... later: serializeKV(settings)
 */

import { el, effect, raw } from "../qrp/index.js";

// --- KEY=value config-file format (the whole backend contract) -------------

export const parseKV = (text) => {
	const settings = {};

	text
		.trim()
		.split("\r").join("")
		.split("\n")
		.map(line => line.trim())
		.filter(line => line !== "")
		.forEach(line => {
			const segments = line.split("=");
			const key = segments.shift();

			settings[key] = segments.join("=");
		});

	return settings;
};

export const serializeKV = (settings) => {
	return Object.entries(settings)
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
};

// --- input type registry ----------------------------------------------------
//
// Input types are declared, not hand-written per field. A field says
// `type: "email"` (a string) and the registry resolves it to a factory. The
// registry is open: register your own types with registerInput().
//
// A factory has the signature (settings, key, field) => Element and is
// expected to two-way bind to settings[key] (usually via el's `bind`).

// Field-spec keys qrp interprets itself — everything else on the spec is a
// native attribute passed straight through to the control (so `class`,
// `disabled`, `readonly`, `rows`, `aria-*`, any framework hook, all reach it).
const META_KEYS = new Set(["name", "description", "type", "input", "default", "options"]);

/**
 * Native <input type=X> variants that need nothing beyond a type attribute.
 * Declared as data — adding one is a one-word edit, not a new function.
 */
const NATIVE_INPUT_TYPES = [
	"text", "number", "email", "password", "url", "tel", "search",
	"date", "time", "datetime-local", "month", "week",
	"color", "range", "checkbox"
];

const inputTypes = {};

/**
 * Register (or override) an input type by name.
 *   registerInput("stars", (settings, key, field) => el(...));
 * Then a field can declare `type: "stars"`. Returns the factory.
 */
export const registerInput = (type, factory) => {
	inputTypes[type] = factory;

	return factory;
};

/** Look up a registered input factory by name (undefined if absent). */
export const getInput = (type) => inputTypes[type];

const pickAttrs = (field) => {
	const attrs = {};

	Object.keys(field).forEach(attr => {
		if(!META_KEYS.has(attr) && field[attr] !== undefined) {
			attrs[attr] = field[attr];
		}
	});

	return attrs;
};

// Generate the simple native input types declaratively.
NATIVE_INPUT_TYPES.forEach(type => {
	registerInput(type, (settings, key, field = {}) => {
		return el("input", { type, ...pickAttrs(field), bind: [settings, key] });
	});
});

// Composite / non-<input> types.

registerInput("textarea", (settings, key, field = {}) => {
	return el("textarea", { ...pickAttrs(field), bind: [settings, key] });
});

registerInput("select", (settings, key, field = {}) => {
	const options = field.options || {};

	return el("select", { bind: [settings, key] },
		Object.entries(options).map(([value, label]) => el("option", { value }, label))
	);
});

registerInput("radio", (settings, key, field = {}) => {
	const options = field.options || {};

	return el("div", { class: "radio-group" },
		Object.entries(options).map(([value, label]) => {
			const input = el("input", {
				type: "radio",
				name: key,
				value,
				checked: () => String(settings[key]) === value,
				onchange: () => { settings[key] = value; }
			});

			return el("label", { class: "radio-option" }, input, label);
		})
	);
});

/**
 * Convenience factory for a select declared inline (backward-compatible with
 * the old inputs.multichoice(options) call site).
 */
export const multichoice = (options) => (settings, key, field = {}) => {
	return inputTypes.select(settings, key, { ...field, options });
};

/**
 * `inputs` exposes the registry plus the multichoice helper, so both the
 * declarative style (field.type: "email") and the procedural style
 * (field.input: inputs.text) keep working.
 */
export const inputs = new Proxy({ multichoice }, {
	get(target, key) {
		return target[key] || inputTypes[key];
	}
});

// --- form rendering ---------------------------------------------------------

/**
 * Resolve a field's input factory: explicit procedural `input` fn wins, then
 * a declarative `type` name from the registry, else plain text.
 */
const resolveInput = (field) => {
	if(typeof field.input === "function") {
		return field.input;
	}

	if(field.type && inputTypes[field.type]) {
		return inputTypes[field.type];
	}

	return inputTypes.text;
};

/**
 * Render one labelled field — the middle rung between an individual input and
 * the whole form(). Build a form row-by-row without the sections machinery:
 *   view.appendChild(field(settings, "NICK", { name: "Nick", type: "text" }));
 *
 * @param {object} settings reactive state holding the value
 * @param {string} key the settings key to bind
 * @param {object} [spec] { name, description, type, input, ...attrs }
 * @returns {Element} label + input (+ description)
 */
// labelable native controls — a <label for> only associates with these, not a
// wrapper like the radio-group div (which carries its own per-option labels).
const LABELABLE = new Set(["INPUT", "SELECT", "TEXTAREA"]);
let fieldSeq = 0;

export const field = (settings, key, spec = {}) => {
	const control = resolveInput(spec)(settings, key, spec);

	// associate the label with the control for a11y (screen readers, click-to-focus)
	const labelAttrs = {};
	if(control && LABELABLE.has(control.tagName)) {
		const id = `qrp-f${++fieldSeq}-${String(key).replace(/[^\w-]/g, "")}`;
		control.id = id;
		labelAttrs.for = id;
	}

	return el("div", { class: "setting-item" },
		el("label", labelAttrs, spec.name || key),
		control,
		spec.description ? el("div", { class: "description" }, spec.description) : null
	);
};

const settingsItem = field;

/**
 * Render a settings form. Returns a plain element; append it anywhere.
 * The form is reactive on the KEY SET: keys added or removed from settings
 * (e.g. by a live textual editor bound to the same state) appear/disappear.
 * Value edits only touch their own input's binding.
 *
 * @param {object} spec
 * @param {object} spec.settings reactive state object holding the values
 * @param {object} [spec.fields] map of key → field descriptor
 *   ({ name, description, type, input, default, ...attrs })
 * @param {object[]} [spec.sections] ordered [{ name, filter(key, value) }]
 *   groups; first matching section wins, else "Other"
 * @returns {Element} the form container element
 */
export const form = ({ fields = {}, sections = [{ name: "Settings", filter: () => true }], settings }) => {
	Object.entries(fields).forEach(([key, field]) => {
		if(settings[key] === undefined && field.default !== undefined) {
			settings[key] = field.default;
		}
	});

	const sectionFor = (key) => {
		// Read the value through raw() so this does NOT track the value —
		// only the key set drives re-grouping. Value edits are handled by
		// each input's own binding, so the form structure (and the user's
		// caret) survives them.
		const match = sections.find(section => section.filter(key, raw(settings)[key]));

		return match ? match.name : "Other";
	};

	return el("div", { class: "settings-container" }, () => {
		// Map, not {} — a section literally named "constructor"/"toString" would
		// otherwise hit an inherited Object.prototype member and crash .push.
		const grouped = new Map();

		Object.keys(settings).forEach(key => {
			const name = sectionFor(key);

			if(!grouped.has(name)) {
				grouped.set(name, []);
			}

			grouped.get(name).push(key);
		});

		return sections
			.map(section => section.name)
			.filter(name => grouped.has(name))
			.flatMap(name => [
				el("h3", {}, name),
				el("div", { class: "settings-section" },
					grouped.get(name).map(key => settingsItem(settings, key, fields[key]))
				)
			]);
	});
};

/**
 * A textarea editing the same settings state as the form, live in both
 * directions: type in the form → textarea updates; paste a config into the
 * textarea → form updates. No mode switch needed — this is what two-way
 * Proxy state buys you.
 */
export const textual = (settings) => {
	const textarea = el("textarea", {
		class: "textarea-input",
		oninput: () => {
			const incoming = parseKV(textarea.value);

			Object.keys({ ...settings }).forEach(key => {
				if(!(key in incoming)) {
					delete settings[key];
				}
			});

			Object.entries(incoming).forEach(([key, value]) => {
				if(settings[key] !== value) {
					settings[key] = value;
				}
			});
		}
	});

	// state → textarea, but never while the user is typing in it.
	effect(() => {
		// Serialize first so the effect tracks every key/value even when the
		// write is skipped.
		const text = serializeKV(settings);

		if(document.activeElement !== textarea) {
			textarea.value = text;
		}
	});

	return textarea;
};
