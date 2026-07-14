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
 * All listeners are registered through effects/scopes where possible; the
 * window-level ones are one-per-call, so create these once per component.
 */

import { state, effect, raw } from "../qrp/index.js";

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

	window.addEventListener("storage", (event) => {
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
 */
export const query = () => {
	const parse = () => Object.fromEntries(new URLSearchParams(location.search));

	const params = state(parse());

	effect(() => {
		const search = new URLSearchParams();

		Object.entries(params).forEach(([key, value]) => {
			if(value != null && value !== "") {
				search.set(key, value);
			}
		});

		const suffix = search.toString();
		const next = location.pathname + (suffix ? "?" + suffix : "") + location.hash;

		if(next !== location.pathname + location.search + location.hash) {
			history.replaceState(null, "", next);
		}
	});

	window.addEventListener("popstate", () => {
		const incoming = parse();

		Object.keys(raw(params)).forEach(key => {
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

	window.addEventListener("hashchange", () => {
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

	list.addEventListener("change", (event) => {
		store.matches = event.matches;
	});

	return store;
};

/** Reactive window size: { width, height }. */
export const viewport = () => {
	const store = state({ width: window.innerWidth, height: window.innerHeight });

	window.addEventListener("resize", () => {
		store.width = window.innerWidth;
		store.height = window.innerHeight;
	});

	return store;
};

/** Reactive connectivity: { online }. */
export const online = () => {
	const store = state({ online: navigator.onLine });

	window.addEventListener("online", () => store.online = true);
	window.addEventListener("offline", () => store.online = false);

	return store;
};

/** Reactive tab visibility: { visible }. Pause polling when hidden, etc. */
export const visible = () => {
	const store = state({ visible: document.visibilityState === "visible" });

	document.addEventListener("visibilitychange", () => {
		store.visible = document.visibilityState === "visible";
	});

	return store;
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

	return () => clearInterval(timer);
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

	return store;
};
