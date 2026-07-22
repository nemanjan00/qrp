/**
 * browser/index.js — reactive facades over browser APIs everyone forgot about.
 *
 * The browser already ships most of what frameworks reinvent. This module
 * wraps the good parts as qrp state, so they compose with effect()/el():
 *
 *   persisted()  localStorage with write-through AND cross-tab sync
 *   query()      the URL query string as two-way reactive state
 *   hashState()  location.hash as reactive state
 *   media()      matchMedia as reactive state (dark mode, breakpoints)
 *   viewport()   window size
 *   online()     navigator.onLine
 *   visible()    Page Visibility API
 *   seen()       IntersectionObserver — "is this element on screen"
 *
 * Every factory registers its listeners/observers/intervals through onDispose,
 * so creating one inside a component (or scope) auto-cleans on unmount — no
 * leak. Created at top level (no active scope), they live for the page, which
 * is usually what you want for a global like online()/viewport().
 */

import { state, effect, raw, onDispose } from "../qrp/index.js";

// Add a listener and auto-remove it when the enclosing scope disposes.
const listen = (target, type, handler, opts) => {
	target.addEventListener(type, handler, opts);
	onDispose(() => target.removeEventListener(type, handler, opts));
};

/**
 * Reactive state persisted to localStorage under storageKey.
 * Every write goes through the Proxy → serialized back to storage.
 * The `storage` event keeps state in sync ACROSS TABS — free multi-tab
 * reactivity, no BroadcastChannel, no websocket, no library.
 */
export const persisted = (storageKey, defaults = {}) => {
	const load = () => {
		try {
			return JSON.parse(localStorage.getItem(storageKey)) || {};
		} catch {
			return {};
		}
	};

	const store = state({ ...defaults, ...load() });

	effect(() => {
		// JSON.stringify reads every key through the Proxy, so this effect
		// tracks the whole object — any write re-persists.
		localStorage.setItem(storageKey, JSON.stringify(store));
	});

	listen(window, "storage", (event) => {
		if(event.key !== storageKey) {
			return;
		}

		let incoming = {};

		try {
			incoming = JSON.parse(event.newValue) || {};
		} catch {
			return;
		}

		Object.keys(raw(store)).forEach(key => {
			if(!(key in incoming)) {
				delete store[key];
			}
		});

		Object.assign(store, incoming);
	});

	return store;
};

/**
 * The URL query string as two-way reactive state.
 * Reading tracks; writing updates the address bar via replaceState;
 * back/forward navigation updates the state. The URL becomes your store —
 * shareable, bookmarkable, refresh-proof, no state library required.
 *
 * Keys are string-valued by default. Declare multi-value keys via
 * `query({ arrays: ["status", "ids"] })`: those keys are ALWAYS arrays (absent →
 * `[]`), parsed from repeated params (`?status=a&status=b` → `["a","b"]`) and
 * serialized back to the repeated-key form — the same shape `createHttp` sends.
 * Push/splice or assign a new array to update the URL; empty arrays drop the key.
 *
 * @param {object} [options]
 * @param {string[]} [options.arrays] keys to treat as multi-value arrays
 * @returns {object} reactive state mirroring the query string
 */
export const query = (options = {}) => {
	const arrays = new Set(options.arrays || []);

	const parse = () => {
		const search = new URLSearchParams(location.search);
		const out = {};

		// Single-valued keys: last wins (matches the prior Object.fromEntries).
		search.forEach((value, key) => {
			if(!arrays.has(key)) {
				out[key] = value;
			}
		});

		// Declared array keys are ALWAYS an array (possibly empty) so callers
		// never branch on string-vs-array.
		arrays.forEach((key) => {
			out[key] = search.getAll(key);
		});

		return out;
	};

	const params = state(parse());

	effect(() => {
		const search = new URLSearchParams();

		Object.entries(params).forEach(([key, value]) => {
			if(Array.isArray(value)) {
				// Repeated-key form; iterating reads length + indices, so a
				// push/splice re-runs this effect and re-serializes.
				value.forEach((item) => {
					if(item != null && item !== "") {
						search.append(key, item);
					}
				});
			} else if(value != null && value !== "") {
				search.set(key, value);
			}
		});

		const suffix = search.toString();
		const next = location.pathname + (suffix ? "?" + suffix : "") + location.hash;

		if(next !== location.pathname + location.search + location.hash) {
			history.replaceState(null, "", next);
		}
	});

	listen(window, "popstate", () => {
		const incoming = parse();

		Object.keys(raw(params)).forEach(key => {
			// Declared array keys always exist in `incoming` (as []), so only
			// undeclared keys that vanished from the URL are removed.
			if(!(key in incoming)) {
				delete params[key];
			}
		});

		Object.assign(params, incoming);
	});

	return params;
};

/**
 * location.hash as reactive state: { hash }. Two-way.
 */
export const hashState = () => {
	const store = state({ hash: location.hash.slice(1) });

	effect(() => {
		const next = "#" + store.hash;

		if(location.hash !== next && !(store.hash === "" && location.hash === "")) {
			location.hash = next;
		}
	});

	listen(window, "hashchange", () => {
		store.hash = location.hash.slice(1);
	});

	return store;
};

/**
 * matchMedia as reactive state: media("(prefers-color-scheme: dark)").matches
 * tracks and updates live. Dark mode, breakpoints, reduced motion, print —
 * all without a resize listener in sight.
 */
export const media = (mediaQuery) => {
	const list = window.matchMedia(mediaQuery);
	const store = state({ matches: list.matches });

	listen(list, "change", (event) => {
		store.matches = event.matches;
	});

	return store;
};

/** Reactive window size: { width, height }. */
export const viewport = () => {
	const store = state({ width: window.innerWidth, height: window.innerHeight });

	listen(window, "resize", () => {
		store.width = window.innerWidth;
		store.height = window.innerHeight;
	});

	return store;
};

/** Reactive connectivity: { online }. */
export const online = () => {
	const store = state({ online: navigator.onLine });

	listen(window, "online", () => store.online = true);
	listen(window, "offline", () => store.online = false);

	return store;
};

/** Reactive tab visibility: { visible }. Pause polling when hidden, etc. */
export const visible = () => {
	const store = state({ visible: document.visibilityState === "visible" });

	listen(document, "visibilitychange", () => {
		store.visible = document.visibilityState === "visible";
	});

	return store;
};

/**
 * Call `fn` every `ms`, scope-aware: the interval is cleared on the owner's
 * dispose (no leaked timer), and — unless `whenHidden` — it pauses while the tab
 * is hidden and resumes on return, so a background dashboard tab stops hammering
 * the network. `immediate` runs `fn` once up front.
 *
 * @param {Function} fn
 * @param {number} ms interval in milliseconds
 * @param {object} [options]
 * @param {boolean} [options.immediate] run fn() once immediately (default false)
 * @param {boolean} [options.whenHidden] keep polling while the tab is hidden
 * @returns {{ start: Function, stop: Function }}
 */
export const poll = (fn, ms, options = {}) => {
	const { immediate = false, whenHidden = false } = options;
	let timer = null;

	const start = () => { if(timer == null) { timer = setInterval(fn, ms); } };
	const stop = () => { if(timer != null) { clearInterval(timer); timer = null; } };

	if(immediate) { fn(); }

	start();

	if(!whenHidden) {
		listen(document, "visibilitychange", () => {
			if(document.visibilityState === "visible") { start(); } else { stop(); }
		});

		if(document.visibilityState !== "visible") { stop(); }
	}

	onDispose(stop);

	return { start, stop };
};

/**
 * Poll a getter and fire a callback when its (stringified) value changes.
 * The escape hatch for state the platform exposes with no event —
 * document.cookie being the classic one. Returns a stop() function.
 *
 *   watch(() => document.cookie, () => console.log("cookies changed"));
 */
export const watch = (getter, callback, interval = 250) => {
	let previous = getter();

	const timer = setInterval(() => {
		const next = getter();

		if(next !== previous) {
			previous = next;
			callback(next);
		}
	}, interval);

	const stop = () => clearInterval(timer);

	// Auto-stop on scope teardown (in addition to the returned stop()).
	onDispose(stop);

	return stop;
};

/**
 * document.cookie as reactive, parsed state. Cookies have no change event,
 * so this polls (via watch) and re-parses on change. Read cookies().foo in
 * an effect and it updates when that cookie does — even if a third-party
 * script set it.
 */
export const cookies = (interval = 250) => {
	const parse = () => Object.fromEntries(
		document.cookie
			.split(";")
			.map(pair => pair.trim())
			.filter(Boolean)
			.map(pair => {
				const eq = pair.indexOf("=");

				return [pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1))];
			})
	);

	const store = state(parse());

	watch(() => document.cookie, () => {
		const incoming = parse();

		Object.keys(raw(store)).forEach(key => {
			if(!(key in incoming)) {
				delete store[key];
			}
		});

		Object.assign(store, incoming);
	}, interval);

	return store;
};

/**
 * IntersectionObserver as reactive state: seen(element).matches flips when
 * the element enters/leaves the viewport. Lazy loading, infinite scroll,
 * scroll-linked UI — one observer, zero scroll listeners.
 */
export const seen = (element, options = {}) => {
	const store = state({ matches: false });

	const observer = new IntersectionObserver(entries => {
		entries.forEach(entry => {
			store.matches = entry.isIntersecting;
		});
	}, options);

	observer.observe(element);
	onDispose(() => observer.disconnect());

	return store;
};
