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

// Runaway-effect guard. An effect that (transitively) writes state it reads
// re-fires forever: the classic footgun is a loader called from an effect that
// sets state the same effect depends on — synchronously it recurses until the
// stack overflows; asynchronously (a fetch that resolves later) it spins an
// unbounded fetch loop that ends in net::ERR_INSUFFICIENT_RESOURCES and a tab
// crash. Neither is caught by the `runner === activeEffect` self-guard in
// trigger (async re-fires with activeEffect null; an A→B→A cascade never has A
// as activeEffect when it re-runs). We instead count each runner's executions
// in a sliding wall-clock window; past the ceiling the effect is a runaway, so
// we tear it DOWN (breaking the cycle so the page survives) and report it via
// onEffectError with phase "loop" — turning a tab crash into a catchable,
// named error. The default ceiling is far above any legitimate effect (even a
// per-frame animation binding is ~60/s); raise or disable it per effect with
// `effect(fn, { loopLimit })` (Infinity/0 = off).
const LOOP_WINDOW_MS = 1000;
const DEFAULT_LOOP_LIMIT = 1000;

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
	// Only objects/arrays can be proxied. Return primitives (and null) as-is so
	// callers like list() over primitive items don't hit "Cannot create proxy
	// with a non-object" — a primitive is immutable, so there's no reactivity
	// to lose anyway.
	if(!obj || typeof obj !== "object") {
		return obj;
	}

	// A frozen object can never change — return it as-is (matches the nested
	// skip in isReactable and the documented "freeze to opt out" escape hatch).
	// Proxying it would only add overhead and make writes throw a confusing
	// "trap returned falsish" instead of the plain read-only error.
	if(Object.isFrozen(obj)) {
		return obj;
	}

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
			const wasArray = Array.isArray(target);
			const oldLength = wasArray ? target.length : 0;
			const old = target[key];

			// Store raw objects, not proxies, to keep identity stable.
			const next = (value && typeof value === "object" && value[RAW]) ? value[RAW] : value;

			const result = Reflect.set(target, key, next, receiver);

			// Object.is so writing NaN over NaN does not spuriously re-trigger.
			if(!Object.is(old, next)) {
				trigger(target, key);
			}

			if(isNew) {
				// Iterating effects (Object.keys, spread, JSON.stringify)
				// need to see new keys.
				trigger(target, ITERATE);
			}

			// push()/index-assignment grows the array's length as a side effect;
			// the trap never sees an explicit length write with a changed value,
			// so length-only readers (items.length badges) would go stale. Fire
			// length explicitly when it actually changed.
			if(wasArray && key !== "length" && target.length !== oldLength) {
				trigger(target, "length");
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
	runner.disposers.forEach(fn => fn());
	runner.disposers.length = 0;
	runner.disposed = true;
};

/**
 * Register a cleanup to run when the current owner (effect or component scope)
 * is disposed. Used by primitives that create detached sub-scopes (when, list)
 * so those sub-scopes are torn down on unmount, not just on their own churn.
 */
export const onDispose = (fn) => {
	if(activeEffect) {
		activeEffect.disposers.push(fn);
	} else if(currentScope) {
		currentScope.disposers.push(fn);
	}
};

const errorHandlers = new Set();

/**
 * Register a handler called whenever an effect (a render binding, a derive, a
 * user effect) throws — before the error propagates. This is the central place
 * to wire crash reporting; without it a throwing binding is only observable at
 * the write site. Returns an unsubscribe function. The handler gets the error
 * and a context: `{ phase }` — "create" (first run), "update" (a reactive
 * re-run), or "loop" (the runaway guard tripped and the effect was stopped) —
 * plus `name` if the effect was created with `effect(fn, { name })`.
 *
 *   onEffectError((error, { phase, name }) => Sentry.captureException(error, { tags: { phase, name } }));
 */
export const onEffectError = (handler) => {
	errorHandlers.add(handler);

	return () => errorHandlers.delete(handler);
};

const reportEffectError = (error, context) => {
	errorHandlers.forEach(handler => {
		try {
			handler(error, context);
		} catch(handlerError) {
			// a reporter must never mask the original failure
			console.error("qrp: onEffectError handler threw", handlerError);
		}
	});
};

/**
 * Run fn immediately, tracking every state key it reads; re-run it whenever
 * one of those keys changes. Returns the runner, which has .dispose().
 *
 * Effects created inside a component (or inside another effect) are owned by
 * it and disposed with it — no manual unsubscribe bookkeeping.
 */
export const effect = (fn, options = {}) => {
	let ran = false;
	const loopLimit = options.loopLimit ?? DEFAULT_LOOP_LIMIT;

	const runner = () => {
		// Runaway guard: count executions in a sliding window; past the ceiling
		// this effect is looping (see LOOP_WINDOW_MS note). Tear it down BEFORE
		// running fn again — that both breaks the cycle (a disposed runner is
		// skipped by trigger, so no further re-fire) and stops it kicking off
		// another loader iteration — then report and throw.
		const now = Date.now();

		if(now - runner.windowStart > LOOP_WINDOW_MS) {
			runner.windowStart = now;
			runner.runs = 0;
		}

		runner.runs += 1;

		if(loopLimit && runner.runs > loopLimit) {
			disposeEffect(runner);

			const error = new Error(
				`qrp: effect${options.name ? ` "${options.name}"` : ""} re-ran ` +
				`over ${loopLimit} times within ${LOOP_WINDOW_MS}ms — likely an ` +
				"infinite loop (an effect writing state it transitively reads, e.g. " +
				"a loader that sets state the effect depends on). The effect has been " +
				"stopped. Name it with effect(fn, { name }) to identify it, or raise " +
				"the ceiling with effect(fn, { loopLimit }) if this is legitimate.",
			);

			reportEffectError(error, { phase: "loop", name: options.name });

			throw error;
		}

		cleanupEffect(runner);

		effectStack.push(runner);
		activeEffect = runner;

		try {
			fn();
			ran = true;
		} catch(error) {
			// Error boundary: an effect that throws is TORN DOWN — its (possibly
			// partial) subscriptions are removed so it can't re-run or re-throw
			// on a later write. The error still propagates to the caller (the
			// write site, or effect() itself on first run); the rest of the
			// reactive system is unaffected. No silent failures.
			disposeEffect(runner);

			// Central observability: report to any onEffectError handlers before
			// the error propagates. This is where you wire Sentry etc. — without
			// it a throwing render binding is only visible at the write site.
			// Context: phase (create = first run, update = a reactive re-run) and
			// the optional effect name, for crash-report attribution.
			reportEffectError(error, { phase: ran ? "update" : "create", name: options.name });

			throw error;
		} finally {
			effectStack.pop();
			activeEffect = effectStack[effectStack.length - 1] || null;
		}
	};

	runner.deps = [];
	runner.children = [];
	runner.disposers = [];
	runner.disposed = false;
	runner.windowStart = 0;
	runner.runs = 0;
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
		disposers: [],
		dispose: () => {
			self.effects.forEach(runner => disposeEffect(runner));
			self.effects.length = 0;
			self.disposers.forEach(fn => fn());
			self.disposers.length = 0;
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
 * Build something in a fresh ownership scope and get back both the result and a
 * dispose(). The fix for UI created OUTSIDE a render — e.g. a modal opened from
 * an onclick, where there is no current scope, so its reactive bindings would
 * otherwise be ownerless effects that outlive the DOM:
 *
 *   const { value: dialog, dispose } = scoped(() => buildReactiveDialog());
 *   const remove = portal(dialog);
 *   const close = () => { dispose(); remove(); };   // effects + DOM both gone
 */
export const scoped = (fn) => {
	let value;

	const self = scope(() => { value = fn(); });

	return { value, dispose: self.dispose };
};

/**
 * Mount a component into a parent element.
 * A component is just (parent) => { ...appendChild... }.
 * Returns { dispose } which tears down the component's effects and DOM.
 */
export const mount = (parent, component) => {
	const inner = scope(() => {
		const result = component(parent);

		// Support both styles: a component that appends to the `view` it's given,
		// AND one that RETURNS a renderable (`() => el(...)`). Append the return
		// unless it's already a child of parent (the append-to-view style returns
		// the node it just appended — don't double it). Done inside the scope so
		// any effects a returned marker creates are owned by this mount.
		if(result != null && !(result instanceof Node && result.parentNode === parent)) {
			appendChild(parent, result);
		}
	});

	return {
		dispose: () => {
			inner.dispose();
			clear(parent);
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

const TEXT_NODE = 3;

/**
 * The renderable protocol. Any object with a `[renderable](parent)` method
 * participates in child position exactly like `when`/`list` do — qrp's own
 * conditional/keyed-list primitives are just the first implementations, with no
 * privileged access. Userland can define peers (a switchOn, a virtualList, a
 * suspense-alike) at full parity.
 *
 * The method receives the parent (a real element or a fragment) and MUST: append
 * its content (typically an anchor comment + nodes), wire any reactivity, and
 * register `onDispose(() => …)` that removes its OWN nodes + anchor — so a
 * renderable nested in another marker cleans up its post-mount DOM on teardown
 * (see setupWhen/setupList for the reference implementation).
 *
 * Registered via Symbol.for so userland can implement it without importing:
 *   { [Symbol.for("qrp.renderable")]: (parent) => { …; return; } }
 */
export const renderable = Symbol.for("qrp.renderable");

const toNodes = (value) => {
	if(value == null || value === false) {
		return [];
	}

	if(Array.isArray(value)) {
		return value.flatMap(toNodes);
	}

	// A renderable RETURNED rather than passed straight as an el() child (nested
	// in a branch, a list render, a mount, a reactive hole). Materialize it into a
	// fragment — the anchor's parentNode re-resolves to the real parent once these
	// nodes are inserted, so later swaps still work.
	if(value && value[renderable]) {
		const frag = document.createDocumentFragment();

		appendChild(frag, value);

		return [...frag.childNodes];
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

/**
 * Empty a node — remove all its children. The high-level, reads-like-intent
 * alternative to `node.innerHTML = ""`, using the platform's replaceChildren().
 * (Dispose component scopes first if they own effects; this only touches DOM.)
 *
 * @param {Node} node
 */
export const clear = (node) => node.replaceChildren();

const appendChild = (parent, child) => {
	// A renderable — a when()/list() marker or any userland object implementing
	// the protocol. No brand special-casing: the normalizer treats first-party
	// and userland renderables identically (they insert + own their nodes).
	if(child && child[renderable]) {
		child[renderable](parent);

		return;
	}

	if(typeof child === "function") {
		// Reactive region: re-render just this slice when its state changes.
		const anchor = document.createComment("qrp");
		parent.appendChild(anchor);

		let nodes = [];

		effect(() => {
			const value = child();

			// Fast path — the common case for a reactive text hole. The effect
			// closure already HOLDS the text node (no lookup, no query), so when
			// the value is a primitive and we're already a single text node, we
			// just write its data in place: no allocation, no remove/insert, one
			// characterData mutation. This is the O(1) "update the one node and
			// nothing else" the whole design is arguing for.
			if(nodes.length === 1 && nodes[0].nodeType === TEXT_NODE
				&& (typeof value === "string" || typeof value === "number")) {
				const next = String(value);

				if(nodes[0].data !== next) {
					nodes[0].data = next;
				}

				return;
			}

			// General path: value is a node/array/empty, or the shape changed.
			const fresh = toNodes(value);

			if(!anchor.parentNode) {
				nodes = fresh;

				return;
			}

			nodes.forEach(node => node.remove());
			fresh.forEach(node => anchor.parentNode.insertBefore(node, anchor));

			nodes = fresh;
		});

		return;
	}

	toNodes(child).forEach(node => parent.appendChild(node));
};

// Wire a when() marker into `parent`: render one of two branches based on a
// reactive condition, disposing the previous branch's scope (and DOM) whenever
// the condition flips. This is the conditional-subtree primitive — edit vs.
// display, loading vs. loaded, permission-gated panels — without hand-rolled
// DOM surgery or leaked effects.
const setupWhen = (parent, marker) => {
	const anchor = document.createComment("qrp-when");
	parent.appendChild(anchor);

	let branchScope = null;
	let nodes = [];
	let lastKey;
	let first = true;

	// Dispose the live branch when the enclosing owner tears down — AND remove
	// this marker's own current DOM (nodes + anchor). A parent only tracks the
	// nodes present when it mounted its branch; a nested marker that re-rendered
	// since then has inserted nodes the parent doesn't know about, so the child
	// must remove them itself on disposal or they strand (nested-when leak).
	onDispose(() => {
		if(branchScope) {
			branchScope.dispose();
		}

		nodes.forEach((node) => node.remove());
		anchor.remove();
	});

	effect(() => {
		const value = marker.cond();
		const truthy = !!value;

		// Value-keyed: rebuild when the branch's KEY changes. When truthy the key
		// IS the value (so `when(() => state.tab, tab => TABS[tab]())` re-renders
		// on every tab), when falsy all falsy values collapse to one key (so the
		// else-branch doesn't churn on false↔0↔""). A branch's own reactive
		// updates still happen in place — only a key change rebuilds.
		const key = truthy ? value : false;

		if(!first && Object.is(key, lastKey)) {
			return;
		}

		first = false;
		lastKey = key;

		if(branchScope) {
			branchScope.dispose();
			branchScope = null;
		}

		nodes.forEach((node) => node.remove());
		nodes = [];

		const render = truthy ? marker.thenFn : marker.elseFn;

		if(!render) {
			return;
		}

		// Build the branch in its own ownership scope, untracked so the outer
		// effect only depends on cond() — not on whatever the branch reads.
		let built;

		untracked(() => {
			branchScope = scope(() => {
				built = toNodes(render(value));
			});
		});

		built.forEach((node) => anchor.parentNode.insertBefore(node, anchor));
		nodes = built;
	});
};

/**
 * Conditionally render one of two subtrees, swapping on a reactive condition
 * and disposing the old branch (effects + DOM) when it flips. Use as an el()
 * child:
 *
 *   el("div", {}, when(
 *     () => editing.on,
 *     () => el("input", { bind: [state, "name"] }),   // then
 *     () => el("span", {}, () => state.name)          // else (optional)
 *   ));
 *
 * The condition's truthy value is passed to the branch, so `when(() => user,
 * u => ...)` works as a presence guard. It is **value-keyed**: the branch
 * re-renders when the value changes, so a value-switch works directly —
 * `when(() => state.tab, tab => TABS[tab]())` re-renders on every tab. Falsy
 * values collapse to a single else-branch. A branch's own reactive updates
 * still happen in place; only a value (key) change rebuilds. If the value is an
 * object whose identity changes each read, that's a rebuild each time — key on
 * a primitive (`() => user?.id`) or mutate the object in place.
 *
 * @param {Function} cond () => any (reactive)
 * @param {Function} thenFn (value) => renderable, shown when cond is truthy
 * @param {Function} [elseFn] (value) => renderable, shown when falsy
 * @returns {object} when marker (pass as an el child)
 */
// A marker only stringifies if it was passed to a BARE DOM append
// (`parent.append(marker)`) — qrp's own paths route it via the renderable
// symbol before any String coercion. So a toString() here can't fire in normal
// use; when it does, it means the one unsupported position. Warn loudly and
// return a breadcrumb instead of a silent "[object Object]" — the whole bug
// class self-diagnoses at the call site.
const markerHint = (kind) => function() {
	console.warn(`qrp: a ${kind}() marker was coerced to a string — you passed it to a bare DOM append(). Render it via el()/html/mount() (or a reactive child), not parent.append().`);

	return `[qrp ${kind}() — render via el()/mount(), not a bare DOM append]`;
};

export const when = (cond, thenFn, elseFn) => {
	const marker = { cond, thenFn, elseFn, toString: markerHint("when") };

	// when is just an implementation of the renderable protocol — no privileged
	// access to the normalizer; a userland switchOn is its exact peer.
	marker[renderable] = (parent) => setupWhen(parent, marker);

	return marker;
};

// Indices of a longest strictly-increasing subsequence of `arr`, as a Set.
// Entries with value < 0 (new nodes) are ignored. Used to find the "stable
// backbone" of reused rows that need not move during reconciliation.
const lisIndices = (arr) => {
	const predecessor = new Array(arr.length).fill(-1);
	const tails = []; // tails[k] = index of the smallest tail of an LIS of length k+1

	for(let i = 0; i < arr.length; i++) {
		if(arr[i] < 0) {
			continue;
		}

		let lo = 0;
		let hi = tails.length;

		while(lo < hi) {
			const mid = (lo + hi) >> 1;

			if(arr[tails[mid]] < arr[i]) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}

		if(lo > 0) {
			predecessor[i] = tails[lo - 1];
		}

		tails[lo] = i;
	}

	const result = new Set();
	let k = tails.length ? tails[tails.length - 1] : -1;

	while(k !== -1) {
		result.add(k);
		k = predecessor[k];
	}

	return result;
};

// Max depth reconcileItem recurses into nested plain objects before falling back
// to reference assignment. Bounds cost and prevents runaway recursion on deep or
// cyclic data — deeper subtrees are still updated, just replaced wholesale.
const REBIND_DEPTH = 8;

const isPlainObject = (value) => {
	if(!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const proto = Object.getPrototypeOf(value);

	return proto === Object.prototype || proto === null;
};

// Merge `source` (a fresh raw item) INTO the row's reactive proxy, in place:
// recurse into nested plain objects (so their proxy identity is preserved and
// only changed leaf keys trigger), assign changed leaves, and delete keys the
// fresh object dropped. Depth-limited; must run inside untracked().
const reconcileItem = (targetProxy, source, depth) => {
	const targetRaw = raw(targetProxy);

	Object.keys(source).forEach((key) => {
		const sv = source[key];
		const tv = targetRaw[key];

		if(depth > 0 && isPlainObject(sv) && isPlainObject(tv)) {
			reconcileItem(targetProxy[key], sv, depth - 1);
		} else if(!Object.is(tv, sv)) {
			targetProxy[key] = sv;
		}
	});

	Object.keys(targetRaw).forEach((key) => {
		if(!(key in source)) {
			delete targetProxy[key];
		}
	});
};

const setupList = (parent, marker) => {
	const anchor = document.createComment("qrp-list");
	parent.appendChild(anchor);

	// key -> { element, scope }; scope owns the row's effects for disposal.
	let cache = new Map();

	// Dispose every row scope when the enclosing owner tears down — AND remove
	// this list's own rows + anchor, so a list nested in a parent marker doesn't
	// strand rows the parent never tracked (same fix as setupWhen).
	onDispose(() => {
		cache.forEach((entry) => {
			entry.scope.dispose();
			entry.element.remove();
		});

		anchor.remove();
	});

	effect(() => {
		// Track that the array changed (identity/length), then iterate the RAW
		// array — keying/diffing must not re-read every element through the
		// reactive proxy on each change (that made an N-item swap pay an
		// O(rows) proxy tax). Rows are wrapped reactively only when built.
		const items = raw(marker.source() || []);

		const next = new Map();
		const desired = [];
		const keys = [];

		items.forEach((item, index) => {
			const key = marker.keyFn(item, index);

			// A DOM node lives in one place, so two items with the same key
			// would collapse to one row and silently drop data. Warn loudly —
			// this is almost always a bad keyFn or duplicate IDs in a refetch.
			if(next.has(key)) {
				console.warn(`qrp list(): duplicate key ${JSON.stringify(key)} — row dropped. Keys must be unique.`);

				return;
			}

			let entry = cache.get(key) || next.get(key);

			if(!entry) {
				// New row: build DETACHED (its effects belong to the row's own
				// scope so they survive reconciles). Wrap the item reactively
				// here, once — so cell bindings track it, without the reconcile
				// loop touching every item's proxy.
				let element;
				let rowScope;
				const reactiveItem = state(item);

				untracked(() => {
					rowScope = scope(() => {
						element = toNodes(marker.render(reactiveItem, index))[0];
					});
				});

				entry = { element, scope: rowScope, item: reactiveItem, rawItem: item };
			} else if(entry.rawItem !== item) {
				// Surviving key, but a FRESH object (e.g. a refetch): rebind the
				// row's reactive item so its cells show the new data instead of
				// the object captured when the row was built. A bounded recursive
				// merge preserves nested proxy identity and only triggers changed
				// leaves; dropped keys are removed. Same-identity (mutated-in-place)
				// rows already updated through their own bindings.
				untracked(() => reconcileItem(entry.item, item, REBIND_DEPTH));
				entry.rawItem = item;
			}

			next.set(key, entry);
			marker._elemToItem.set(entry.element, item);
			desired.push(entry.element);
			keys.push(key);
		});

		// Remove rows whose keys are gone; dispose their effects.
		cache.forEach((entry, key) => {
			if(!next.has(key)) {
				entry.scope.dispose();
				entry.element.remove();
			}
		});

		// Minimal-move reorder. Map each new position to the row's OLD position
		// (cache is still the previous order here); the longest increasing run
		// of old positions is the stable backbone that need not move. Only new
		// rows and out-of-order rows are inserted — so a 2-row swap does 1 move,
		// not O(n) (the cascading nextSibling approach moved ~every node).
		const previousIndex = new Map();
		let position = 0;

		cache.forEach((_entry, key) => {
			previousIndex.set(key, position);
			position += 1;
		});

		const sources = keys.map((key) => (previousIndex.has(key) ? previousIndex.get(key) : -1));
		const stable = lisIndices(sources);

		let ref = anchor;

		for(let i = desired.length - 1; i >= 0; i--) {
			const node = desired[i];

			if(sources[i] === -1 || !stable.has(i)) {
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

	const marker = {
		source,
		keyFn,
		render,
		_elemToItem: elemToItem,
		toString: markerHint("list"),

		itemFor: (target) => {
			let node = target && target.nodeType ? target : (target && target.target);

			while(node && !elemToItem.has(node)) {
				node = node.parentElement;
			}

			return node ? elemToItem.get(node) : undefined;
		}
	};

	// list is a renderable like when — a peer of any userland virtualList.
	marker[renderable] = (parent) => setupList(parent, marker);

	return marker;
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

	// Children FIRST: a <select bind> needs its <option>s present before the
	// binding applies the initial value, otherwise value has nothing to match.
	children.forEach(child => appendChild(node, child));

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

			clear(this);
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

	let wildcardIndex = 0;

	// Single pass over :param, :param*, and bare * so emitted capture groups
	// (which contain a literal *) are never re-scanned. Each construct is a
	// capture group, so each pushes exactly one key — keeping groups and keys
	// aligned (a bare * pushes a positional numeric key, path-to-regexp style).
	const source = pattern
		.replace(/\/+$/, "")               // no trailing slash
		.replace(/[.\\+^${}()|[\]]/g, "\\$&") // escape regex metachars (not / : * ?)
		.replace(/:(\w+)(\*)?|\*/g, (match, name, star) => {
			if(name === undefined) {
				keys.push(wildcardIndex++);

				return "(.*)";
			}

			keys.push(name);

			return star ? "(.*)" : "([^/]+)";
		});

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
		const raw = match[index + 1] ?? "";

		// Malformed percent-encoding (e.g. /user/%zz) makes decodeURIComponent
		// throw a URIError; fall back to the raw segment instead of breaking
		// navigation.
		try {
			params[key] = decodeURIComponent(raw);
		} catch {
			params[key] = raw;
		}
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
 * Update the URL's query string without changing the path — for persisting table
 * filters/sort/page to the URL. Rides the router's same-pattern keep-alive, so
 * there's no remount and `currentRoute.query` updates reactively. A nullish/""
 * value removes a key; an array repeats it. Defaults to `replace` so tweaking a
 * filter doesn't spam history, and to `merge` so you patch one key at a time.
 *
 *   setQuery({ status: "active", page: null });   // set status, clear page
 */
export const setQuery = (params, { replace = true, merge = true } = {}) => {
	patchHistory();

	const url = new URL(location.href);
	const search = merge ? url.searchParams : new URLSearchParams();

	Object.entries(params).forEach(([key, value]) => {
		if(value === null || value === undefined || value === "") {
			search.delete(key);
		} else if(Array.isArray(value)) {
			search.delete(key);
			value.forEach(item => search.append(key, item));
		} else {
			search.set(key, value);
		}
	});

	const query = search.toString();

	navigate(url.pathname + (query ? "?" + query : "") + url.hash, { replace });
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
/**
 * Reactive current route — { path, params, query } — updated by router() before
 * each mount. Read it anywhere (a navbar's active links, tenant-prefixed hrefs)
 * without threading ctx through every handler.
 */
export const currentRoute = state({ path: "", params: {}, query: {} });

export const router = (routes, outlet, options = {}) => {
	patchHistory();

	const compiled = Object.entries(routes).map(([pattern, component]) => {
		return { pattern, component, ...compilePath(pattern) };
	});

	const notFound = options.notFound || ((view) => {
		view.appendChild(el("p", {}, "Not found"));
	});

	let current = null;
	let currentRouteObj = null;

	const resolve = () => {
		const path = location.pathname;
		const query = Object.fromEntries(new URLSearchParams(location.search));

		for(const route of compiled) {
			const params = matchPath(route, path);

			if(params) {
				return { route, component: route.component, ctx: { params, query, path } };
			}
		}

		return { route: null, component: notFound, ctx: { params: {}, query, path } };
	};

	const updateLinks = (path) => {
		outlet.ownerDocument.querySelectorAll("a[href]").forEach(link => {
			link.classList.toggle("active", link.getAttribute("href") === path);
		});
	};

	const render = () => {
		const { route, component, ctx } = resolve();

		// publish the active route as reactive state before mounting, so a navbar
		// (or anything outside the handler) reacts to navigation.
		currentRoute.path = ctx.path;
		currentRoute.params = ctx.params;
		currentRoute.query = ctx.query;

		// Same route pattern (a param/query change within the same page, e.g. a
		// tab switch): DON'T tear the page down and remount — just refresh links
		// and let the handler react through currentRoute. Keeps in-pane state and
		// avoids refetch churn. Set options.remount to force a full remount.
		if(current && route && route === currentRouteObj && !options.remount) {
			updateLinks(ctx.path);

			return;
		}

		const swap = () => {
			if(current) {
				current.dispose();
			}

			updateLinks(ctx.path);

			clear(outlet);
			currentRouteObj = route;
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

		// Let the browser handle: framed links, downloads, and rel=external.
		if(!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) {
			return;
		}

		if((link.getAttribute("rel") || "").split(/\s+/).includes("external")) {
			return;
		}

		const url = new URL(link.href, location.href);

		if(url.origin !== location.origin) {
			return;
		}

		// Same-page hash link (same path, only a #fragment): let the browser
		// do native scroll-to-anchor instead of remounting the whole route.
		if(url.pathname === location.pathname && url.search === location.search && url.hash) {
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
