/**
 * toasts/index.js — notifications driven by the global event pipe.
 *
 * Any code, anywhere, raises a notification by emitting on the bus — it never
 * needs to know the toast UI exists:
 *
 *   import { notify } from "./toasts/index.js";
 *   notify.success("Settings saved");
 *   notify.error("Could not reach the hotspot");
 *
 *   // ...or emit on the bus directly (e.g. from a service layer):
 *   bus.emit("error", { message: "Timeout" });
 *
 * Mount the stack once, near the root:
 *
 *   import { toasts } from "./toasts/index.js";
 *   mount(document.body, toasts.component);
 *
 * A toast's content is a RENDERABLE — a string, a DOM node, an array, or a
 * thunk () => renderable (anything el() accepts as a child) — so a toast can
 * carry a link, a button, an icon, whatever:
 *
 *   notify.error(el("span", {}, "Save failed — ",
 *       el("a", { href: "/logs" }, "see logs")));
 *
 * NOTE: a DOM node lives in exactly one place in the tree — inserting it
 * elsewhere MOVES it. If you want the same content in more than one toast, pass
 * a thunk (() => el(...)) so each toast builds its own node, rather than sharing
 * one live node between them.
 *
 * Repeated identical (string) messages inside DEDUPE_WINDOW are collapsed (so a
 * retry storm doesn't bury the screen), and each toast auto-dismisses after
 * TIMEOUT.
 */

import { state, el } from "../qrp/index.js";
import { bus } from "../events/index.js";

// --- configuration ----------------------------------------------------------

const TIMEOUT = 4000;          // ms before a toast auto-dismisses (0 = sticky)
const DEDUPE_WINDOW = 1000;    // ms within which an identical message is dropped

const VARIANTS = {
	success: "Success",
	error: "Error",
	info: "Info",
	warning: "Warning"
};

// --- factory ----------------------------------------------------------------

/**
 * Create a toast controller wired to an event emitter.
 *
 * @param {object} [options]
 * @param {object} [options.bus] emitter to listen on (default: the global bus)
 * @param {number} [options.timeout] auto-dismiss delay in ms (0 = sticky)
 * @param {number} [options.dedupeWindow] identical-message suppression window
 * @returns {object} { component, store, push, dismiss, success, error, info, warning }
 */
export const createToasts = (options = {}) => {
	const emitter = options.bus || bus;
	const timeout = options.timeout === undefined ? TIMEOUT : options.timeout;
	const dedupeWindow = options.dedupeWindow === undefined ? DEDUPE_WINDOW : options.dedupeWindow;

	const store = state({ items: [] });

	// message key -> last-shown timestamp, for deduping bursts.
	const lastSeen = {};

	let seq = 0;

	const dismiss = (id) => {
		store.items = store.items.filter((toast) => toast.id !== id);
	};

	/**
	 * Add a toast.
	 * @param {string} variant one of VARIANTS
	 * @param {(string|Node|Array|function)} content a renderable (el child)
	 * @param {object} [meta] optional { title }
	 */
	const push = (variant, content, meta = {}) => {
		// Dedupe only makes sense for plain string content.
		if(typeof content === "string") {
			const now = Date.now();
			const key = variant + ":" + content;

			if(lastSeen[key] && now - lastSeen[key] < dedupeWindow) {
				return;
			}

			lastSeen[key] = now;
		}

		const id = ++seq;

		store.items = [...store.items, {
			id,
			variant,
			title: meta.title || VARIANTS[variant] || variant,
			content
		}];

		if(timeout > 0) {
			setTimeout(() => dismiss(id), timeout);
		}
	};

	// --- wire the global event pipe -----------------------------------------
	// Payload may be a bare renderable, or { content | message | body, title }.
	const contentOf = (payload) => {
		if(payload && typeof payload === "object" && !(payload instanceof Node) && !Array.isArray(payload)) {
			return payload.content || payload.message || payload.body || String(payload);
		}

		return payload;
	};

	const titleOf = (payload) => {
		if(payload && typeof payload === "object" && !(payload instanceof Node)) {
			return payload.title;
		}

		return undefined;
	};

	Object.keys(VARIANTS).forEach((variant) => {
		emitter.on(variant, (payload) => push(variant, contentOf(payload), { title: titleOf(payload) }));
	});

	// --- the mountable component --------------------------------------------
	const component = (view) => {
		view.appendChild(el("div", { class: "qrp-toasts" }, () => {
			return store.items.map((toast) => {
				return el("div", { class: `qrp-toast qrp-toast-${toast.variant}`, role: "status" },
					el("strong", { class: "qrp-toast-title" }, toast.title),
					el("span", { class: "qrp-toast-body" }, toast.content),
					el("button", { class: "qrp-toast-close", onclick: () => dismiss(toast.id) }, "✕")
				);
			});
		}));
	};

	// Direct helpers, one per variant (push without going through the bus).
	const helpers = {};

	Object.keys(VARIANTS).forEach((variant) => {
		helpers[variant] = (content, meta) => push(variant, content, meta);
	});

	return { component, store, push, dismiss, ...helpers };
};

// --- default singleton wired to the global bus ------------------------------

export const toasts = createToasts();

/**
 * Fire-and-forget notifications through the global bus, so any module can raise
 * one without importing the toast UI at all. `content` is a renderable.
 */
export const notify = {
	success: (content) => bus.emit("success", content),
	error: (content) => bus.emit("error", content),
	info: (content) => bus.emit("info", content),
	warning: (content) => bus.emit("warning", content)
};
