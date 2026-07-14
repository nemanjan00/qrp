/**
 * qrp/index.js — a low-power frontend framework.
 *
 * Zero dependencies, zero build step. Load with <script type="module">.
 *
 * Core ideas:
 *  - state(obj)  → Proxy-wrapped reactive state. Reads inside an effect are
 *                  tracked per-key; writes re-run only the effects that read
 *                  that key. State is per-component by construction: call
 *                  state() inside your component function and it lives in
 *                  that closure.
 *  - effect(fn)  → runs fn now and re-runs it when any state it read changes.
 *  - el(...)     → plain-DOM element helper. Function-valued attributes and
 *                  children are reactive; bind: [state, "key"] is two-way.
 *  - mount/router → components are functions receiving a parent element.
 *                  Every effect created while a component renders belongs to
 *                  it and is disposed when the component unmounts.
 */

// ---------------------------------------------------------------------------
// Reactivity
// ---------------------------------------------------------------------------

let activeEffect = null;
const effectStack = [];

// target -> Map(key -> Set(effect runners))
const targetMap = new WeakMap();

const track = (target, key) => {
	if(!activeEffect) {
		return;
	}

	let depsMap = targetMap.get(target);

	if(!depsMap) {
		depsMap = new Map();
		targetMap.set(target, depsMap);
	}

	let dep = depsMap.get(key);

	if(!dep) {
		dep = new Set();
		depsMap.set(key, dep);
	}

	dep.add(activeEffect);
	activeEffect.deps.push(dep);
};

const trigger = (target, key) => {
	const depsMap = targetMap.get(target);

	if(!depsMap) {
		return;
	}

	const dep = depsMap.get(key);

	if(!dep) {
		return;
	}

	// Copy: runners re-track themselves during run, mutating the set.
	[...dep].forEach(runner => {
		if(runner === activeEffect || runner.disposed) {
			return;
		}

		runner();
	});
};

const RAW = Symbol("qrp.raw");
const proxyCache = new WeakMap();

/**
 * Only plain objects and arrays are made reactive. DOM nodes, Map, Set, Date,
 * and class instances are left ALONE — wrapping them in a Proxy detaches their
 * branded internal slots, so their methods throw "called on incompatible
 * receiver" (and the DOM rejects proxied nodes outright). This lets you safely
 * stash a DOM node or a Map inside reactive state.
 */
const isReactable = (value) => {
	if(!value || typeof value !== "object") {
		return false;
	}

	// A frozen object can never change — proxying it would only add tracking
	// overhead and memory for nothing. Freeze big static/reference data stashed
	// in state and reads cost zero. (Opt out of reactivity by freezing.)
	if(Object.isFrozen(value)) {
		return false;
	}

	if(Array.isArray(value)) {
		return true;
	}

	const proto = Object.getPrototypeOf(value);

	return proto === Object.prototype || proto === null;
};

/**
 * Wrap a plain object (or array) in a reactive Proxy.
 * Nested plain objects/arrays are wrapped lazily on read; exotic objects (DOM
 * nodes, Map/Set, class instances) are stored and returned as-is. Wrapping the
 * same object twice returns the same proxy.
 */
export const state = (obj) => {
	if(obj[RAW]) {
		return obj; // already a proxy
	}

	const cached = proxyCache.get(obj);

	if(cached) {
		return cached;
	}

	const proxy = new Proxy(obj, {
		get(target, key, receiver) {
			if(key === RAW) {
				return target;
			}

			track(target, key);

			const value = Reflect.get(target, key, receiver);

			if(isReactable(value)) {
				return state(value);
			}

			return value;
		},

		set(target, key, value, receiver) {
			const isNew = !Object.prototype.hasOwnProperty.call(target, key);
			const old = target[key];

			// Store raw objects, not proxies, to keep identity stable.
			const next = (value && typeof value === "object" && value[RAW]) ? value[RAW] : value;

			const result = Reflect.set(target, key, next, receiver);

			if(old !== next) {
				trigger(target, key);
			}

			if(isNew) {
				// Iterating effects (Object.keys, spread, JSON.stringify)
				// need to see new keys.
				trigger(target, ITERATE);
			}

			return result;
		},

		deleteProperty(target, key) {
			const had = Object.prototype.hasOwnProperty.call(target, key);
			const result = Reflect.deleteProperty(target, key);

			if(had) {
				trigger(target, key);
				trigger(target, ITERATE);
			}

			return result;
		},

		has(target, key) {
			track(target, key);

			return Reflect.has(target, key);
		},

		ownKeys(target) {
			// Iteration (Object.keys, for..in, spread) depends on the key set.
			track(target, ITERATE);

			return Reflect.ownKeys(target);
		}
	});

	proxyCache.set(obj, proxy);

	return proxy;
};

const ITERATE = Symbol("qrp.iterate");

/** Unwrap a reactive proxy back to its raw object (or return as-is). */
export const raw = (obj) => {
	return (obj && obj[RAW]) || obj;
};

const cleanupEffect = (runner) => {
	runner.deps.forEach(dep => dep.delete(runner));
	runner.deps.length = 0;

	// Effects created during this runner's last run die with it.
	runner.children.forEach(child => disposeEffect(child));
	runner.children.length = 0;
};

const disposeEffect = (runner) => {
	cleanupEffect(runner);
	runner.disposed = true;
};

/**
 * Run fn immediately, tracking every state key it reads; re-run it whenever
 * one of those keys changes. Returns the runner, which has .dispose().
 *
 * Effects created inside a component (or inside another effect) are owned by
 * it and disposed with it — no manual unsubscribe bookkeeping.
 */
export const effect = (fn) => {
	const runner = () => {
		cleanupEffect(runner);

		effectStack.push(runner);
		activeEffect = runner;

		try {
			fn();
		} finally {
			effectStack.pop();
			activeEffect = effectStack[effectStack.length - 1] || null;
		}
	};

	runner.deps = [];
	runner.children = [];
	runner.disposed = false;
	runner.dispose = () => disposeEffect(runner);

	if(activeEffect) {
		activeEffect.children.push(runner);
	} else if(currentScope) {
		currentScope.effects.push(runner);
	}

	runner();

	return runner;
};

/**
 * Run fn WITHOUT tracking any reads, and without the current effect adopting
 * any effects created inside it. Used when building detached, independently
 * owned sub-trees (e.g. keyed list rows) from within a running effect — the
 * rows must survive the outer effect re-running, so they must not become its
 * children. Restores the effect stack afterward.
 */
export const untracked = (fn) => {
	const prevActive = activeEffect;
	const hidden = effectStack.splice(0, effectStack.length);

	activeEffect = null;

	try {
		return fn();
	} finally {
		effectStack.push(...hidden);
		activeEffect = prevActive;
	}
};

/**
 * A read-only reactive value derived from other state:
 *   const full = derive(() => `${user.first} ${user.last}`);
 *   ... full.value
 */
export const derive = (fn) => {
	const result = state({ value: undefined });

	effect(() => {
		result.value = fn();
	});

	return result;
};

// ---------------------------------------------------------------------------
// Component scopes
// ---------------------------------------------------------------------------

let currentScope = null;

/**
 * Run fn inside a fresh ownership scope. Every top-level effect created
 * during the run is collected; dispose() kills them all. mount() and the
 * router use this — you rarely call it directly.
 */
export const scope = (fn) => {
	const previous = currentScope;

	const self = {
		effects: [],
		dispose: () => {
			self.effects.forEach(runner => disposeEffect(runner));
			self.effects.length = 0;
		}
	};

	currentScope = self;

	try {
		fn();
	} finally {
		currentScope = previous;
	}

	return self;
};

/**
 * Mount a component into a parent element.
 * A component is just (parent) => { ...appendChild... }.
 * Returns { dispose } which tears down the component's effects and DOM.
 */
export const mount = (parent, component) => {
	const inner = scope(() => component(parent));

	return {
		dispose: () => {
			inner.dispose();
			parent.innerHTML = "";
		}
	};
};

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const setAttr = (node, key, value) => {
	if(key === "class") {
		node.className = value == null ? "" : value;
		return;
	}

	if(key === "style" && typeof value === "object") {
		Object.assign(node.style, value);
		return;
	}

	if(key in node) {
		node[key] = value;
		return;
	}

	if(value == null || value === false) {
		node.removeAttribute(key);
	} else {
		node.setAttribute(key, value === true ? "" : value);
	}
};

const toNodes = (value) => {
	if(value == null || value === false) {
		return [];
	}

	if(Array.isArray(value)) {
		return value.flatMap(toNodes);
	}

	// A reactive() proxy: unwrap to the real node the DOM will accept.
	if(value && value[NODE_RAW]) {
		return [value[NODE_RAW]];
	}

	if(value instanceof Node) {
		return [value];
	}

	return [document.createTextNode(String(value))];
};

const appendChild = (parent, child) => {
	// A keyed list() marker: reconcile with element reuse (see setupList).
	if(child && child.__qrpList) {
		setupList(parent, child);

		return;
	}

	if(typeof child === "function") {
		// Reactive region: re-render just this slice when its state changes.
		const anchor = document.createComment("qrp");
		parent.appendChild(anchor);

		let nodes = [];

		effect(() => {
			const fresh = toNodes(child());

			nodes.forEach(node => node.remove());
			fresh.forEach(node => anchor.parentNode.insertBefore(node, anchor));

			nodes = fresh;
		});

		return;
	}

	toNodes(child).forEach(node => parent.appendChild(node));
};

// Wire a keyed list() marker into `parent`: one element per item identity,
// cached and REUSED across changes. A filter/sort/paginate only reorders the
// cached elements (minimal DOM moves); each row updates itself through its own
// reactive bindings, so surviving rows are never rebuilt.
const setupList = (parent, marker) => {
	const anchor = document.createComment("qrp-list");
	parent.appendChild(anchor);

	// key -> { element, scope }; scope owns the row's effects for disposal.
	let cache = new Map();

	effect(() => {
		const items = marker.source() || [];

		const next = new Map();
		const desired = [];

		items.forEach((item, index) => {
			const key = marker.keyFn(item, index);

			let entry = cache.get(key) || next.get(key);

			if(!entry) {
				// Build the row DETACHED: its effects must be owned by the row's
				// own scope (so they survive this effect re-running) and must
				// not track anything here (so item edits don't re-run the list).
				let element;
				let rowScope;

				untracked(() => {
					rowScope = scope(() => {
						element = toNodes(marker.render(item, index))[0];
					});
				});

				entry = { element, scope: rowScope };
			}

			next.set(key, entry);
			marker._elemToItem.set(entry.element, item);
			desired.push(entry.element);
		});

		// Remove rows whose keys are gone; dispose their effects.
		cache.forEach((entry, key) => {
			if(!next.has(key)) {
				entry.scope.dispose();
				entry.element.remove();
			}
		});

		// Reorder to match `desired`, moving only elements that are out of
		// place (each node's nextSibling should be the following desired node).
		let ref = anchor;

		for(let i = desired.length - 1; i >= 0; i--) {
			const node = desired[i];

			if(node.nextSibling !== ref) {
				anchor.parentNode.insertBefore(node, ref);
			}

			ref = node;
		}

		cache = next;
	});
};

/**
 * A keyed list for efficient data rendering. Unlike a plain reactive region
 * (which rebuilds on every change), this caches one element per item identity
 * and reuses/reorders them — the right tool under a filtered/sorted/paginated
 * table or feed. Use it as an el() child:
 *
 *   el("tbody", {}, list(
 *     () => view.items,                    // reactive, ordered source
 *     item => item.id,                      // stable key
 *     item => el("tr", {}, () => item.name) // built once per key; self-updates
 *   ));
 *
 * `render(item, index)` must return a single element. The returned marker also
 * exposes itemFor(elementOrEvent) → the item that produced that element, for
 * one-listener event delegation over large lists (via a WeakMap, leak-free).
 *
 * @param {Function} source () => Array (reactive)
 * @param {Function} keyFn item => stable unique key
 * @param {Function} render (item, index) => Element
 * @returns {object} list marker (pass as an el child)
 */
export const list = (source, keyFn, render) => {
	const elemToItem = new WeakMap();

	return {
		__qrpList: true,
		source,
		keyFn,
		render,
		_elemToItem: elemToItem,

		itemFor: (target) => {
			let node = target && target.nodeType ? target : (target && target.target);

			while(node && !elemToItem.has(node)) {
				node = node.parentElement;
			}

			return node ? elemToItem.get(node) : undefined;
		}
	};
};

/**
 * Element helper:
 *   el("input", { class: "big", bind: [settings, "NICK"] })
 *   el("span", {}, () => `count: ${counter.value}`)   // reactive text
 *   el("ul", {}, () => items.map(i => el("li", {}, i.name)))  // reactive list
 *   el("button", { onclick: () => counter.value++ }, "+1")
 *
 * Attribute rules:
 *   - onfoo: fn        → addEventListener("foo", fn)
 *   - bind: [state, k] → two-way binding (see bind())
 *   - fn value         → reactive attribute, re-set when its state changes
 *   - anything else    → set once (property if it exists, else attribute)
 */
export const el = (tag, props = {}, ...children) => {
	const node = document.createElement(tag);

	Object.entries(props).forEach(([key, value]) => {
		if(key === "bind") {
			bind(node, value[0], value[1]);
			return;
		}

		if(key.startsWith("on") && typeof value === "function") {
			node.addEventListener(key.slice(2).toLowerCase(), value);
			return;
		}

		if(typeof value === "function") {
			effect(() => setAttr(node, key, value()));
			return;
		}

		setAttr(node, key, value);
	});

	children.forEach(child => appendChild(node, child));

	return node;
};

const NODE_RAW = Symbol("qrp.node");

/**
 * Wrap a real DOM node in a Proxy that reflects changes reactively.
 *
 * The novel bit: you ASSIGN to the node's own properties, and function-valued
 * assignments become live bindings. It reads like imperative DOM code but is
 * fully reactive:
 *
 *   const span = reactive(document.createElement("span"));
 *   span.textContent = () => `count: ${counter.n}`;  // fn → reactive effect
 *   span.className   = "big";                          // value → set once
 *   span.onclick     = () => counter.n++;              // on* fn → listener
 *   parent.appendChild(span);   // qrp unwraps the proxy to the real node
 *
 * Appending it via qrp's el()/appendChild()/mount() auto-unwraps to the raw
 * node (the DOM rejects proxies directly). Reach the raw node yourself with
 * raw(span) if you must hand it to a non-qrp API.
 *
 * Reading a property returns the live value (methods stay bound to the node),
 * so this is a two-way-friendly, imperative-feeling reactive handle.
 */
export const reactive = (node) => {
	return new Proxy(node, {
		get(target, key) {
			if(key === NODE_RAW || key === RAW) {
				return target;
			}

			const value = target[key];

			// Bind methods so `proxy.append(...)`, `proxy.remove()` work.
			return typeof value === "function" ? value.bind(target) : value;
		},

		set(target, key, value) {
			// on* handlers: a function is an event listener, not a binding.
			if(typeof key === "string" && key.startsWith("on") && typeof value === "function") {
				target.addEventListener(key.slice(2).toLowerCase(), value);

				return true;
			}

			// Any other function value becomes a reactive binding.
			if(typeof value === "function") {
				effect(() => setAttr(target, key, value()));

				return true;
			}

			setAttr(target, key, value);

			return true;
		}
	});
};

/**
 * Two-way binding between a form control and a state key.
 * state → DOM via an effect; DOM → state via input/change events.
 * Works for input (incl. checkbox/number), textarea and select.
 */
export const bind = (node, stateObj, key) => {
	const isCheckbox = node.type === "checkbox";
	const isNumber = node.type === "number" || node.type === "range";
	const eventName = (node.tagName === "SELECT" || isCheckbox) ? "change" : "input";

	effect(() => {
		const value = stateObj[key];

		if(isCheckbox) {
			node.checked = !!value;
		} else {
			const next = value == null ? "" : String(value);

			// Don't clobber the caret while the user is typing the same value.
			if(node.value !== next) {
				node.value = next;
			}
		}
	});

	node.addEventListener(eventName, () => {
		if(isCheckbox) {
			stateObj[key] = node.checked;
		} else if(isNumber) {
			stateObj[key] = node.value === "" ? "" : Number(node.value);
		} else {
			stateObj[key] = node.value;
		}
	});

	return node;
};

// ---------------------------------------------------------------------------
// Custom elements
// ---------------------------------------------------------------------------

/**
 * Register a qrp component as a real Custom Element — the browser's own
 * component model. The prototype is a genuine HTMLElement, lifecycle is
 * handled by the platform, and observed attributes arrive as reactive state:
 *
 *   define("qrp-greeting", (host, attrs) => {
 *     host.appendChild(el("p", {}, () => `Hello, ${attrs.name || "world"}`));
 *   }, { attrs: ["name"] });
 *
 *   <qrp-greeting name="Nemanja"></qrp-greeting>
 *
 * Changing the attribute in devtools (or from code) re-renders reactively.
 * Effects created in setup are scoped to the element and disposed when it
 * leaves the document.
 *
 * @param {string} name custom element tag name (must contain a hyphen)
 * @param {function} setup (host, attrs) => void — builds the element's content
 * @param {object} [options]
 * @param {string[]} [options.attrs] attribute names to observe as reactive state
 * @returns {function} the element constructor
 */
export const define = (name, setup, options = {}) => {
	const observed = options.attrs || [];

	// No `class`, no `extends`. Build the constructor as a plain function and
	// wire the prototype chain onto HTMLElement.prototype by hand — the
	// browser only requires that `new Ctor()` yield an HTMLElement, which
	// Reflect.construct gives us. This is inheritance via __proto__, not the
	// class keyword.
	const Ctor = function() {
		const self = Reflect.construct(HTMLElement, [], Ctor);

		self.attrs = state(Object.fromEntries(
			observed.map(attr => [attr, self.getAttribute(attr)])
		));

		return self;
	};

	Ctor.observedAttributes = observed;

	// Prototype object literal, chained to HTMLElement.prototype.
	Ctor.prototype = Object.assign(Object.create(HTMLElement.prototype), {
		constructor: Ctor,

		connectedCallback() {
			this._qrpScope = scope(() => setup(this, this.attrs));
		},

		disconnectedCallback() {
			// Fire before teardown so setup() code can release non-effect
			// resources (timers, sockets) it opened.
			this.dispatchEvent(new CustomEvent("qrp:disconnect"));

			if(this._qrpScope) {
				this._qrpScope.dispose();
				this._qrpScope = null;
			}

			this.innerHTML = "";
		},

		attributeChangedCallback(attr, _old, value) {
			this.attrs[attr] = value;
		}
	});

	customElements.define(name, Ctor);

	return Ctor;
};

// ---------------------------------------------------------------------------
// HTML5 History routing
// ---------------------------------------------------------------------------

/**
 * Compile an Express/path-to-regexp-style pattern to { regexp, keys }.
 * Supports "/user/:id", "/files/:path*", and literal segments — the same
 * :param convention as the server route manager, so front and back can share
 * route strings verbatim.
 */
export const compilePath = (pattern) => {
	const keys = [];

	const source = pattern
		.replace(/\/+$/, "")               // no trailing slash
		.replace(/[.\\+^${}()|[\]]/g, "\\$&") // escape regex metachars (not / : * ?)
		.replace(/:(\w+)(\*)?/g, (_, name, star) => {
			keys.push(name);

			return star ? "(.*)" : "([^/]+)";
		})
		.replace(/\*/g, "(.*)");

	return {
		keys,
		regexp: new RegExp("^" + (source || "/") + "/?$")
	};
};

/** Match a compiled route against a path; returns params object or null. */
export const matchPath = (compiled, path) => {
	const match = compiled.regexp.exec(path);

	if(!match) {
		return null;
	}

	const params = {};

	compiled.keys.forEach((key, index) => {
		params[key] = decodeURIComponent(match[index + 1] ?? "");
	});

	return params;
};

// Wrap history.pushState/replaceState once so navigations from ANYWHERE —
// even third-party code — emit an event. (Same trick as the tracker syncer:
// monkeypatch pushState, then react to it.) Browsers give us popstate for
// back/forward but nothing for push, so we synthesize "qrp:navigate".
let historyPatched = false;

const patchHistory = () => {
	if(historyPatched) {
		return;
	}

	historyPatched = true;

	["pushState", "replaceState"].forEach(method => {
		const original = history[method];

		history[method] = function(...args) {
			const result = original.apply(this, args);

			window.dispatchEvent(new CustomEvent("qrp:navigate"));

			return result;
		};
	});
};

/**
 * Programmatic navigation: pushes a new URL and lets the router react.
 * Use this instead of touching history directly.
 */
export const navigate = (url, { replace = false } = {}) => {
	patchHistory();

	history[replace ? "replaceState" : "pushState"](null, "", url);
};

/**
 * HTML5 History router. Routes are path patterns → components:
 *
 *   const app = router({
 *     "/": home,
 *     "/settings/:section": settingsPage,
 *     "/files/:path*": fileBrowser
 *   }, document.getElementById("view"));
 *
 * The matched component is called as component(outlet, { params, query, path }).
 * Any <a href="..."> with a same-origin, non-modified click is intercepted and
 * routed without a page load. Back/forward and any pushState (yours or a
 * library's) re-render. The previous component's scope is disposed on each
 * navigation, so effects never leak.
 *
 * @param {object} routes map of path pattern → component (outlet, ctx) => void
 * @param {Element} outlet element the matched component renders into
 * @param {object} [options]
 * @param {function} [options.notFound] component for unmatched paths
 * @param {boolean} [options.transitions] set false to disable View Transitions
 * @param {Element|Document} [options.linksRoot] where link clicks are captured
 * @returns {object} { navigate, render, dispose }
 */
export const router = (routes, outlet, options = {}) => {
	patchHistory();

	const compiled = Object.entries(routes).map(([pattern, component]) => {
		return { pattern, component, ...compilePath(pattern) };
	});

	const notFound = options.notFound || ((view) => {
		view.appendChild(el("p", {}, "Not found"));
	});

	let current = null;

	const resolve = () => {
		const path = location.pathname;
		const query = Object.fromEntries(new URLSearchParams(location.search));

		for(const route of compiled) {
			const params = matchPath(route, path);

			if(params) {
				return { component: route.component, ctx: { params, query, path } };
			}
		}

		return { component: notFound, ctx: { params: {}, query, path } };
	};

	const render = () => {
		const { component, ctx } = resolve();

		const swap = () => {
			if(current) {
				current.dispose();
			}

			// Reflect active state on any [href] link that matches the path.
			outlet.ownerDocument.querySelectorAll("a[href]").forEach(link => {
				const href = link.getAttribute("href");

				link.classList.toggle("active", href === ctx.path);
			});

			outlet.innerHTML = "";
			current = mount(outlet, (view) => component(view, ctx));
		};

		if(document.startViewTransition && options.transitions !== false) {
			document.startViewTransition(swap);
		} else {
			swap();
		}
	};

	// Intercept in-app link clicks: same-origin, plain left-click only.
	const onClick = (event) => {
		if(event.defaultPrevented || event.button !== 0) {
			return;
		}

		if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}

		const link = event.target.closest && event.target.closest("a[href]");

		if(!link || link.target === "_blank" || link.hasAttribute("download")) {
			return;
		}

		const url = new URL(link.href, location.href);

		if(url.origin !== location.origin) {
			return;
		}

		event.preventDefault();
		navigate(url.pathname + url.search + url.hash);
	};

	(options.linksRoot || document).addEventListener("click", onClick);
	window.addEventListener("popstate", render);
	window.addEventListener("qrp:navigate", render);

	render();

	return {
		navigate,
		render,
		dispose: () => {
			(options.linksRoot || document).removeEventListener("click", onClick);
			window.removeEventListener("popstate", render);
			window.removeEventListener("qrp:navigate", render);

			if(current) {
				current.dispose();
			}
		}
	};
};
