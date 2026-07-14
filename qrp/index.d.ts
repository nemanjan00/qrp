/**
 * @module qrp
 * Core: reactivity (`state`/`effect`/`derive`), DOM (`el`/`reactive`/`bind`),
 * keyed lists (`list`), conditionals (`when`), components (`mount`/`scope`),
 * custom elements (`define`), and HTML5 routing. `import … from "@nemanjan00/qrp"`.
 */

// --- shared types ----------------------------------------------------------

/** Anything qrp can render as an el()/html child. Functions are reactive;
 *  list()/when() markers are valid children too. */
export type Renderable =
	| string
	| number
	| boolean
	| null
	| undefined
	| Node
	| ListMarker<any>
	| WhenMarker
	| Renderable[]
	| (() => Renderable);

/** A two-way binding tuple passed as the `bind` prop: [state, key]. */
export type Bind = [Record<string, any>, string];

/** Props accepted by el(): attributes/properties, `on*` handlers, `bind`,
 *  and function values (reactive). Kept permissive by design. */
export interface Props {
	/** Two-way bind a form control to a state key: `bind: [settings, "name"]`. */
	bind?: Bind;
	[key: string]: any;
}

/** The handle returned by effect() — dispose to stop it re-running. */
export interface EffectHandle {
	(): void;
	dispose(): void;
	disposed: boolean;
}

/** An ownership scope (from scope()/mount()); dispose tears down its effects. */
export interface Scope {
	dispose(): void;
}

/** A mounted component; dispose tears down its effects AND clears the DOM. */
export interface Mounted {
	dispose(): void;
}

/** A reactive computed value produced by derive(). */
export interface Derived<T> {
	readonly value: T;
}

// --- reactivity ------------------------------------------------------------

/**
 * Wrap a plain object/array in a reactive Proxy. Reads inside an effect track
 * per key; writes re-run only the effects that read that key. Primitives,
 * frozen objects, DOM nodes, Map/Set and class instances are returned as-is —
 * so it's safe to stash a node or a `Map` in state, and `Object.freeze(data)`
 * opts a value out of reactivity.
 * @example
 * const s = state({ first: "Ada", last: "Lovelace" });
 * effect(() => console.log(s.first));   // logs now, and whenever `first` changes
 * s.last = "Byron";                     // does NOT re-run the effect above
 */
export function state<T>(obj: T): T;

/** Unwrap a reactive proxy back to its raw object (or return as-is). */
export function raw<T>(obj: T): T;

/**
 * Run fn now and re-run it whenever any state key it read changes. Effects
 * created inside a component/scope are owned by it and disposed with it.
 *
 * Edge cases: writing `NaN` over `NaN` does not re-trigger (uses `Object.is`).
 * An effect that reads and writes the *same* key runs once and settles (the
 * trigger skips the currently-running effect) — it does not self-loop. An
 * effect that **throws** is torn down (unsubscribed) and the error propagates
 * to the caller (the write site, or `effect()` on first run); the rest of the
 * system is unaffected. Two effects that write *each other's* keys will recurse
 * synchronously with no depth guard — don't do that.
 * @example
 * const runner = effect(() => render(state.value));
 * runner.dispose();   // stop it
 */
export function effect(fn: () => void): EffectHandle;

/**
 * Register a handler called when any effect (a render binding, a derive, a user
 * effect) throws — before the error propagates. The central place to wire crash
 * reporting; without it a throwing binding is only observable at the write site.
 * Returns an unsubscribe function.
 * @example
 * onEffectError((error) => Sentry.captureException(error));
 */
export function onEffectError(handler: (error: unknown, effect?: unknown) => void): () => void;

/** Read state inside fn WITHOUT tracking it as a dependency. */
export function untracked<T>(fn: () => T): T;

/**
 * A read-only reactive value derived from other state.
 * @example
 * const full = derive(() => `${s.first} ${s.last}`);
 * el("span", {}, () => full.value);
 */
export function derive<T>(fn: () => T): Derived<T>;

/** Register a cleanup to run when the current effect/scope disposes. */
export function onDispose(fn: () => void): void;

/**
 * Run fn inside a fresh ownership scope; `dispose()` kills every effect created
 * during it. `mount()` wraps this and also clears the DOM — reach for `scope()`
 * directly only when you're managing effects **without** a DOM subtree to clear
 * (e.g. a bundle of subscriptions you want to tear down together).
 */
export function scope(fn: () => void): Scope;

/**
 * Build a value in a fresh ownership scope; returns `{ value, dispose }`. Use for
 * UI created outside a render (a modal opened from an onclick) so its reactive
 * bindings are owned and torn down with `dispose()` instead of leaking.
 * @example
 * const { value: dialog, dispose } = scoped(() => buildReactiveDialog());
 * const remove = portal(dialog);
 * const close = () => { dispose(); remove(); };
 */
export function scoped<T>(fn: () => T): { value: T; dispose: () => void };

// --- DOM -------------------------------------------------------------------

/**
 * Create a real DOM element — the most-used function in the framework. Every
 * prop is one of five kinds, and children follow their own rule:
 *
 * - **Static value** → set once (a property if it exists on the node, else an
 *   attribute): `el("input", { type: "text", id: "name" })`.
 * - **Function value** → a reactive binding, re-applied when its state changes:
 *   `el("div", { class: () => active.on ? "on" : "" })`.
 * - **`on*: fn`** → an event listener (`addEventListener`):
 *   `el("button", { onclick: (e) => count.n++ })`.
 * - **`bind: [state, key]`** → two-way binding for a form control (with
 *   number/checkbox coercion): `el("input", { bind: [settings, "name"] })`.
 * - **`class` / `style`** → `class` takes a string or function; `style` takes a
 *   string or an object (`{ color: "red" }`), each static or reactive.
 * - Properties like **`value` / `checked`** are set as node *properties* (not
 *   attributes), so `checked: () => todo.done` works as expected.
 *
 * Children are `Renderable`: strings/numbers (text), Nodes, arrays, reactive
 * functions (`() => …`), and `list()`/`when()` markers.
 * @example
 * el("button", { class: () => on.value ? "on" : "", onclick: () => on.value = !on.value },
 *   () => `toggled ${on.value}`);
 */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props?: Props,
	...children: Renderable[]
): HTMLElementTagNameMap[K];
export function el(tag: string, props?: Props, ...children: Renderable[]): HTMLElement;

/** Empty a node (remove all children) via replaceChildren(). */
export function clear(node: Node): void;

/**
 * Wrap a DOM node in a Proxy so assigning a function to a property becomes a
 * reactive binding (`node.textContent = () => state.x`). qrp unwraps it to the
 * raw node on insert.
 */
export function reactive<T extends Node>(node: T): T;

/** Two-way binding between a form control and a state key. */
export function bind(node: Node, state: Record<string, any>, key: string): Node;

// --- keyed lists -----------------------------------------------------------

/** A keyed list() marker — pass as an el() child. */
export interface ListMarker<T> {
	readonly __qrpList: true;
	/** Map an element (or an event) back to the item that produced it. */
	itemFor(target: Element | Event | EventTarget | null): T | undefined;
}

/**
 * A keyed list with element reuse: one element per item identity, reused and
 * reordered on change (never rebuilt). Pass as an el() child.
 *
 * `source` is a **thunk that returns the current array** — read reactive state
 * inside it so the list re-runs when the data changes. For a plain reactive
 * array that's `() => store.rows`; when the data comes from a `collection`,
 * `items()` is a method, so it's `() => view.items()`. Both are the same
 * contract (a function returning an array); `collection.items` just happens to
 * be callable rather than a property.
 *
 * `keyFn` must return a **unique** key per item. Duplicate keys are dropped with
 * a `console.warn` (two items can't share one element). If `render` throws, the
 * error propagates out of the reconcile (like any effect that throws).
 * @example
 * el("tbody", {}, list(
 *   () => store.rows,          // thunk → current array
 *   (row) => row.id,           // stable, unique key
 *   (row) => el("tr", {}, () => row.name)   // built once per key; self-updates
 * ));
 */
export function list<T>(
	source: () => readonly T[],
	keyFn: (item: T, index: number) => unknown,
	render: (item: T, index: number) => Renderable
): ListMarker<T>;

// --- conditionals ----------------------------------------------------------

/** A when() marker — pass as an el() child. */
export interface WhenMarker {
	readonly __qrpWhen: true;
}

/**
 * Conditionally render one of two subtrees, disposing the old branch (effects +
 * DOM) when it changes.
 *
 * **Value-keyed:** the branch re-renders whenever the condition's value changes
 * (by `Object.is`), so a value-switch works directly — this DOES switch tabs:
 *
 *   when(() => state.tab, (tab) => TABS[tab]())
 *
 * Falsy values collapse to a single else-branch. A branch's own reactive updates
 * still happen in place; only a value change rebuilds. If the value is an object
 * whose identity changes each read, that rebuilds every time — key on a primitive
 * (`() => user?.id`) or mutate the object in place.
 *
 * A `WhenMarker` is only valid as an `el()`/`html` child; to nest one inside
 * another branch, wrap it: `() => el("div", {}, when(...))`.
 */
export function when<T>(
	cond: () => T,
	thenFn: (value: NonNullable<T>) => Renderable,
	elseFn?: (value: T) => Renderable
): WhenMarker;

// --- components / mount ----------------------------------------------------

/** A component is a function that populates a parent element. */
export type Component<C = unknown> = (parent: HTMLElement, ctx: C) => void;

/** Mount a component into a parent; returns a disposable. */
export function mount(parent: HTMLElement, component: (parent: HTMLElement) => void): Mounted;

// --- custom elements -------------------------------------------------------

export interface DefineOptions {
	/** Attribute names to observe and expose as reactive `attrs` state. */
	attrs?: string[];
}

/**
 * Register a Custom Element built with objects and __proto__ (no class).
 * `setup(host, attrs)` builds its content; observed attrs arrive as reactive
 * state. Effects created in setup are scoped to the element.
 */
export function define(
	name: string,
	setup: (host: HTMLElement & { attrs: Record<string, string | null> }, attrs: Record<string, string | null>) => void,
	options?: DefineOptions
): CustomElementConstructor;

// --- routing ---------------------------------------------------------------

export interface CompiledPath {
	keys: (string | number)[];
	regexp: RegExp;
}

/** Compile an Express-style path pattern (`/user/:id`, `/files/:path*`, `*`). */
export function compilePath(pattern: string): CompiledPath;

/** Match a compiled path against a pathname; returns params or null. */
export function matchPath(compiled: CompiledPath, path: string): Record<string, string> | null;

export interface NavigateOptions {
	/** replaceState instead of pushState. */
	replace?: boolean;
}

/** Programmatic navigation (pushes/replaces the URL; the router reacts). */
export function navigate(url: string, options?: NavigateOptions): void;

/** Context passed to a matched route component. */
export interface RouteContext {
	params: Record<string, string>;
	query: Record<string, string>;
	path: string;
}

/**
 * Reactive current route, updated by router() before each mount. Read it from
 * anywhere (a navbar's active links, tenant-prefixed hrefs) without threading
 * ctx through every handler.
 * @example
 * el("a", { class: () => currentRoute.path === "/users" ? "active" : "" }, "Users");
 */
export const currentRoute: { path: string; params: Record<string, string>; query: Record<string, string> };

export interface RouterOptions {
	notFound?: (outlet: HTMLElement, ctx: RouteContext) => void;
	/** Set false to disable View Transitions. */
	transitions?: boolean;
	/** Where link clicks are captured (default document). */
	linksRoot?: Element | Document;
	/**
	 * Force a full teardown + remount on EVERY navigation. By default the router
	 * keeps the mounted page when the matched route PATTERN is unchanged (a
	 * param/query change like a tab switch) — in-pane state survives and the
	 * handler reacts through `currentRoute`. Set true for the old always-remount.
	 */
	remount?: boolean;
}

export interface RouterHandle {
	navigate: typeof navigate;
	render(): void;
	dispose(): void;
}

/** HTML5 History router: path patterns → components. */
export function router(
	routes: Record<string, (outlet: HTMLElement, ctx: RouteContext) => void>,
	outlet: HTMLElement,
	options?: RouterOptions
): RouterHandle;
