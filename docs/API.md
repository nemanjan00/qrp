# qrp — API reference

> **Generated from the TypeScript declarations (`*.d.ts`) — do not edit by hand.**
> Run `npm run docs` to regenerate. The `.d.ts` are the single source of API
> truth (rich types, verified by `npm run typecheck` against a usage suite),
> and `api.html` renders this file live.

Every module is an independent ESM file — import only what you use. Types ship
next to each module, so editors resolve them with no build step.

- [qrp — core](#qrp-core)
- [html — HTML templates](#html-html-templates)
- [forms](#forms)
- [collection](#collection)
- [table](#table)
- [http](#http)
- [events](#events)
- [toasts](#toasts)
- [browser](#browser)
- [behaviors](#behaviors)
- [utils](#utils)
- [proto](#proto)

---

## qrp — core

```js
import { … } from "@nemanjan00/qrp"
```

Core: reactivity (`state`/`effect`/`derive`), DOM (`el`/`reactive`/`bind`),
keyed lists (`list`), conditionals (`when`), components (`mount`/`scope`),
custom elements (`define`), and HTML5 routing. `import … from "@nemanjan00/qrp"`.

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
effect(fn: () => void, options?: { name?: string }): EffectHandle
```

Run fn now and re-run it whenever any state key it read changes. Effects
created inside a component/scope are owned by it and disposed with it.

Edge cases: writing `NaN` over `NaN` does not re-trigger (uses `Object.is`).
An effect that reads and writes the *same* key runs once and settles (the
trigger skips the currently-running effect) — it does not self-loop. An
effect that **throws** is torn down (unsubscribed) and the error propagates
to the caller (the write site, or `effect()` on first run); the rest of the
system is unaffected. Two effects that write *each other's* keys will recurse
synchronously with no depth guard — don't do that.

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
reporting; without it a throwing binding is only observable at the write site.
Returns an unsubscribe function.

```js
onEffectError((error, { phase, name }) => Sentry.captureException(error, { tags: { phase, name } }));
```

### `untracked`

```ts
untracked<T>(fn: () => T): T
```

Read state inside fn WITHOUT tracking it as a dependency.

### `derive`

```ts
derive<T>(fn: () => T): Derived<T>
```

A read-only reactive value derived from other state.

```js
const full = derive(() => `${s.first} ${s.last}`);
el("span", {}, () => full.value);
```

### `onDispose`

```ts
onDispose(fn: () => void): void
```

Register a cleanup to run when the current effect/scope disposes.

### `scope`

```ts
scope(fn: () => void): Scope
```

Run fn inside a fresh ownership scope; `dispose()` kills every effect created
during it. `mount()` wraps this and also clears the DOM — reach for `scope()`
directly only when you're managing effects **without** a DOM subtree to clear
(e.g. a bundle of subscriptions you want to tear down together).

### `scoped`

```ts
scoped<T>(fn: () => T): { value: T
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
  number/checkbox coercion): `el("input", { bind: [settings, "name"] })`.
- **`class` / `style`** → `class` takes a string or function; `style` takes a
  string or an object (`{ color: "red" }`), each static or reactive.
- Properties like **`value` / `checked`** are set as node *properties* (not
  attributes), so `checked: () => todo.done` works as expected.

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
list<T>(source: () => readonly T[], keyFn: (item: T, index: number) => unknown, render: (item: T, index: number) => Renderable): ListMarker<T>
```

A keyed list with element reuse: one element per item identity, reused and
reordered on change (never rebuilt). Pass as an el() child.

`source` is a **thunk that returns the current array** — read reactive state
inside it so the list re-runs when the data changes. For a plain reactive
array that's `() => store.rows`; when the data comes from a `collection`,
`items()` is a method, so it's `() => view.items()`. Both are the same
contract (a function returning an array); `collection.items` just happens to
be callable rather than a property.

`keyFn` must return a **unique** key per item. Duplicate keys are dropped with
a `console.warn` (two items can't share one element). If `render` throws, the
error propagates out of the reconcile (like any effect that throws).

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

### `define`

```ts
define(name: string, setup: (host: HTMLElement & { attrs: Record<string, string | null> }, attrs: Record<string, string | null>) => void, options?: DefineOptions): CustomElementConstructor
```

Register a Custom Element built with objects and __proto__ (no class).
`setup(host, attrs)` builds its content; observed attrs arrive as reactive
state. Effects created in setup are scoped to the element.

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
type Renderable =
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
```

Anything qrp can render as an el()/html child. Functions are reactive;
 list()/when() markers are valid children too.

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
	/** "create" = the effect's first run; "update" = a reactive re-run. */
	phase: "create" | "update";
	/** The name from `effect(fn, { name })`, if any. */
	name?: string;
}
```

Context passed to an onEffectError handler.

```ts
interface ListMarker<T> {
	readonly __qrpList: true;
	/** Map an element (or an event) back to the item that produced it. */
	itemFor(target: Element | Event | EventTarget | null): T | undefined;
}
```

A keyed list() marker — pass as an el() child.

```ts
interface WhenMarker {
	readonly __qrpWhen: true;
}
```

A when() marker — pass as an el() child.

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
interface DefineOptions {
	/** Attribute names to observe and expose as reactive `attrs` state. */
	attrs?: string[];
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
returns `{ sort, filter, page, items(), total(), pageCount(), toggleSort() }`;
`items()` is reactive — feed it to `list()`. `options`:
`{ sort?, page?, filter?, filterFn?, compare? }`.

### `collection`

```ts
collection<T>(source: () => readonly T[], options?: CollectionOptions<T>): Collection<T>
```

Reactive sort / filter / paginate over a dataset.

#### Supporting types

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
	sort?: SortState;
	page?: PageState;
	filter?: Record<string, any>;
	filterFn?: (item: T, filter: Record<string, any>) => boolean;
	compare?: (a: T, b: T, sort: SortState) => number;
}
```

```ts
interface Collection<T> {
	sort: SortState;
	filter: Record<string, any>;
	page: PageState;
	/** Reactive: sorted → filtered → paged items. Feed to list(). */
	items(): T[];
	/** Count after filtering (before paging). */
	total(): number;
	/** Number of pages at the current size. */
	pageCount(): number;
	/** Toggle sort direction on the same key, else sort by it ascending. */
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
plus `.expanded`/`.toggleRow`.

### `table`

```ts
table<T>(options: TableOptions<T>): TableElement<T>
```

Build a declarative, sortable, keyed, paginated data table.

### `tablePager`

```ts
tablePager(view: Collection<any>, options?: { window?: number }): HTMLElement
```

A stock prev / windowed-pages / next control for a table().view (or any collection).

### `tableSummary`

```ts
tableSummary(view: Collection<any>, options?: { label?: (from: number, to: number, total: number) => string; }): HTMLElement
```

A reactive "Showing X–Y of Z" summary for a table().view (or any collection).

#### Supporting types

```ts
interface Column<T> {
	/** Unique id and default value path (item[key]). */
	key: string;
	label?: string;
	/** item => raw value (default item[key]); supports nesting. */
	accessor?: (item: T) => unknown;
	/** (rawValue, item) => display text. */
	formatter?: (value: any, item: T) => Renderable;
	/** item => Element — a custom cell (overrides formatter). */
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
type TableElement<T> = HTMLTableElement & {
	view: Collection<T>;
	/** Reactive per-key open flags for expandable rows (`expanded[key]`). */
	expanded: Record<string, boolean>;
	/** Toggle a row's detail panel by its key. */
	toggleRow: (key: unknown) => void;
```

The table element: `.view` (the collection), plus expansion controls.

```ts
interface TableOptions<T> {
	rows: (() => readonly T[]) | readonly T[];
	/** Columns — an array, or a thunk `() => Column[]` for a reactive set
	 *  (column visibility toggle, role-gated columns; rows re-render, elements reused). */
	fields: Column<T>[] | (() => Column<T>[]);
	/** Enable expandable rows: item => the detail panel shown below the row.
	 *  A row click toggles it (interactive cells excluded); also `.toggleRow(key)`. */
	expandable?: (item: T) => Renderable;
	/** item => stable key (the :key equivalent; default item.id). */
	key?: (item: T) => unknown;
	sort?: SortState;
	page?: PageState;
	filter?: Record<string, any>;
	filterFn?: (item: T, filter: Record<string, any>) => boolean;
	rowClass?: (item: T) => string;
	/** Extra class(es) for the <table>. */
	class?: string;
	sortField?: string;
	sortDesc?: boolean;
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
	baseUrl?: string;
	/** () => bearer token, attached as Authorization. */
	token?: () => string | null | undefined;
	/** () => value for the x-authorization-client header. */
	client?: () => string | null | undefined;
	/** Headers merged into every request. */
	headers?: Record<string, string>;
	/** Emitter for loader/error/auth events (default the global bus). */
	bus?: Emitter;
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
	emit(type: string, detail?: any): unknown;
	close(): void;
}
```


## toasts

```js
import { … } from "@nemanjan00/qrp/toasts"
```

Notifications driven by the global bus — any code raises one without importing
the UI. `notify.success|error|info|warning(content)` where content is any
renderable. Mount the singleton once: `mount(document.body, toasts.component)`.

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
notify: { success(content: Renderable): void; error(content: Renderable): void; info(content: Renderable): void; warning(content: Renderable): void; }
```

Fire-and-forget notifications through the global bus. Content is renderable.

#### Supporting types

```ts
type Variant = "success" | "error" | "info" | "warning";
```

```ts
interface ToastMeta {
	title?: string;
}
```

```ts
interface ToastsOptions {
	bus?: Emitter;
	/** Auto-dismiss delay in ms (0 = sticky). */
	timeout?: number;
	/** Identical-message suppression window in ms. */
	dedupeWindow?: number;
}
```

```ts
interface ToastsController {
	/** Mount this once near the root: mount(document.body, toasts.component). */
	component: (view: HTMLElement) => void;
	store: { items: any[] };
	push(variant: Variant | string, content: Renderable, meta?: ToastMeta): void;
	dismiss(id: number): void;
	success(content: Renderable, meta?: ToastMeta): void;
	error(content: Renderable, meta?: ToastMeta): void;
	info(content: Renderable, meta?: ToastMeta): void;
	warning(content: Renderable, meta?: ToastMeta): void;
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
query(): Record<string, string>
```

The URL query string as two-way reactive state.

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


## behaviors

```js
import { … } from "@nemanjan00/qrp/behaviors/<name>"
```

Headless helpers to build styled components (one file each, or the whole set
via the `@nemanjan00/qrp/behaviors` barrel): `portal`, `dismissable`,
`trapFocus`, `anchored`, `disclosure`, `busyWhile`. Compose them: a modal is
`portal` + `trapFocus` + `dismissable`; a dropdown is `anchored` +
`dismissable` + `disclosure`. You bring the markup and CSS; they carry the
platform and a11y hard parts. UI built outside a render (a modal from an
onclick) should wrap its build in `scoped()` so its effects are owned.

### `portal`

```ts
portal(node: Node, target?: Node): () => void
```

Move `node` into `target` (default document.body); returns dispose().

### `dismissable`

```ts
dismissable(node: Node, onDismiss: (event: Event) => void, options?: DismissableOptions): () => void
```

Call onDismiss on Escape or outside pointerdown; returns dispose().

### `trapFocus`

```ts
trapFocus(node: Element): () => void
```

Trap Tab focus within node, focus its first focusable, restore on dispose.

### `anchored`

```ts
anchored(trigger: Element, floating: HTMLElement, options?: AnchoredOptions): AnchoredDispose
```

Position `floating` next to `trigger`; returns dispose() (with .update()).

### `disclosure`

```ts
disclosure(initial?: boolean): Disclosure
```

Reactive open/close state with optional ARIA wiring.

### `busyWhile`

```ts
busyWhile(): BusyWhile
```

Track in-flight promises as reactive busy state (spinners/overlays).

#### Supporting types

```ts
interface DismissableOptions { escape?: boolean; outside?: boolean; }
```

```ts
interface AnchoredOptions {
	placement?: "bottom" | "top";
	gap?: number;
	/** Size the floating element to the trigger's width (dropdown-spans-input). */
	matchWidth?: boolean;
}
```

```ts
interface AnchoredDispose { (): void; update(): void; }
```

```ts
interface Disclosure {
	state: { open: boolean };
	toggle(): void;
	open(): void;
	close(): void;
	connect(trigger: Element, panel: HTMLElement): void;
}
```

```ts
interface BusyWhile {
	state: { pending: number };
	run<T>(promise: Promise<T>): Promise<T>;
	readonly active: boolean;
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
ready to send as the patch. A present-but-empty `""` is validated (so a
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
