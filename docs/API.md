# qrp — API reference

> **Generated from the TypeScript declarations (`*.d.ts`) — do not edit by hand.**
> Run `npm run docs` to regenerate. The `.d.ts` are the single source of API
> truth (rich types, verified by `npm run typecheck` against a usage suite),
> and `api.html` renders this file live.

Every module is an independent ESM file — import only what you use. Types ship
next to each module, so editors resolve them with no build step.

> **⚠️ Read [`SHARP-EDGES.md`](./SHARP-EDGES.md) before implementing anything.**
> qrp uses the platform directly, so a handful of behaviors follow from how the
> DOM and `Proxy` actually work (thunk-vs-value, `list()` keys, the runaway
> guard, …). None are bugs; all bite exactly once. Five minutes there saves an
> afternoon of "why doesn't this update / where did my rows go".

- [qrp — core](#qrp-core)
- [html — HTML templates](#html-html-templates)
- [forms](#forms)
- [collection](#collection)
- [table](#table)
- [datagrid](#datagrid)
- [http](#http)
- [socket](#socket)
- [store](#store)
- [host](#host)
- [resource](#resource)
- [format](#format)
- [export](#export)
- [spark](#spark)
- [scale](#scale)
- [timeseries](#timeseries)
- [events](#events)
- [toasts](#toasts)
- [browser](#browser)
- [context](#context)
- [behaviors](#behaviors)
- [utils](#utils)
- [proto](#proto)

---

## qrp — core

```js
import { … } from "@nemanjan00/qrp"
```

Core: reactivity (`state`/`effect`/`derive`/`onChange`), DOM (`el`/`reactive`/`bind`),
keyed lists (`list`), conditionals (`when`), components (`mount`/`scope`),
and HTML5 routing. `import … from "@nemanjan00/qrp"`.

### `renderable`

```ts
renderable: unique symbol
```

The renderable protocol symbol (registered via `Symbol.for("qrp.renderable")`).
An object implementing `[renderable](parent)` participates in child position
exactly like `when`/`list` — which are themselves just implementations, with
no privileged access. Build userland peers (switchOn, virtualList, …) at parity.

### `state`

```ts
state<T>(obj: T): T
```

Wrap a plain object/array in a reactive Proxy. Reads inside an effect track
per key; writes re-run only the effects that read that key. Primitives,
frozen objects, DOM nodes, Map/Set and class instances are returned as-is —
so it's safe to stash a node or a `Map` in state, and `Object.freeze(data)`
opts a value out of reactivity.

```js
const s = state({ first: "Ada", last: "Lovelace" });
effect(() => console.log(s.first));   // logs now, and whenever `first` changes
s.last = "Byron";                     // does NOT re-run the effect above
```

### `raw`

```ts
raw<T>(obj: T): T
```

Unwrap a reactive proxy back to its raw object (or return as-is).

### `effect`

```ts
effect(fn: () => void, options?: { name?: string; loopLimit?: number }): EffectHandle
```

Run fn now and re-run it whenever any state key it read changes. Effects
created inside a component/scope are owned by it and disposed with it.

Tracking is **transitive**: an effect depends on every key read while it runs,
including reads inside functions it calls. `effect(() => { theme.revision;
render(); })` also subscribes to whatever `render()` reads — so unrelated data
changes re-run (and rebuild) the effect. Wrap the call in {@link untracked} to
declare the dependencies yourself: `effect(() => { theme.revision;
untracked(render); })`.

Edge cases: writing `NaN` over `NaN` does not re-trigger (uses `Object.is`).
An effect that reads and writes the *same* key runs once and settles (the
trigger skips the currently-running effect) — it does not self-loop. An
effect that **throws** is torn down (unsubscribed) and the error propagates
to the caller (the write site, or `effect()` on first run); the rest of the
system is unaffected. An effect that synchronously (transitively) writes state
it reads — two effects writing *each other's* keys, or a body that sets a key
it reads — re-enters itself forever; a runaway guard catches this by tracking
re-entrancy depth: past `loopLimit` levels deep the effect is torn down and
reported via {@link onEffectError} with `phase: "loop"` (default ceiling 1000;
`loopLimit: Infinity` disables). Depth — not a rate — is the test, so a
legitimately hot effect updated thousands of times in a tick (it runs
sequentially, depth 1) never trips.

```js
const runner = effect(() => render(state.value));
runner.dispose();   // stop it
```

### `onEffectError`

```ts
onEffectError(handler: (error: unknown, context: EffectErrorContext) => void): () => void
```

Register a handler called when any effect (a render binding, a derive, a user
effect) throws — before the error propagates. The central place to wire crash
reporting. With no handler registered, qrp `console.error`s the failure by
default (so a mount-time throw is never a silent blank page); registering any
handler takes over and silences that default. Returns an unsubscribe function.

```js
onEffectError((error, { phase, name }) => Sentry.captureException(error, { tags: { phase, name } }));
```

### `untracked`

```ts
untracked<T>(fn: () => T): T
```

Read state inside fn WITHOUT tracking it as a dependency. Because tracking is
transitive, this is how you call a function that reads unrelated state from
inside an effect without subscribing to it.

```js
effect(() => {
	theme.revision;         // the ONE dependency this effect wants
	untracked(render);      // render() reads chart data — don't subscribe to it
});
```

### `batch`

```ts
batch<T>(fn: () => T): T
```

Apply several writes as one update. Writes inside fn take effect immediately
(reads inside fn see them), but the effects they trigger are held back and run
ONCE each after fn returns, against the final state. Without it every write
re-runs its effects on the spot, so an effect reading two keys can briefly see
the new value of one next to the old value of the other. Nestable (only the
outermost batch flushes); returns fn's result. If a flushed effect throws, the
remaining effects still run and the first error is rethrown.

```js
const apply = (next) => batch(() => {
	store.overall = next.overall;
	store.latencyBounds = next.latencyBounds;   // a chart reading both runs once, consistent
});
```

### `derive`

```ts
derive<T>(fn: () => T): Derived<T>
```

A read-only reactive value derived from other state.

```js
const full = derive(() => `${s.first} ${s.last}`);
el("span", {}, () => full.value);
```

### `onChange`

```ts
onChange<T>(source: () => T, callback: (next: T, previous: T | undefined) => void, options?: { immediate?: boolean; equals?: (a: T, b: T) => boolean; name?: string }): EffectHandle
```

Run a side effect when a reactive value changes. Only `source()` is tracked;
`callback(next, previous)` runs untracked, so what it reads never subscribes.
Not called for the initial value unless `immediate`. Compare with `equals`
(default `Object.is`) — return a primitive key from `source` for compound values.

```js
onChange(() => pane.config.device, (device) => reload(device));
```

### `onDispose`

```ts
onDispose(fn: () => void): void
```

Register a cleanup to run when the current effect/scope disposes. This is
qrp's "on unmount" — there is no `ondisconnect` prop. A component that owns
a listener, observer, timer, animation loop or camera stream registers its
teardown here, and it runs when the owning `when()` branch switches, its
`list()` row is removed, or the `mount()`/`scoped()` handle is disposed:

  const Clock = () => {
    const now = state({ t: Date.now() });
    const id = setInterval(() => { now.t = Date.now(); }, 1000);
    const onKey = (e) => { if(e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    onDispose(() => {
      clearInterval(id);
      window.removeEventListener("keydown", onKey);
    });
    return el("time", {}, () => new Date(now.t).toLocaleTimeString());
  };

  el("div", {}, when(() => ui.showClock, Clock));   // hiding it clears both

Cleanup follows **ownership, not the DOM**: removing a node yourself
(`node.remove()`, moving it with `append`) runs nothing. For a subtree you
insert and remove by hand, build it inside `scoped()` and call its
`dispose()` when you take it out. Called outside any effect or scope (at
module top level), the cleanup is never run.

### `scope`

```ts
scope(fn: () => void): Scope
```

Run fn inside a fresh ownership scope; `dispose()` kills every effect created
during it. `mount()` wraps this and also clears the DOM — reach for `scope()`
directly only when you're managing effects **without** a DOM subtree to clear
(e.g. a bundle of subscriptions you want to tear down together).
Called inside a running effect, the scope still owns what its fn creates, and
the effect owns the scope — it's disposed when that effect re-runs or is
disposed. (Reads in fn are still tracked by the effect; wrap the call in
`untracked()` if they shouldn't be.)

### `scoped`

```ts
scoped<T>(fn: () => T): { value: T; dispose: () => void }
```

Build a value in a fresh ownership scope; returns `{ value, dispose }`. Use for
UI created outside a render (a modal opened from an onclick) so its reactive
bindings are owned and torn down with `dispose()` instead of leaking.

```js
const { value: dialog, dispose } = scoped(() => buildReactiveDialog());
const remove = portal(dialog);
const close = () => { dispose(); remove(); };
```

### `el`

```ts
el<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Renderable[]): HTMLElementTagNameMap[K]
el(tag: string, props?: Props, ...children: Renderable[]): HTMLElement
```

Create a real DOM element — the most-used function in the framework. Every
prop is one of five kinds, and children follow their own rule:

- **Static value** → set once (a property if it exists on the node, else an
  attribute): `el("input", { type: "text", id: "name" })`.
- **Function value** → a reactive binding, re-applied when its state changes:
  `el("div", { class: () => active.on ? "on" : "" })`.
- **`on*: fn`** → an event listener (`addEventListener`):
  `el("button", { onclick: (e) => count.n++ })`.
- **`bind: [state, key]`** → two-way binding for a form control (with
  number/checkbox coercion; applied after the other props, so `type` is set
  first): `el("input", { bind: [settings, "name"] })`.
- **`class` / `style`** → `class` takes a string or function; `style` takes a
  string or an object (`{ color: "red", "--w": "10px" }` — custom properties
  go through `setProperty`), each static or reactive.
- Properties like **`value` / `checked`** are set as node *properties* (not
  attributes), so `checked: () => todo.done` works as expected. A prop whose
  value is `false`, `null` or `undefined` **removes** the attribute (so
  `disabled: () => x` toggles it, `class: () => on && "active"` drops the
  class), and `true` sets it empty. `value: null` empties an input.
- **SVG is namespace-aware**: `el("svg", …)`, `el("path", …)`, etc. are created
  in the SVG namespace and their attributes (`d`, `viewBox`, `fill`, `class`)
  go through `setAttribute`. (`a`/`title`/`script`/`style` stay HTML — build an
  SVG one with the `html\`\`` module if you need it.)

Children are `Renderable`: strings/numbers (text), Nodes, arrays, reactive
functions (`() => …`), and `list()`/`when()` markers.

```js
el("button", { class: () => on.value ? "on" : "", onclick: () => on.value = !on.value },
  () => `toggled ${on.value}`);
```

### `clear`

```ts
clear(node: Node): void
```

Empty a node (remove all children) via replaceChildren().

### `reactive`

```ts
reactive<T extends Node>(node: T): T
```

Wrap a DOM node in a Proxy so assigning a function to a property becomes a
reactive binding (`node.textContent = () => state.x`). qrp unwraps it to the
raw node on insert.

### `bind`

```ts
bind(node: Node, state: Record<string, any>, key: string): Node
```

Two-way binding between a form control and a state key.

### `list`

```ts
list<T>(source: () => readonly T[], keyFn: (item: T, index: number) => unknown, render: (item: T, index: number) => Renderable, options?: ListOptions): ListMarker<T>
```

A keyed list with element reuse: one element per item identity, reused and
reordered on change (never rebuilt). Pass as an el() child.

`source` is a **thunk that returns the current array** — read reactive state
inside it so the list re-runs when the data changes. For a plain reactive
array that's `() => store.rows`; when the data comes from a `collection`,
`items()` is a method, so it's `() => view.items()`. Both are the same
contract (a function returning an array); `collection.items` just happens to
be callable rather than a property. Both **replacing** the array
(`store.rows = next`) and **mutating it in place** (`push`/`pop`/`shift`/
`unshift`/`splice`/`sort`/`reverse`/`fill`/`copyWithin`, or `rows[i] = item`)
re-run the list — once per call, against the final array.

`list()` is the reactive-array primitive: a spread of `.map()`
(`el("ul", {}, ...store.rows.map(Row))`) renders **once** — the spread happens
before `el()` is called, so there is no function for qrp to re-run.

`render` ideally returns one element per row (the fast path). It may also
return several nodes, an array, or a `when()`/renderable — that row's nodes
(including whatever a nested `when()` swaps in later) move and are removed as
a group, and `itemFor()` still resolves them.

`keyFn` must return a **unique** key per item. Duplicate keys drop the row (two
items can't share one element) and `console.error` by default — tune with
`options.onDuplicateKey`. If `render` throws, the error propagates out of the
reconcile (like any effect that throws).

**Replacement items under a surviving key** (a refetch, or a `derive()` that
rebuilds the array wholesale) are handled: a normal row is *rebound* in place —
its bindings update, the element is reused — and a row whose item couldn't be
made reactive (frozen — the opt-out idiom — a primitive, or an exotic instance)
is *rebuilt* with fresh bindings instead. Bind cells to the item the render
callback receives; it stays live across rebuilds of the source array.

```js
el("tbody", {}, list(
  () => store.rows,          // thunk → current array
  (row) => row.id,           // stable, unique key
  (row) => el("tr", {}, () => row.name)   // built once per key; self-updates
));
```

### `when`

```ts
when<T>(cond: () => T, thenFn: (value: NonNullable<T>) => Renderable, elseFn?: (value: T) => Renderable): WhenMarker
```

Conditionally render one of two subtrees, disposing the old branch (effects +
DOM) when it changes.

**Value-keyed:** the branch re-renders whenever the condition's value changes
(by `Object.is`), so a value-switch works directly — this DOES switch tabs:

  when(() => state.tab, (tab) => TABS[tab]())

Falsy values collapse to a single else-branch. A branch's own reactive updates
still happen in place; only a value change rebuilds. If the value is an object
whose identity changes each read, that rebuilds every time — key on a primitive
(`() => user?.id`) or mutate the object in place.

A `WhenMarker` renders anywhere a Renderable is accepted — as an `el()`/`html`
child, returned bare from another branch, a `list()` render, or a component
(no wrapper element needed).

### `mount`

```ts
mount(parent: HTMLElement, component: (parent: HTMLElement) => unknown): Mounted
```

Mount a component into a parent; returns a disposable that tears down its
effects and clears the parent. The component may either append to the `parent`
it's given, or RETURN a renderable (`() => el(...)`) — both work.

### `compilePath`

```ts
compilePath(pattern: string): CompiledPath
```

Compile an Express-style path pattern (`/user/:id`, `/files/:path*`, `*`).

### `matchPath`

```ts
matchPath(compiled: CompiledPath, path: string): Record<string, string> | null
```

Match a compiled path against a pathname; returns params or null.

### `navigate`

```ts
navigate(url: string, options?: NavigateOptions): void
```

Programmatic navigation (pushes/replaces the URL; the router reacts).

### `setQuery`

```ts
setQuery(params: Record<string, string | string[] | null | undefined>, options?: { replace?: boolean; merge?: boolean }): void
```

Update the URL query string without changing the path (persist filters/sort to
the URL). Rides the router's same-pattern keep-alive — no remount,
`currentRoute.query` updates reactively. Nullish/"" removes a key; array
repeats it. Defaults: `replace: true`, `merge: true`.

### `currentRoute`

```ts
currentRoute: { path: string; params: Record<string, string>; query: Record<string, string> }
```

Reactive current route, updated by router() before each mount. Read it from
anywhere (a navbar's active links, tenant-prefixed hrefs) without threading
ctx through every handler.

```js
el("a", { class: () => currentRoute.path === "/users" ? "active" : "" }, "Users");
```

### `router`

```ts
router(routes: Record<string, (outlet: HTMLElement, ctx: RouteContext) => void>, outlet: HTMLElement, options?: RouterOptions): RouterHandle
```

HTML5 History router: path patterns → components.

#### Supporting types

```ts
interface QrpRenderable {
	[renderable]: (parent: HTMLElement | DocumentFragment) => void;
}
```

An object that renders itself in child position (the protocol `when`/`list`
 implement). The method appends its nodes and registers cleanup via onDispose.

```ts
type Renderable =
	| string
	| number
	| boolean
	| null
	| undefined
	| Node
	| QrpRenderable
	| Renderable[]
	| (() => Renderable);
```

Anything qrp can render as an el()/html child. Functions are reactive;
 list()/when() markers — and any object implementing the renderable protocol
 — are valid children too.

```ts
type Bind = [Record<string, any>, string];
```

A two-way binding tuple passed as the `bind` prop: [state, key].

```ts
interface Props {
	/** Two-way bind a form control to a state key: `bind: [settings, "name"]`. */
	bind?: Bind;
	[key: string]: any;
}
```

Props accepted by el(): attributes/properties, `on*` handlers, `bind`,
 and function values (reactive). Kept permissive by design.

```ts
interface EffectHandle {
	(): void;
	dispose(): void;
	disposed: boolean;
}
```

The handle returned by effect() — dispose to stop it re-running.

```ts
interface Scope {
	dispose(): void;
}
```

An ownership scope (from scope()/mount()); dispose tears down its effects.

```ts
interface Mounted {
	dispose(): void;
}
```

A mounted component; dispose tears down its effects AND clears the DOM.

```ts
interface Derived<T> {
	readonly value: T;
}
```

A reactive computed value produced by derive().

```ts
interface EffectErrorContext {
	/**
	 * "create" = the effect's first run; "update" = a reactive re-run;
	 * "loop" = the runaway guard tripped (see `loopLimit`) and the effect was
	 * stopped.
	 */
	phase: "create" | "update" | "loop";
	/** The name from `effect(fn, { name })`, if any. */
	name?: string;
}
```

Context passed to an onEffectError handler.

```ts
interface ListMarker<T> extends QrpRenderable {
	/** Map an element (or an event) back to the item that produced it. */
	itemFor(target: Element | Event | EventTarget | null): T | undefined;
}
```

A keyed list() marker (a renderable) — pass as an el() child.

```ts
interface WhenMarker extends QrpRenderable {}
```

A when() marker (a renderable) — pass as an el() child.

```ts
type Component<C = unknown> = (parent: HTMLElement, ctx: C) => void;
```

A component is a function that populates a parent element.

```ts
interface RouteContext {
	params: Record<string, string>;
	query: Record<string, string>;
	path: string;
}
```

Context passed to a matched route component.

```ts
interface ListOptions {
	/**
	 * What to do when two items share a key (the row is dropped either way — a DOM
	 * node lives in one place): "error" (default, console.error — CI-visible),
	 * "warn" (quieter), or "throw" (fatal, for dev/CI).
	 */
	onDuplicateKey?: "error" | "warn" | "throw";
}
```

```ts
interface CompiledPath {
	keys: (string | number)[];
	regexp: RegExp;
}
```

```ts
interface NavigateOptions {
	/** replaceState instead of pushState. */
	replace?: boolean;
}
```

```ts
interface RouterOptions {
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
```

```ts
interface RouterHandle {
	navigate: typeof navigate;
	render(): void;
	dispose(): void;
}
```


## html — HTML templates

```js
import { … } from "@nemanjan00/qrp/html"
```

Author DOM as HTML strings. Three forms: `` html`…` `` / `html("…")` (inline,
`${}` holes), `html.template("…#{field}…")` (storable, filled from data), and
`ref()` (inject a live node into a plain string).

**Escaping — the precise guarantee.** A value interpolated in **text** position
(a child hole, `${}` or `#{}`) is rendered as a text node — it never touches
`innerHTML`, so it can't inject an element, `<script>`, or event handler,
whatever string it holds. Attribute values are set verbatim (via
`setAttribute`/property — never re-parsed as HTML, so no breakout into a new
attribute or tag), **but URL schemes are NOT sanitized**: a `javascript:` value
in an `href` passes through, same as Lit. Don't put untrusted data in
`href`/`src`/`style` without your own check. Attack vectors are in
`test/html-xss.test.js`, verified in real Chromium.

### `html`

```ts
html(strings: TemplateStringsArray, ...values: unknown[]): Node | DocumentFragment
html(markup: string): Node | DocumentFragment
```

Build DOM from an HTML template (tagged, `${}` holes) or a plain string.
Text holes are escaped; `${() => …}` holes are reactive; `onX=${fn}` wires
a listener. Returns the single root node, or a DocumentFragment.

```js
html`<button onclick=${() => count.n++}>${() => count.n}</button>`;
```

### `ref`

```ts
ref(value: Renderable): string
```

Register a value for embedding in a plain html() string; returns an opt-in
token. html() swaps it for the real node/binding (consumed on use).


## forms

```js
import { … } from "@nemanjan00/qrp/forms"
```

Declarative forms + an open input-type registry. A `FieldSpec` is
`{ name?, description?, type?, input?, default?, options?, …native attrs }`.
Built-in `type`s: every native `<input>` variant, plus `textarea`, `select`,
`radio`. Register your own with `registerInput`.

### `parseKV`

```ts
parseKV(text: string): Record<string, string>
```

Parse a KEY=value config string into an object.

### `serializeKV`

```ts
serializeKV(settings: Record<string, any>): string
```

Serialize an object back to a KEY=value string.

### `registerInput`

```ts
registerInput(type: string, factory: InputFactory): InputFactory
```

Register (or override) an input type by name; returns the factory.

### `getInput`

```ts
getInput(type: string): InputFactory | undefined
```

Look up a registered input factory by name.

### `multichoice`

```ts
multichoice(options: Record<string, string>): InputFactory
```

A select factory built from inline options (procedural style).

### `inputs`

```ts
inputs: Record<string, InputFactory> & { multichoice: typeof multichoice }
```

The input registry, addressable by type name, plus `multichoice`.

### `field`

```ts
field(settings: Record<string, any>, key: string, spec?: FieldSpec): HTMLElement
```

Render one labelled field (label + input + description).

### `form`

```ts
form(spec: FormSpec): HTMLElement
```

Render a full settings form grouped into sections.

### `textual`

```ts
textual(settings: Record<string, any>): HTMLTextAreaElement
```

A textarea editing the same settings state (KEY=value), both directions.

#### Supporting types

```ts
type InputFactory = (
	settings: Record<string, any>,
	key: string,
	field?: FieldSpec
) => Element;
```

An input factory: builds a two-way-bound control for settings[key].

```ts
interface FieldSpec {
	name?: string;
	description?: string;
	/** A registered input type name (e.g. "text", "select", "email"). */
	type?: string;
	/** A procedural input factory (wins over `type`). */
	input?: InputFactory;
	default?: unknown;
	/** For select/radio types. */
	options?: Record<string, string>;
	/** Passthrough native attributes. */
	placeholder?: string;
	min?: number | string;
	max?: number | string;
	step?: number | string;
	pattern?: string;
	required?: boolean;
	autocomplete?: string;
	[key: string]: any;
}
```

A field descriptor in a form()/field() config.

```ts
interface Section {
	name: string;
	filter: (key: string, value?: unknown) => boolean;
}
```

```ts
interface FormSpec {
	settings: Record<string, any>;
	fields?: Record<string, FieldSpec>;
	sections?: Section[];
}
```


## collection

```js
import { … } from "@nemanjan00/qrp/collection"
```

Reactive sort / filter / paginate over a dataset. `collection(source, options)`
returns `{ sort, filter, page, items(), filtered(), total(), pageCount(),
pageIndex(), toggleSort() }`;
`items()` is reactive — feed it to `list()`. `options`:
`{ sort?, page?, filter?, filterFn?, compare?, clearSort? }`. `sorted()` is the
filtered+sorted set across all pages ("export what I see"). `searchFilter(fields)`
builds a search-box `filterFn` (AND-ed terms, `field:text`, "quoted phrases"). `compareValues(a, b, dir?)`
is the default comparator (missing values last, numbers/Dates numeric, else
natural-order strings) — reuse it inside a custom `compare`.

### `collection`

```ts
collection<T>(source: () => readonly T[], options?: CollectionOptions<T>): Collection<T>
```

Reactive sort / filter / paginate over a dataset.

### `compareValues`

```ts
compareValues(a: unknown, b: unknown, dir?: number): number
```

The default sort comparator: null/undefined/NaN always last (either
direction), numbers and Dates numerically, everything else by natural-order
string comparison. `dir` is 1 (ascending, default) or -1.

### `searchFilter`

```ts
searchFilter<T>(fields: readonly SearchField<T>[] | Record<string, (item: T) => unknown>, options?: { key?: string }): (item: T, filter: Record<string, any>) => boolean
```

A ready-made `filterFn` for a search box. Every whitespace-separated term must
match (case-insensitive substring); `field:text` limits a term to the field
labelled `field` (or the first label starting with it); "quoted phrases" keep
spaces. Reads the query from `filterState[options.key ?? "q"]`.

#### Supporting types

```ts
type SearchField<T> = string | { key?: string; label?: string; value?: (item: T) => unknown; accessor?: (item: T) => unknown };
```

A search field: a key, a `{ key, label?, value? }` descriptor (table/export column shape).

```ts
interface SortState {
	key: string | null;
	/** 1 ascending, -1 descending. */
	dir?: number;
}
```

```ts
interface PageState {
	index: number;
	/** items per page; 0 = no paging. */
	size: number;
}
```

```ts
interface CollectionOptions<T> {
	/**
	 * Sort state. A plain object literal is wrapped in `state()` for you; pass
	 * `state({ key, dir })` when you want a handle to drive the sort yourself.
	 */
	sort?: SortState;
	page?: PageState;
	filter?: Record<string, any>;
	filterFn?: (item: T, filter: Record<string, any>) => boolean;
	compare?: (a: T, b: T, sort: SortState) => number;
	/** `toggleSort` cycles asc → desc → off (source order) instead of asc ⇄ desc. */
	clearSort?: boolean;
}
```

```ts
interface Collection<T> {
	sort: SortState;
	filter: Record<string, any>;
	page: PageState;
	/** Reactive: sorted → filtered → paged items. Feed to list(). */
	items(): T[];
	/** Reactive: the full filtered set (unpaged, unsorted) — for select-all/export. */
	filtered(): T[];
	/** Reactive: filtered and sorted, unpaged — export what the user sees, in their order. */
	sorted(): T[];
	/** Count after filtering (before paging). */
	total(): number;
	/** Number of pages at the current size. */
	pageCount(): number;
	/**
	 * Reactive: the page `items()` shows — `page.index` clamped to
	 * [0, pageCount-1]. After a filter shrinks the set, `page.index` may be out
	 * of range; pagers and "Showing X–Y" summaries should read this instead.
	 */
	pageIndex(): number;
	/**
	 * Toggle sort direction on the same key, else sort by it ascending. With
	 * `clearSort`, clicking a descending key clears the sort.
	 */
	toggleSort(key: string): void;
}
```


## table

```js
import { … } from "@nemanjan00/qrp/table"
```

A declarative data table over `collection` + `list`: sortable headers, keyed
row reuse, per-column config. A column is `{ key, label?, accessor?, formatter?,
render?, header?, sortable?, sortByFormatted?, thClass?, tdClass? }`. `fields`
may be a thunk for reactive columns; `expandable` adds detail rows. The
returned table has `.view` (the collection, for `tablePager`/`tableSummary`)
plus `.expanded`/`.toggleRow`. Every part carries a stable `qrp-*` class; style
it through a design system with `classes` (per part), `attrs` (reactive
attributes per part) and `sortIndicator`; share a `collection`/`dataGrid` with
the `view` option.

### `table`

```ts
table<T>(options: TableOptions<T>): TableElement<T>
```

Build a declarative, sortable, keyed, paginated data table.

### `tablePager`

```ts
tablePager(view: Pick<Collection<any>, "page" | "pageCount">, options?: { window?: number; /** Extra classes: the <nav>, every button, the current page's button, the "…" gap. */ classes?: { nav?: string; button?: string; active?: string; gap?: string }; }): HTMLElement
```

A stock prev / windowed-pages / next control for a table().view (or any
 collection / dataGrid — it only reads `page` and `pageCount()`).

### `tableSummary`

```ts
tableSummary(view: Pick<Collection<any>, "page" | "total">, options?: { label?: (from: number, to: number, total: number) => string; }): HTMLElement
```

A reactive "Showing X–Y of Z" summary for a table().view (or any
 collection / dataGrid — it only reads `page` and `total()`).

#### Supporting types

```ts
interface Column<T> {
	/** Unique id and default value path (item[key]). */
	key: string;
	label?: string;
	/** item => raw value (default item[key]); supports nesting. */
	accessor?: (item: T) => unknown;
	/** (rawValue, item) => display text. Already reactive (see `render`). */
	formatter?: (value: any, item: T) => Renderable;
	/** item => Element — a custom cell (overrides formatter).
	 *
	 *  **Already reactive — no thunk needed.** table() calls `render` inside a
	 *  reactive region of its own (the `<td>`'s child is `() => render(item)`), so
	 *  the cell re-renders whenever the row's item is REPLACED (refetch) or any
	 *  state `render` reads changes. Returning plain values is fine and stays live.
	 *  Inner thunks are an optimization, not a requirement: with
	 *  `render: (r) => el("b", {}, () => r.count)` only the text node updates; without
	 *  the thunk the whole cell's content is rebuilt (matters for cells holding
	 *  focus, an `<input>`, or expensive markup — not for correctness).
	 *  `formatter` and `expandable` follow the same rule. */
	render?: (item: T) => Renderable;
	/** column => Renderable — custom header content (a select-all box, filter…);
	 *  its own clicks don't trigger the column sort. Overrides `label`. */
	header?: (column: Column<T>) => Renderable;
	sortable?: boolean;
	/** Sort by the formatter output instead of the raw value. */
	sortByFormatted?: boolean;
	thClass?: string;
	tdClass?: string;
}
```

A column descriptor for table().

```ts
type TableRows<T> = (() => readonly T[]) | readonly T[];
```

Where a table() gets its rows: a `rows` source, or a shared `view`.

```ts
type TableView<T> = Pick<Collection<T>, "items" | "sort" | "toggleSort"> & Partial<Collection<T>>;
```

What table() needs from a shared `view` (a collection() or dataGrid).

```ts
type TableOptions<T> = TableBaseOptions<T> & (
	| { rows: TableRows<T>; view?: undefined }
	| {
		/** Render through an existing collection() or dataGrid (anything with
		 *  `items()`, `sort` and `toggleSort`) instead of building a second one. It
		 *  owns rows/sort/filter/page — those options and `filterFn` are ignored —
		 *  and sorting uses its compare. Share it with a toolbar/pager so both agree. */
		view: TableView<T>;
		/** Ignored when `view` is given. */
		rows?: TableRows<T>;
	}
);
```

table() options: `rows`, or a shared `view` (then `rows` is optional and ignored).

```ts
interface TableBaseOptions<T> {
	/** Columns — an array, or a thunk `() => Column[]` for a reactive set
	 *  (column visibility toggle, role-gated columns; rows re-render, elements reused). */
	fields: Column<T>[] | (() => Column<T>[]);
	/** Enable expandable rows: item => the detail panel shown below the row.
	 *  A row click toggles it (interactive cells excluded); also `.toggleRow(key)`. */
	expandable?: (item: T) => Renderable;
	/** item => stable key (the :key equivalent; default item.id). */
	key?: (item: T) => unknown;
	/**
	 * Sort state. A plain object literal is wrapped in `state()` for you; pass
	 * `state({ key, dir })` when you want a handle to drive the sort yourself.
	 */
	sort?: SortState;
	page?: PageState;
	filter?: Record<string, any>;
	filterFn?: (item: T, filter: Record<string, any>) => boolean;
	/** Header clicks cycle asc → desc → off (source order) instead of asc ⇄ desc. */
	clearSort?: boolean;
	rowClass?: (item: T) => string;
	/** Extra class(es) for the <table>. */
	class?: string;
	/** Extra classes per part, merged with the qrp-* classes and the per-column
	 *  thClass/tdClass and rowClass. `tr` may be a function of the row's item. */
	classes?: TableClasses<T>;
	/** Custom sort indicator for sortable headers (replaces ▲/▼). `dir` is 1
	 *  (ascending), -1 (descending) or 0 (not the sort column). */
	sortIndicator?: (dir: 1 | -1 | 0) => Renderable;
	/** Reactive attribute hooks (null/false removes): a selected row's
	 *  `data-state`/`aria-selected`, a cell's `data-label`, a header's `scope`. */
	attrs?: {
		tr?: (item: T) => Record<string, string | number | boolean | null | undefined>;
		td?: (column: Column<T>, item: T) => Record<string, string | number | boolean | null | undefined>;
		th?: (column: Column<T>) => Record<string, string | number | boolean | null | undefined>;
	};
	sortField?: string;
	sortDesc?: boolean;
}
```

The table() options shared by both row sources (see TableOptions).

```ts
interface TableClasses<T> {
	thead?: string;
	headRow?: string;
	th?: string;
	tbody?: string;
	tr?: string | ((item: T) => string);
	td?: string;
	expandRow?: string;
	expandCell?: string;
}
```

Extra classes for each part of a table().

```ts
type TableElement<T> = HTMLTableElement & {
	view: Collection<T>;
	/** Reactive per-key open flags for expandable rows (`expanded[key]`). */
	expanded: Record<string, boolean>;
	/** Toggle a row's detail panel by its key. */
	toggleRow: (key: unknown) => void;
};
```

The table element: `.view` (the collection), plus expansion controls.


## datagrid

```js
import { … } from "@nemanjan00/qrp/datagrid"
```

A headless data-grid state machine over collection(): row selection (with
select-all + indeterminate), column visibility, page-size, and a windowed
pager. State only — you bring markup + CSS (like the behaviors). `grid.items()`
feeds a `list()`/`table()`, `grid.key` is the keyed-list id. `dataGrid(source,
options)` where options add `{ key?, columns?, pageSizes? }` on top of every
collection() option.

### `dataGrid`

```ts
dataGrid<T>(source: () => readonly T[], options?: DataGridOptions<T>): DataGrid<T>
```

Headless data-grid state machine (selection, columns, paging) over collection().

#### Supporting types

```ts
interface GridColumn {
	key: string;
	label?: string;
	/** Start hidden. */
	hidden?: boolean;
	[extra: string]: any;
}
```

A column entry for visibility toggling (superset-compatible with table fields).

```ts
interface DataGridOptions<T> extends CollectionOptions<T> {
	/** item => stable id (default `item.id`); selection identity + keyed reuse. */
	key?: (item: T) => string | number;
	/** Column model for visibility toggling. */
	columns?: GridColumn[];
	/** Page-size options (default [10, 25, 50, 100]). */
	pageSizes?: number[];
}
```

```ts
interface DataGrid<T> {
	/** The underlying collection (sort/filter/paginate). */
	view: Collection<T>;
	/** The stable-id function — pass to list()/table(). */
	key: (item: T) => string | number;

	// collection passthroughs (grid is a one-stop controller)
	/** Reactive current-page rows. Feed to list(). */
	items(): T[];
	/** Count after filtering (before paging). */
	total(): number;
	/** Number of pages at the current size. */
	pageCount(): number;
	/** The page shown: `page.index` clamped to [0, pageCount-1]. */
	pageIndex(): number;
	/** Toggle sort on a key (asc, then flip). */
	toggleSort(key: string): void;
	sort: SortState;
	filter: Record<string, any>;
	page: PageState;

	// selection (by stable id, across the whole filtered set)
	/** Reactive map of selected ids `{ [id]: true }`. */
	selection: Record<string, boolean>;
	isSelected(item: T): boolean;
	select(item: T): void;
	deselect(item: T): void;
	toggle(item: T): void;
	/** Select every row in the current filtered set (all pages). */
	selectAll(): void;
	/** Deselect every id, including rows hidden by the current filter. */
	clearSelection(): void;
	/**
	 * Select every filtered row if not all are selected, else deselect only the
	 * filtered rows (selections hidden by the filter are kept).
	 */
	toggleAll(): void;
	/** True when every filtered row is selected (header checkbox checked). */
	allSelected(): boolean;
	/** True when some but not all are selected (header checkbox indeterminate). */
	someSelected(): boolean;
	selectedIds(): string[];
	/** Selected rows resolved against the current filtered set. */
	selectedItems(): T[];

	// column visibility
	columns: GridColumn[];
	isVisible(columnKey: string): boolean;
	showColumn(columnKey: string): void;
	hideColumn(columnKey: string): void;
	toggleColumn(columnKey: string): void;
	visibleColumns(): GridColumn[];

	// paging
	pageSizes: number[];
	/** Set page size and jump back to the first page. */
	setPageSize(size: number): void;
	/** Go to a page index, clamped to [0, pageCount-1]. */
	goto(index: number): void;
	next(): void;
	prev(): void;
	hasNext(): boolean;
	hasPrev(): boolean;
	/** A clamped, current-centered window of page indices (default span 5). */
	pageWindow(span?: number): number[];
}
```


## http

```js
import { … } from "@nemanjan00/qrp/http"
```

A fetch client for a JSON backend: URL shaping, auth headers, a reactive
in-flight loader, and centralized errors on the bus. **A non-2xx response
rejects with `{ status, data, response }`** (data is the parsed error body) and
emits `error`; a 401 (or an `Unauthorized` body) also emits `auth:unauthorized`.
Nullish params are skipped, arrays repeat the key, `FormData`/`Blob`/etc. pass
through, plain objects are JSON-encoded.

### `createHttp`

```ts
createHttp(options?: HttpOptions): HttpClient
```

Create a fetch client: URL shaping, auth headers, reactive loader, error bus.

#### Supporting types

```ts
interface HttpError {
	status: number;
	data: any;
	response: Response;
}
```

Rejection value for a non-2xx response.

```ts
interface HttpOptions {
	/**
	 * Prefix for relative URLs, joined to the path with exactly one `/` — a
	 * leading slash on the path is optional (`"/api/v1"` + `"dimensions"` →
	 * `/api/v1/dimensions`). Absolute URLs (`https://…`, any `scheme://…`) are
	 * left untouched; a protocol-relative `//host/…` is treated as a path, so
	 * the bearer token never leaves the origin.
	 */
	baseUrl?: string;
	/** () => bearer token, attached as Authorization. */
	token?: () => string | null | undefined;
	/** () => value for the x-authorization-client header. */
	client?: () => string | null | undefined;
	/** Headers merged into every request. */
	headers?: Record<string, string>;
	/** Emitter for loader/error/auth events (default the global bus). */
	bus?: Emitter;
	/**
	 * Transport, defaults to the global `fetch`. Pass a custom one to mock the
	 * backend in tests or wrap it (retry, dedupe, circuit-breaker).
	 */
	fetch?: typeof fetch;
}
```

```ts
interface RequestConfig {
	params?: Record<string, any>;
	body?: unknown;
	headers?: Record<string, string>;
	signal?: AbortSignal;
	/**
	 * How to read a successful response body. Default "json" (parsed). Use
	 * "text" for plain text, "arraybuffer"/"blob" for binary (msgpack, downloads),
	 * or "response" to get the raw Response untouched. Non-2xx always rejects
	 * with { status, data, response } regardless.
	 */
	responseType?: "json" | "text" | "arraybuffer" | "blob" | "response";
	/** Any other fetch init (credentials, mode, cache, …). */
	init?: RequestInit;
}
```

```ts
interface HttpClient {
	/** Reactive in-flight counter: read loading.pending in an effect. */
	loading: { pending: number };
	request(method: string, path: string, config?: RequestConfig): Promise<any>;
	get(path: string, config?: RequestConfig): Promise<any>;
	delete(path: string, config?: RequestConfig): Promise<any>;
	head(path: string, config?: RequestConfig): Promise<any>;
	post(path: string, body?: unknown, config?: RequestConfig): Promise<any>;
	put(path: string, body?: unknown, config?: RequestConfig): Promise<any>;
	patch(path: string, body?: unknown, config?: RequestConfig): Promise<any>;
}
```


## socket

```js
import { … } from "@nemanjan00/qrp/socket"
```

A reconnecting WebSocket for live dashboards. `socket(url, options)` opens
`ws(s)://` on the page's origin for a path, reconnects with exponential
backoff, exposes `status` as reactive state (`state`, `connected`,
`attempts`), decodes JSON, and routes messages by their `type` field:
`on("samples", fn)`. `send()` returns false while disconnected. Created inside
a scope, it closes with it.

### `socket`

```ts
socket(url: string | (() => string), options?: SocketOptions): Socket
```

Open a reconnecting WebSocket. `url` may be a path ("/ws"), a full ws(s)/http(s)
URL, or a function re-read on every reconnect (fresh tokens).

#### Supporting types

```ts
interface SocketStatus {
	state: "connecting" | "open" | "closed";
	connected: boolean;
	/** Reconnect attempts since the last successful open. */
	attempts: number;
}
```

```ts
interface ReconnectOptions {
	/** First delay in ms (default 500). */
	min?: number;
	/** Delay cap in ms (default 10000). */
	max?: number;
	/** Growth per attempt (default 2). */
	factor?: number;
}
```

```ts
interface SocketOptions {
	protocols?: string | string[];
	binaryType?: BinaryType;
	/** Backoff config, or false to never reconnect. */
	reconnect?: ReconnectOptions | false;
	/** Incoming data → message. Default: JSON.parse when it parses, else the raw data. */
	decode?: (data: any) => any;
	/** Outgoing value → data. Default: strings/binary as-is, everything else JSON. */
	encode?: (value: any) => string | ArrayBufferLike | Blob | ArrayBufferView;
	/** Field a decoded object is routed by (default "type"). */
	typeKey?: string;
}
```

```ts
interface Socket {
	/** Reactive connection state. */
	status: SocketStatus;
	/**
	 * Subscribe; returns an unsubscribe function. Types: "open", "close",
	 * "error", "message" (every message), or a message's `type` value.
	 */
	on<T = any>(type: string, handler: Handler<T>): () => void;
	off(type: string, handler: Handler): void;
	/** Send (encoded); false and dropped while not connected. */
	send(value: any): boolean;
	/** Bytes queued on the socket (bufferedAmount); 0 while disconnected. */
	buffered(): number;
	/** Drop the current connection and connect again now. */
	reconnect(): void;
	/** Close for good (no more reconnects). Also runs on scope dispose. */
	close(code?: number, reason?: string): void;
}
```


## store

```js
import { … } from "@nemanjan00/qrp/store"
```

Plumbing for an app-wide store that mirrors a server (see
docs/LARGE-APPS.md). `assign(target, patch)` merges a snapshot in one batch,
writing only changed keys. `append(array, items, max)` keeps a capped feed.
`coalesce(target, { interval })` turns a high-rate stream into one batched
write every `interval` ms (latest value per key wins).

### `assign`

```ts
assign<T extends object>(target: T, patch: Partial<T>, options?: { prune?: boolean }): string[]
```

Merge `patch` into a reactive object in one batch, writing only keys whose
value changed (`Object.is`). `prune` deletes keys the patch lacks. Returns the
changed keys.

```js
live.on("state", (msg) => assign(lab, msg.state));
```

### `append`

```ts
append<T>(array: T[], items: T | T[], max?: number): T[]
```

Append item(s) to a reactive array, dropping the oldest past `max`, in one
batch.

```js
live.on("activity", (msg) => append(lab.activity, msg.entry, 500));
```

### `coalesce`

```ts
coalesce<T extends object>(target: T, options?: CoalesceOptions): Coalesced<T>
```

Buffer high-rate writes and apply them to `target` in one batch per
`interval`, skipping unchanged values.

```js
const values = coalesce(lab.live, { interval: 250 });
live.on("samples", (msg) => values.set(msg.name, msg.last));
```

#### Supporting types

```ts
interface CoalesceOptions {
	/** ms between flushes (default 250), or "frame" for the next animation frame. */
	interval?: number | "frame";
}
```

```ts
interface Coalesced<T> {
	/** Queue a value; it lands on `target[key]` at the next flush (latest wins). */
	set<K extends keyof T>(key: K, value: T[K]): void;
	/** Apply everything pending now. */
	flush(): void;
	/** Cancel the pending flush and drop queued values (also on scope dispose). */
	dispose(): void;
}
```


## host

```js
import { … } from "@nemanjan00/qrp/host"
```

Bridges for apps where qrp doesn't own the whole page: a layout library
(GridStack, golden-layout), another framework's router, a legacy shell (see
docs/LARGE-APPS.md). `island(parent, view, props)` mounts a qrp view into a
container someone else owns, with props pushed in through `update()`.
`reconcile(source, key, hooks)` keeps a keyed set of foreign widgets in sync
with a reactive list (create / update / recreate / destroy, one scope per
item). For the reverse direction, a foreign widget inside qrp DOM, see
`embed` in behaviors.

### `island`

```ts
island<P extends object>(parent: HTMLElement, view: (props: P) => unknown, initial?: P): Island<P>
```

Mount `view(props)` into a container owned by something else, with reactive
props. `update(next)` re-runs only the bindings that read a changed key.
Created inside a scope (a component, `reconcile`'s `create`), it also
disposes with that scope.

```js
const panel = island(gridItemBody, (p) => el("h3", {}, () => p.title), { title: "CPU" });
panel.update({ title: "CPU %" });
```

### `reconcile`

```ts
reconcile<T, H, K = unknown>(source: () => readonly T[] | null | undefined, key: (item: T) => K, hooks: ReconcileHooks<T, H, K>): Reconciled<H, K>
```

Keep a keyed set of things qrp doesn't render (grid widgets, map layers,
dock panels) in sync with a reactive list, like `list()` does for DOM.

```js
reconcile(() => lab.panes, (p) => p.id, {
  create: (pane) => addWidget(pane),
  update: (w, pane) => w.panel.update({ pane }),
  recreate: (prev, next) => prev.type !== next.type,
  destroy: (w) => grid.removeWidget(w.item)
});
```

#### Supporting types

```ts
interface Island<P extends object> {
	/** The reactive props the view reads. */
	props: P;
	/** Write changed keys (Object.is) in one batch and delete missing ones. */
	update(next: P): void;
	/** Tear down the view's effects and clear its DOM. */
	dispose(): void;
}
```

```ts
interface ReconcileHooks<T, H, K> {
	/** Build the foreign thing for a new key; runs in its own scope. Returns your handle. */
	create(item: T, key: K): H;
	/** The item under a key changed (per `equals`). */
	update?(handle: H, item: T, previous: T): void;
	/** A key went away (its scope is disposed right after). */
	destroy?(handle: H, key: K): void;
	/** Return true to destroy + create instead of update (e.g. the type changed). */
	recreate?(previous: T, item: T): boolean;
	/** Item equality (default Object.is). */
	equals?(previous: T, item: T): boolean;
}
```

```ts
interface Reconciled<H, K> {
	/** A copy of the live handles by key. */
	handles(): Map<K, H>;
	/** Destroy every entry and stop tracking (also on scope dispose). */
	dispose(): void;
}
```


## resource

```js
import { … } from "@nemanjan00/qrp/resource"
```

Reactive async data — `loading`/`data`/`error`/`reload`, transport-agnostic
(hand it a fetcher thunk). Optional `refreshOn` wires it to the event bus for
global refresh. `asyncView` maps the state to `when` branches.

### `asyncView`

```ts
asyncView<T>(res: Resource<T>, views?: AsyncViews<T>): WhenMarker
```

Map a resource's state to `when` branches (loading/error/empty/data).

A branch is built once per phase, not per value: a reload that goes
data → data keeps the data branch (keyed rows, focus, sort/selection state
survive). Read the live value through the resource inside the branch —
`data: () => list(() => res.data, (r) => r.id, row)` — the callback's
argument is only the value the branch was first built with.

#### Supporting types

```ts
interface ResourceOptions<T> {
	/** Value for `data` before the first load (e.g. SSR-injected). */
	initial?: T | null;
	/** Load on creation (default true). */
	immediate?: boolean;
	/** Emitter for `refreshOn` (default the global bus). */
	bus?: { on(type: string, handler: (...args: any[]) => void): () => void };
	/** Bus event(s) that trigger a reload. */
	refreshOn?: string | string[];
}
```

```ts
interface Resource<T> {
	/** Reactive: the latest data (or `initial`/null). */
	readonly data: T | null;
	/** Reactive: a fetch is in flight. */
	readonly loading: boolean;
	/** Reactive: the last error, or null. */
	readonly error: unknown;
	/** Trigger a reload; returns the settling promise. */
	reload(): Promise<void>;
}
```

```ts
interface AsyncViews<T> {
	loading?: () => unknown;
	error?: (error: unknown) => unknown;
	empty?: () => unknown;
	data?: (data: T) => unknown;
}
```


## format

```js
import { … } from "@nemanjan00/qrp/format"
```

Intl-backed pure formatters for dashboards — zero-dep, safe in reactive
bindings (nullish/NaN → ""). `num`, `compact`, `pct`, `bytes`, `duration`,
`relTime`, `date`, plus SI/engineering notation `si` and its inverse
`parseSI` ("2.4G", "100m", "3.3 kV") for instrument/IoT/latency readouts
and numeric inputs. Each formatter takes optional Intl options.

### `num`

```ts
num(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string
```

A plain number: `num(1234.5)` → "1,234.5".

### `compact`

```ts
compact(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string
```

Compact notation: `compact(43373)` → "43.4K".

### `pct`

```ts
pct(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string
```

Percent of a 0–1 ratio: `pct(0.13)` → "13%".

### `bytes`

```ts
bytes(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string
```

Human bytes (base 1024): `bytes(1536)` → "1.5 KB".

### `duration`

```ts
duration(ms: number | null | undefined, opts?: Intl.NumberFormatOptions): string
```

Human duration from milliseconds: `duration(87*864e5)` → "2.9 months".

### `relTime`

```ts
relTime(value: Date | string | number | null | undefined, opts?: Intl.RelativeTimeFormatOptions): string
```

Relative time vs now: `relTime(iso)` → "2 hours ago".

### `date`

```ts
date(value: Date | string | number | null | undefined, opts?: Intl.DateTimeFormatOptions): string
```

A date/time: `date(iso)` → "Jul 17, 2026".

### `si`

```ts
si(value: number | null | undefined, unit?: string, opts?: Intl.NumberFormatOptions): string
```

Engineering notation with an SI prefix: `si(0.0012, "V")` → "1.2 mV",
`si(433.92e6, "Hz")` → "433.92 MHz", `si(1500)` → "1.5 k". The prefix is
picked after rounding (999.9996 → "1 k"). Defaults to 3 fraction digits.

### `parseSI`

```ts
parseSI(text: string | number | null | undefined, unit?: string): number
```

Parse a number with an optional SI prefix — the inverse of `si`:
`parseSI("2.4G")` → 2.4e9, `parseSI("3.3 kV", "V")` → 3300. Prefixes are
case-sensitive (m = milli, M = mega); "u"/"μ" read as µ, "K" as k. Returns
NaN when the text isn't a number (check with `Number.isFinite`).


## export

```js
import { … } from "@nemanjan00/qrp/export"
```

"Get this data out" — `toCSV` / `download` / `copy`. Zero-dep, pairs with
table/collection: `download(toCSV(view.filtered(), columns), "data.csv")`.

### `toCSV`

```ts
toCSV(rows: readonly any[], columns?: readonly ExportColumn[], options?: ToCSVOptions): string
```

Rows → a CSV string (RFC-4180 quoting). Columns default to the first row's keys.
Formula-looking string cells are guarded by default — see {@link ToCSVOptions}.

### `download`

```ts
download(content: string | Blob, filename: string, type?: string): void
```

Trigger a browser download of `content` (string or Blob) as `filename`. The
object URL is revoked after a delay, not synchronously (an immediate revoke
can cancel the download in Safari/Firefox).

### `copy`

```ts
copy(text: string): Promise<void>
```

Copy text to the clipboard. Uses `navigator.clipboard` where it exists
(secure contexts) and falls back to `execCommand("copy")` on plain-http
origins such as `http://192.168.1.10` — where `navigator.clipboard` is
undefined. Always returns a promise; rejects if the browser refuses.

#### Supporting types

```ts
type ExportColumn =
	| string
	| { key: string; label?: string; value?: (row: any) => unknown; accessor?: (row: any) => unknown };
```

```ts
interface ToCSVOptions {
	/**
	 * Prefix string cells (and header labels) starting with = + - @ or tab/CR with
	 * `'` so spreadsheets don't run them as formulas (CSV injection). Numbers,
	 * numeric strings — plain or formatted (`"-5"`, `"-1,234.50"`, `"-10%"`,
	 * `"-$5"`) — and a lone `"-"` are never changed. Default `true`.
	 */
	formulaGuard?: boolean;
}
```


## spark

```js
import { … } from "@nemanjan00/qrp/spark"
```

A charting *primitive*: data in, a reactive `el()` `<svg>` out (line / area /
bar). No tooltips/legends — the sparkline/mini-chart 80% — but `project()`
returns the screen points the marks are drawn from, for your own hit-testing.
Pass `() => series` for a live chart. Composes `scale`; enabled by SVG-aware `el`.

**Several series, one chart:** give every spark the same `xDomain`/`yDomain`
(a shared [min, max] or thunk) and layer the `<svg>`s; `stack` puts a series on
a baseline (stacked areas/bars) and `group: [i, n]` places grouped bars side by
side. `responsive: true` stretches to the container without distorting strokes.

**Colour & theming:** the mark uses `stroke` (default `"currentColor"`), so it
inherits the surrounding text colour and works in any theme — set `color` on a
parent, or pass `stroke`/`fill`. A single-point (or perfectly flat) series
renders centered, not pinned to the corner.

**Gaps:** a `null`/`undefined`/`NaN` value is a gap — the line/area breaks
there (a new subpath), a bar is skipped, and `project()` omits that point
(the rest keep their `index`). Gaps don't count toward the y extent.

**`axis: true`** draws only a **baseline rule** (a `<line>` in `currentColor` at
low opacity) — no tick labels; this is a primitive, not an axis component. For
labelled ticks, add your own `<text>` (see `scale.ticks`) or a caption next to
the chart.

**Recipe — multiple series on a shared scale** (actual-vs-target,
before-vs-after). `spark()` is deliberately single-series; the multi-line 80%
chart is a short composition in the same idiom — a static `el()` `<svg>`
skeleton, one reactive `points` binding per series over a *shared* y-domain,
and `list()` for grid lines keyed by tick value:

### `spark`

```ts
spark(source: (() => readonly any[]) | readonly any[], opts?: SparkOptions): SVGElement
```

Data → a reactive `<svg>` mini-chart. Pass `() => data` to make it live.

### `project`

```ts
project<T = any>(source: (() => readonly T[]) | readonly T[], opts?: SparkOptions): SparkPoint<T>[]
```

Where each datum lands on screen under the same options a `spark()` uses — the
points its marks are drawn from. Hit-test a pointer against them for a
tooltip or cursor. Reads the source once, now. Gap points (null/NaN values)
are left out; each point's `index` still refers to the source array.

#### Supporting types

```ts
interface SparkPoint<T = any> {
	x: number;
	y: number;
	/** The baseline under the point (area floor / bar start). */
	y0: number;
	index: number;
	datum: T;
	/** Bars only: the bar's width and left edge. */
	width?: number;
	left?: number;
}
```

A datum's place on screen, from `project()`.

```ts
interface SparkOptions {
	kind?: "line" | "area" | "bar";
	width?: number;
	height?: number;
	padding?: number;
	/** key or accessor for x (default: array index). */
	x?: string | ((d: any, i: number) => number);
	/** key or accessor for y (default: the number itself, or `d.y`). */
	y?: string | ((d: any, i: number) => number);
	/** Fixed x extent (or a thunk) — share it across sparks for a common axis. Line/area only. */
	xDomain?: readonly [number, number] | (() => readonly [number, number]);
	/** Fixed y extent (or a thunk) — share it across sparks for a common axis. */
	yDomain?: readonly [number, number] | (() => readonly [number, number]);
	/** y baseline: the area fills down to it, bars grow from it (bars default 0). */
	base?: number;
	/** Per-point baseline for stacking: an array aligned with the data, or (d, i) => number. */
	stack?: readonly number[] | ((d: any, i: number) => number);
	/** Line/area interpolation (default "linear"). */
	curve?: "linear" | "monotone" | "natural" | "step";
	/** Bars: `[slot, slots]` — this series is the slot-th of `slots` bars per band. */
	group?: readonly [number, number];
	/** Bars: fraction of each band left empty (default 0.2). */
	gap?: number;
	/** Bars: corner radius. */
	radius?: number;
	/** Fill the container (width/height 100%) with strokes that keep their width. */
	responsive?: boolean;
	stroke?: string;
	fill?: string;
	strokeWidth?: number;
	dots?: boolean;
	/** Draw a baseline rule (currentColor, low opacity). No tick labels. */
	axis?: boolean;
	class?: string;
}
```


## scale

```js
import { … } from "@nemanjan00/qrp/scale"
```

Micro scales for charts — `linear`, `ordinal`, `quantize`, `ticks`, `nice`, and a
colourblind-safe categorical `palette`. Pure, zero-dep; pairs with `spark`.

### `linear`

```ts
linear(domain: readonly [number, number], range: readonly [number, number], opts?: { clamp?: boolean }): (x: number) => number
```

Map numeric domain [d0,d1] onto range [r0,r1]. `{ clamp }` bounds the output.

### `ordinal`

```ts
ordinal<T>(range: readonly T[], domain?: readonly unknown[]): (value: unknown) => T
```

Assign values to a cycling range (series → colour), lazily by first-seen order.

### `quantize`

```ts
quantize<T>(domain: readonly [number, number], range: readonly T[]): (x: number) => T
```

Bucket a numeric domain into `range.length` bands.

### `ticks`

```ts
ticks(domain: readonly [number, number], count?: number): number[]
```

Evenly spaced tick values across [d0,d1] (count+1 points, ends included).

### `nice`

```ts
nice(domain: readonly [number, number], count?: number): { domain: [number, number]; step: number; ticks: number[] }
```

Round a domain out to whole "nice" steps (1, 2, 2.5 or 5 × 10^n) so ticks land
on round numbers. `nice([3, 97], 5)` → `{ domain: [0, 100], step: 20, ticks: [0, 20, …, 100] }`.

### `palette`

```ts
palette: string[]
```

Okabe–Ito colourblind-safe categorical palette (8 hues).


## timeseries

```js
import { … } from "@nemanjan00/qrp/timeseries"
```

Pure math over time-series points `{ x, y }` (x = ms, y = value) — `deltas`,
`rate`, `rolling`, `bucket`, `downsample` (LTTB), plus `mean`/`sum`. Zero-dep;
pairs with `spark`.

### `deltas`

```ts
deltas(points: readonly Point[]): Point[]
```

Successive differences (length n-1).

### `rate`

```ts
rate(points: readonly Point[]): Point[]
```

Per-second rate of change between samples (length n-1).

### `rolling`

```ts
rolling(points: readonly Point[], window: number): Point[]
```

Trailing moving average over the last `window` points (same length).

### `bucket`

```ts
bucket(points: readonly Point[], interval: number, agg?: (ys: number[]) => number): Point[]
```

Group into fixed `interval`-ms buckets, aggregating y (default mean).

### `downsample`

```ts
downsample(points: readonly Point[], threshold: number): Point[]
```

Downsample to ~`threshold` points via Largest-Triangle-Three-Buckets.

#### Supporting types

```ts
interface Point { x: number; y: number; }
```


## events

```js
import { … } from "@nemanjan00/qrp/events"
```

A global event bus on native `EventTarget`. `Emitter`: `on(type, handler) → off`,
`off`, `once(type) → Promise`, `emit(type, detail)`, `request(type, payload,
{ timeout? }) → Promise`, `respond(type, handler) → off`.

### `emitter`

```ts
emitter(): Emitter
```

Create an emitter backed by a native EventTarget.

### `bus`

```ts
bus: Emitter
```

The global event bus.

### `fromEvent`

```ts
fromEvent<T = any, R = T>(source: Emitter | EventTarget, type: string, map?: (detail: T) => R, initial?: R): { value: R }
```

Turn an event source into reactive state holding the latest mapped detail.
The listener is removed when the enclosing scope/effect is disposed.

### `channel`

```ts
channel(name: string): Channel
```

A cross-tab bus over BroadcastChannel (falls back to a local emitter).

### `broadcast`

```ts
broadcast(emitter: Emitter, type: string, store: Record<string, any>, key?: string): { dispose(): void }
```

Mirror a piece of reactive state onto an emitter on every change.

#### Supporting types

```ts
type Handler<T = any> = (detail: T, event?: Event) => void;
```

```ts
interface RequestOptions {
	timeout?: number;
}
```

```ts
interface Emitter {
	target: EventTarget;
	/** Subscribe; returns an unsubscribe function. */
	on<T = any>(type: string, handler: Handler<T>): () => void;
	off(type: string, handler: Handler): void;
	/** Promise for the next event of this type. */
	once<T = any>(type: string): Promise<T>;
	emit(type: string, detail?: any): Emitter;
	/** Fire a request and await a matching response (see respond). */
	request<T = any>(type: string, payload?: any, options?: RequestOptions): Promise<T>;
	/** Answer request()s of a given type. */
	respond(type: string, handler: (payload: any) => any): () => void;
}
```

```ts
interface Channel {
	on<T = any>(type: string, handler: Handler<T>): () => void;
	off(type: string, handler: Handler): void;
	once<T = any>(type: string): Promise<T>;
	emit(type: string, detail?: any): Channel;
	close(): void;
}
```


## toasts

```js
import { … } from "@nemanjan00/qrp/toasts"
```

Notifications driven by the global bus — any code raises one without importing
the UI. `notify.success|error|info|warning(content)` where content is any
renderable; `bus.emit("toast", { variant, content, … })` for any other variant.
Mount the singleton once: `mount(document.body, toasts.component)`.

`push` returns the toast id; `update(id, patch)`, `pause`/`resume` and
`dismiss(id)` act on it, `meta.duration` sets a per-toast timeout, extra meta
fields (description, action, …) stay on the item, and `exitMs` keeps a
dismissed toast (`removed: true`) around for an exit animation — enough for a
custom renderer to be a plain view over `store.items`.

### `createToasts`

```ts
createToasts(options?: ToastsOptions): ToastsController
```

Create a toast controller wired to an emitter.

### `toasts`

```ts
toasts: ToastsController
```

The default toast controller wired to the global bus.

### `notify`

```ts
notify: { success(content: Renderable | ToastPayload): void; error(content: Renderable | ToastPayload): void; info(content: Renderable | ToastPayload): void; warning(content: Renderable | ToastPayload): void; }
```

Fire-and-forget notifications through the global bus. Content is a
 renderable, or a `{ message | content | body, title, … }` payload.

#### Supporting types

```ts
interface ToastPayload extends ToastMeta {
	content?: Renderable;
	message?: Renderable;
	body?: Renderable;
}
```

An object payload for a bus toast event / notify: the content is taken from
`content`, else `message`, else `body`; every other field (title, id,
duration, description, …) becomes the toast's meta.

```ts
interface ToastItem {
	id: ToastId;
	variant: string;
	title: string;
	content: Renderable;
	/** true while a dismissed toast plays its exit (see `exitMs`). */
	removed: boolean;
	[key: string]: any;
}
```

A toast in `store.items`. Reactive: `update()` changes show up in renderers.

```ts
type Variant = "success" | "error" | "info" | "warning";
```

```ts
interface ToastMeta {
	title?: string;
	/** Reuse this id: a live toast with it is updated instead of a new one added. */
	id?: ToastId;
	/** Per-toast auto-dismiss delay in ms (0 or Infinity = sticky). Default: the controller's timeout. */
	duration?: number;
	/** Any other field (description, action, icon, …) is kept on the item. */
	[key: string]: any;
}
```

```ts
type ToastId = number | string;
```

```ts
interface ToastsOptions {
	bus?: Emitter;
	/** Auto-dismiss delay in ms (0 = sticky). */
	timeout?: number;
	/** Identical-message suppression window in ms (only while the earlier toast is still showing). */
	dedupeWindow?: number;
	/** Keep a dismissed toast (marked `removed`) this long before deleting it (default 0). */
	exitMs?: number;
	/** Extra bus event names to treat as variants (e.g. ["loading"]). */
	variants?: string[];
}
```

```ts
interface ToastsController {
	/** Mount this once near the root: mount(document.body, toasts.component). */
	component: (view: HTMLElement) => void;
	store: { items: ToastItem[] };
	/** Add a toast (or update the live one with `meta.id`); returns its id. */
	push(variant: Variant | string, content: Renderable, meta?: ToastMeta): ToastId;
	/** Merge fields into a toast; a `duration` restarts its countdown. False if gone. */
	update(id: ToastId, patch: Partial<ToastItem> & { duration?: number }): boolean;
	dismiss(id: ToastId): void;
	/** Stop the countdown, keeping the time left (one toast, or all). */
	pause(id?: ToastId): void;
	/** Restart a paused countdown (one toast, or all). */
	resume(id?: ToastId): void;
	success(content: Renderable, meta?: ToastMeta): ToastId;
	error(content: Renderable, meta?: ToastMeta): ToastId;
	info(content: Renderable, meta?: ToastMeta): ToastId;
	warning(content: Renderable, meta?: ToastMeta): ToastId;
}
```


## browser

```js
import { … } from "@nemanjan00/qrp/browser"
```

### `persisted`

```ts
persisted<T extends Record<string, any>>(storageKey: string, defaults?: T): T
```

localStorage-backed reactive state with cross-tab sync.

### `query`

```ts
query(options?: QueryOptions): Record<string, string | string[]>
```

The URL query string as two-way reactive state. String-valued by default;
pass `{ arrays }` to make listed keys multi-value arrays.

### `hashState`

```ts
hashState(): { hash: string }
```

location.hash as reactive state: { hash }. Two-way.

### `media`

```ts
media(mediaQuery: string): { matches: boolean }
```

matchMedia as reactive state: { matches }.

### `viewport`

```ts
viewport(): { width: number; height: number }
```

Reactive window size: { width, height }.

### `online`

```ts
online(): { online: boolean }
```

Reactive connectivity: { online }.

### `visible`

```ts
visible(): { visible: boolean }
```

Reactive tab visibility: { visible }.

### `poll`

```ts
poll(fn: () => void, ms: number, options?: { immediate?: boolean; whenHidden?: boolean }): { start: () => void; stop: () => void }
```

Call `fn` every `ms`, scope-aware: cleared on dispose, and paused while the tab
is hidden (unless `whenHidden`). `immediate` runs it once up front.

### `watch`

```ts
watch(getter: () => unknown, callback: (value: unknown) => void, interval?: number): () => void
```

Poll a getter; fire callback when its value changes. Returns stop().

### `cookies`

```ts
cookies(interval?: number): Record<string, string>
```

document.cookie as reactive, parsed state (polled).

### `seen`

```ts
seen(element: Element, options?: IntersectionObserverInit): { matches: boolean }
```

IntersectionObserver as reactive state: { matches } (on screen).

### `size`

```ts
size(element: Element): { width: number; height: number }
```

ResizeObserver as reactive state: `size(el).width` / `.height` track the
element's content box (starts from its current rect). Disconnects with the
enclosing scope.

#### Supporting types

```ts
interface QueryOptions {
	/**
	 * Keys to treat as multi-value arrays: always arrays (absent → `[]`), parsed
	 * from and serialized to repeated params (`?status=a&status=b`).
	 */
	arrays?: string[];
}
```

Options for {@link query}.


## context

```js
import { … } from "@nemanjan00/qrp/context"
```

Values a subtree provides and its descendants read, found through the DOM —
the qrp take on React context, for compound components (Tabs → its
triggers, a sidebar provider → its parts). `createContext(fallback)` returns
`{ provide, read, watch, find }`. Children are built before their parent, so `read`
is reactive: inside an effect or reactive prop it re-runs when a provider
appears (and once more, on a microtask, for a node still being inserted).
Portaled content resolves through its owner (`setOwner`; `portal` records it).

### `createContext`

```ts
createContext<T>(fallback?: T): Context<T>
```

Create a context; `fallback` is what read() returns with no provider above.

### `setOwner`

```ts
setOwner<N extends Node>(node: N, owner: Node | null): N
```

Give `node` a logical parent for context lookup — for content that lives
elsewhere in the DOM than where it belongs (an overlay portaled to <body>).
`null` clears it. Returns `node`. Readers re-run on a microtask (coalesced),
never synchronously — so calling it mid-update (portal() inside an effect)
can't re-enter that effect.

### `ownerOf`

```ts
ownerOf(node: Node): Node | null
```

The logical owner set with setOwner, if any.

#### Supporting types

```ts
interface Context<T> {
	/** Provide `value` to `node`'s subtree; returns `node` for inline use. */
	provide<N extends Node>(node: N, value: T): N;
	/**
	 * The nearest value provided above `node` (inclusive), or the fallback.
	 * Reactive — read it inside an effect / reactive prop, not just once.
	 */
	read(node: Node): T;
	/**
	 * Run `fn(value, node)` in an effect now and whenever the context changes for
	 * `node`; returns `node`. Use this for reads that bind to the element itself
	 * (a reactive prop can't reference the element `el()` is still building).
	 */
	watch<N extends Node>(node: N, fn: (value: T, node: N) => void): N;
	/** Untracked lookup: the value, whether it was found, and the providing node. */
	find(node: Node): { found: boolean; value: T; provider: Node | null };
}
```

A context created by createContext().


## behaviors

```js
import { … } from "@nemanjan00/qrp/behaviors/<name>"
```

Headless helpers to build styled components (one file each, or the whole set
via the `@nemanjan00/qrp/behaviors` barrel): `portal`, `dismissable`,
`trapFocus`, `anchored`, `disclosure`, `busyWhile`, `embed` (host an
imperative widget — uPlot, canvas, xterm), `stickToBottom` (log/chat
autoscroll that lets go when the user scrolls up). Compose them: a modal is
`portal` + `trapFocus` + `dismissable`; a dropdown is `anchored` +
`dismissable` + `disclosure`. You bring the markup and CSS; they carry the
platform and a11y hard parts. UI built outside a render (a modal from an
onclick) should wrap its build in `scoped()` so its effects are owned.

Each teardown-returning behavior (`portal`, `dismissable`, `trapFocus`,
`anchored`) also registers its undo with the current scope via `onDispose`, so
building them inside `scoped()`/`mount()` means `dispose()` alone tears down
effects AND behaviors — you don't have to collect the undos by hand. The undos
stay returned and are idempotent, so calling one manually is still fine.

### `portal`

```ts
portal(node: Node, target?: Node, options?: PortalOptions): () => void
```

Move `node` into `target` (default document.body); returns an idempotent
dispose(). Also auto-registers teardown with the current scope. Contexts keep
resolving through where the node came from (or `options.owner`).

### `dismissable`

```ts
dismissable(node: Node, onDismiss: (event: Event) => void, options?: DismissableOptions): () => void
```

Call onDismiss on Escape or outside pointerdown; returns an idempotent
dispose(). Also auto-registers teardown with the current scope.

**Nesting-aware:** live dismissables form one stack (newest on top). Escape
dismisses only the topmost layer listening for it; an outside pointerdown
dismisses layers from the top down and stops at the layer it landed in — a
click inside a popover opened from a dialog closes neither, a click in the
dialog closes just the popover. A `modal` layer stops the walk.

**Guarantee:** a layer only reacts to outside clicks from the *next tick* on,
so the same interaction that opened the element (the click on a "…" menu, an
"edit" button spawning an inline editor) never counts as an outside click and
self-dismisses it. Rely on this — no `stopPropagation` needed at the opener.

### `trapFocus`

```ts
trapFocus(node: Element): () => void
```

Trap Tab focus within node, focus its first focusable, restore on dispose.
Returns an idempotent dispose(); also auto-registers teardown with the scope.

### `anchored`

```ts
anchored(trigger: Element | AnchorReference, floating: HTMLElement, options?: AnchoredOptions): AnchoredDispose
```

Position `floating` next to `trigger`; returns an idempotent dispose() (with
.update()). Also auto-registers teardown with the current scope.

Writes `data-side` / `data-align` (the side actually used after flipping) and
the CSS variables `--qrp-transform-origin`, `--qrp-anchor-width`,
`--qrp-anchor-height`, `--qrp-available-width`, `--qrp-available-height`.

```js
anchored(button, menu, { side: "right", align: "start", sideOffset: 8 });
anchored(pointAt(event.clientX, event.clientY), contextMenu);
```

### `pointAt`

```ts
pointAt(x: number, y: number): AnchorReference
```

A virtual reference at a viewport point (anchor a context menu at the cursor).

### `disclosure`

```ts
disclosure(initial?: boolean | [Record<string, any>, string] | (() => boolean), options?: DisclosureOptions): Disclosure
```

Reactive open/close state with optional ARIA wiring. `initial` is a boolean
(uncontrolled), a `[state, "key"]` tuple (two-way bound), or a thunk (driven:
open/close/toggle only report through `onChange`).

```js
const d = disclosure([ui, "filtersOpen"]);   // bound to reactive state
d.connect(button, panel, { hide: false });    // animate off data-state
```

### `busyWhile`

```ts
busyWhile(): BusyWhile
```

Track in-flight promises as reactive busy state (spinners/overlays).

### `embed`

```ts
embed(create: (host: HTMLElement) => Embedded, options?: EmbedOptions): HTMLElement
```

Host an imperative widget (uPlot, a canvas, a map, xterm) in qrp DOM. Returns
the host; `create(host)` runs once the host is connected (so it can measure),
its `resize(width, height)` runs when the host resizes, and `destroy()` (or
the returned teardown) runs when the enclosing scope disposes.

### `stickToBottom`

```ts
stickToBottom(scroller: HTMLElement, options?: StickToBottomOptions): StickToBottom
```

Keep a log/chat/feed scroller at the bottom as content arrives — but only
while the user is at the bottom; scrolling up to read history unpins it.

#### Supporting types

```ts
interface PortalOptions {
	/**
	 * The node contexts should resolve through (see `context`). Defaults to the
	 * node's parent before the move; pass the trigger for detached content.
	 */
	owner?: Node;
}
```

```ts
interface DismissableOptions {
	/** Listen for Escape (default true). */
	escape?: boolean;
	/** Listen for outside pointerdown (default true). */
	outside?: boolean;
	/** More nodes that count as inside — typically the trigger, so clicking it
	 *  toggles instead of dismiss-then-reopen. */
	inside?: Node[];
	/** Outside clicks don't reach (dismiss) layers below this one. */
	modal?: boolean;
}
```

```ts
interface AnchorReference { getBoundingClientRect(): DOMRect | { top: number; bottom: number; left: number; right: number; width: number; height: number }; }
```

Anything with a bounding rect — an Element or a virtual point.

```ts
type Side = "top" | "right" | "bottom" | "left";
```

```ts
type Align = "start" | "center" | "end";
```

```ts
interface AnchoredOptions {
	/** Preferred side (default "bottom"); flips when it doesn't fit. */
	side?: Side;
	/** Alias of `side` (the older name). */
	placement?: Side;
	/** Cross-axis alignment (default "start" — left edges line up). */
	align?: Align;
	/** Gap from the trigger in px (default 4). */
	sideOffset?: number;
	/** Alias of `sideOffset` (the older name). */
	gap?: number;
	/** Cross-axis nudge in px (default 0). */
	alignOffset?: number;
	/** px kept clear of the viewport edge when flipping/shifting (default 0). */
	collisionPadding?: number;
	/** Flip to the opposite side and shift along the cross axis to stay on screen (default true). */
	avoidCollisions?: boolean;
	/** Size the floating element to the trigger's width (dropdown-spans-input). */
	matchWidth?: boolean;
}
```

```ts
interface AnchoredDispose { (): void; update(): void; }
```

```ts
interface DisclosureConnectOptions {
	/** Toggle `panel.hidden` (default true). Pass false to animate the panel
	 *  yourself off its `data-state` ("open" | "closed"). */
	hide?: boolean;
	/** Ignore trigger clicks while true; a thunk is read on each click. */
	disabled?: boolean | (() => boolean);
}
```

```ts
interface DisclosureOptions {
	/** Called with the new (or, in driven mode, requested) open value on every change. */
	onChange?: (open: boolean) => void;
}
```

```ts
interface Disclosure {
	/** Reactive and writable in every mode. */
	state: { open: boolean };
	toggle(): void;
	open(): void;
	close(): void;
	/** Wire trigger + panel: aria-expanded, aria-controls (assigns panel.id if
	 *  missing), data-state on both, `hidden` (unless `hide: false`), click toggles. */
	connect(trigger: Element, panel: HTMLElement, options?: DisclosureConnectOptions): void;
}
```

```ts
interface BusyWhile {
	state: { pending: number };
	run<T>(promise: Promise<T>): Promise<T>;
	readonly active: boolean;
}
```

```ts
type Embedded = { resize?(width: number, height: number): void; destroy?(): void } | (() => void) | void | null | undefined;
```

What `create` may return: an instance with optional hooks, a teardown, or nothing.

```ts
interface EmbedOptions {
	/** Host tag (default "div"). */
	tag?: string;
	/** el() props for the host element. */
	props?: Props;
}
```

```ts
interface StickToBottomOptions {
	/** Pixels from the bottom that still count as "at the bottom" (default 24). */
	threshold?: number;
}
```

```ts
interface StickToBottom {
	/** Reactive: true while the view follows new content. */
	pinned: { value: boolean };
	/** Scroll to the newest content and pin again. */
	scrollToBottom(): void;
	/** Stop following (idempotent; also runs when the enclosing scope disposes). */
	dispose(): void;
}
```


## utils

```js
import { … } from "@nemanjan00/qrp/utils/<name>"
```

Pure data helpers a dashboard needs (one file each, or the whole set via the
`@nemanjan00/qrp/utils` barrel): `memoize` (with `ttl`/`invalidate`), `lru`,
`cacheForever`/`precache`/`precacheWithRefresh`, `paginate`/`pageCount`,
`limit` (concurrency + rate + timeout), `debounce`/`throttle` (scope-aware),
`validate` (schema checker), and `loadScript` (reactive UMD loader).

### `lru`

```ts
lru<K = any, V = any>(max: number): LruStore<K, V>
```

A bounded key/value store with least-recently-used eviction.

### `memoize`

```ts
memoize<F extends (...args: any[]) => any>(fn: F, options?: MemoizeOptions): Memoized<F>
```

Memoize a sync/async function by its args (async calls deduped in flight).

### `cacheForever`

```ts
cacheForever<T>(method: () => T): () => T
```

Run a zero-arg function at most once; later calls return the first result.

### `precache`

```ts
precache<T>(method: () => Promise<T>): () => Promise<T>
```

Start an async producer immediately; returns a getter for its promise.

### `precacheWithRefresh`

```ts
precacheWithRefresh<T>(method: () => Promise<T>, refreshTime?: number, callback?: (promise: Promise<T>) => void): RefreshingGetter<T>
```

Keep an async producer's result fresh on an interval.

### `paginate`

```ts
paginate<T>(array: readonly T[], index: number, size: number): T[]
```

Return the slice of `array` for a zero-based page (size 0 = a copy of all).

### `pageCount`

```ts
pageCount(total: number, size: number): number
```

Number of pages for `total` items at `size` per page.

### `limit`

```ts
limit<A extends any[], R>(fn: (...args: A) => R | Promise<R>, options?: number | LimitOptions): (...args: A) => Promise<R>
```

Rate-limit an async function: cap concurrency, throughput, and per-call time.
Pass a number for concurrency-only, or an options object for all three.
Excess calls queue FIFO; each call returns a Promise.

### `debounce`

```ts
debounce<A extends any[]>(fn: (...args: A) => any, ms?: number): RateLimited<A>
```

Delay fn until `ms` after the last call. Scope-aware: auto-cancels on dispose.

### `throttle`

```ts
throttle<A extends any[]>(fn: (...args: A) => any, ms?: number): RateLimited<A>
```

Call fn at most once per `ms` (leading + trailing). Scope-aware: auto-cancels on dispose.

### `loadScript`

```ts
loadScript(url: string, attrs?: Record<string, string>): ScriptStatus
```

Inject a UMD/global <script> once (deduped by URL); returns reactive load state.

### `validate`

```ts
validate(schema: Schema, data: any, options?: ValidateOptions): ValidationResult
```

Validate + coerce data against a schema. `errors` is [] when valid; `value` is
a coerced copy (form strings become their declared type — "5"→5, "true"→true)
ready to send as the patch. `value` carries ALL keys of `data` — declared ones
coerced, undeclared ones passed through untouched — so it is never a partial
payload. A present-but-empty `""` is validated (so a
pattern/check can reject empty on an optional field); an absent (undefined/null)
optional field is skipped. Pass `{ strict: true }` to reject unknown keys.

#### Supporting types

```ts
interface LruStore<K = any, V = any> {
	has(key: K): boolean;
	get(key: K): V | undefined;
	set(key: K, value: V): void;
	delete(key: K): boolean;
	clear(): void;
	readonly size: number;
}
```

```ts
type Memoized<F extends (...args: any[]) => any> = F & {
	/** Clear one entry (by the same args) or the whole cache (no args). */
	invalidate(...args: Parameters<F>): void;
};
```

A memoized function with imperative cache invalidation.

```ts
interface MemoizeOptions {
	/** args => cache key (default JSON.stringify). */
	key?: (args: any[]) => unknown;
	/** LRU bound (omit for unbounded; 0 = retain nothing). */
	max?: number;
	/** ms an entry stays fresh; for a promise the clock starts when it resolves. */
	ttl?: number;
	/** Custom { has, get, set, delete?, clear? } store. */
	store?: Partial<LruStore> & { has(k: any): boolean; get(k: any): any; set(k: any, v: any): void };
}
```

```ts
interface RefreshingGetter<T> {
	(): Promise<T>;
	refresh(): Promise<T>;
	stop(): void;
}
```

```ts
interface LimitOptions {
	/** Max concurrent in-flight calls (default 1). */
	max?: number;
	/** Max calls STARTED per second (default: unlimited). */
	perSecond?: number;
	/** Per-call timeout in ms; rejects with Error("timeout") (default: none). */
	timeout?: number;
}
```

```ts
interface RateLimited<A extends any[]> {
	(...args: A): void;
	/** Drop any pending trailing call. */
	cancel(): void;
}
```

A rate-limited wrapper with an imperative cancel for its pending timer.

```ts
interface ScriptStatus {
	ready: boolean;
	error: unknown;
	/** Resolves when the script loads (non-enumerable; not a reactive key). */
	readonly promise: Promise<void>;
}
```

Reactive load state for a lazily-injected script.

```ts
interface Rule {
	required?: boolean;
	type?: "string" | "number" | "boolean" | "object" | "array" | "null";
	enum?: any[];
	/** Number: value bound. String/array: length bound. */
	min?: number;
	max?: number;
	pattern?: RegExp;
	/** Return true/undefined for ok, or a string message for an error. */
	check?: (value: any) => true | string | undefined | void;
	/** Nested schema for object fields. */
	fields?: Schema;
	/** Override message for any failure on this field. */
	message?: string;
}
```

```ts
type Schema = Record<string, Rule>;
```

```ts
interface ValidationError { path: string; message: string; }
```

```ts
interface ValidationResult { errors: ValidationError[]; value: any; }
```

```ts
interface ValidateOptions {
	/** Reject keys not declared in the schema (recursively). Default false. */
	strict?: boolean;
}
```


## proto

```js
import { … } from "@nemanjan00/qrp/proto"
```

Prototype-level enhancement of native objects — find a prototype by name,
wrap a method idempotently, run-once, and one-listener event delegation.

### `findProto`

```ts
findProto(obj: object, protoName: string): object | undefined
```

Walk obj's prototype chain; return the prototype named protoName, or undefined.

### `wrapMethod`

```ts
wrapMethod<T extends object>(proto: T, method: keyof T | string, make: (original: any) => any, tag?: string): () => void
```

Replace proto[method] with make(original), idempotently. Returns restore().

### `onceOnly`

```ts
onceOnly<F extends (...args: any[]) => any>(fn: F): (...args: Parameters<F>) => ReturnType<F> | undefined
```

Wrap a fn so it runs at most once.

### `delegate`

```ts
delegate(root: Element | Document, selector: string, handler: (event: Event, match: Element) => void, type?: string): () => void
```

One-listener event delegation by CSS selector. Returns dispose().

---

## TypeScript

Declarations ship as `*.d.ts` next to each module, so importing `./qrp/index.js`
resolves types automatically — no `@types` package, no build step. Generics flow
through (`state<T>`, `list<T>`, `collection<T>`, `table<T>`). `npm run typecheck`
runs `tsc --noEmit` over the declarations and a usage suite in strict mode.
