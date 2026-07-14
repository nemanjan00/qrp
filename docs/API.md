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
effect(fn: () => void): EffectHandle
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

Conditionally render one of two subtrees, swapping on a reactive condition
and disposing the old branch (effects + DOM) when it flips.

### `mount`

```ts
mount(parent: HTMLElement, component: (parent: HTMLElement) => void): Mounted
```

Mount a component into a parent; returns a disposable.

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

### `router`

```ts
router(routes: Record<string, (outlet: HTMLElement, ctx: RouteContext) => void>, outlet: HTMLElement, options?: RouterOptions): RouterHandle
```

HTML5 History router: path patterns → components.

**Supporting types:** `Renderable`, `Bind`, `Props`, `EffectHandle`, `Scope`, `Mounted`, `Derived`, `ListMarker`, `WhenMarker`, `Component`, `RouteContext`.


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

**Supporting types:** `InputFactory`, `FieldSpec`.


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


## table

```js
import { … } from "@nemanjan00/qrp/table"
```

A declarative data table over `collection` + `list`: sortable headers, keyed
row reuse, per-column config. A column is `{ key, label?, accessor?, formatter?,
render?, sortable?, sortByFormatted?, thClass?, tdClass? }`. The returned table
has `.view` (the underlying collection) for pagination UI.

### `table`

```ts
table<T>(options: TableOptions<T>): TableElement<T>
```

Build a declarative, sortable, keyed, paginated data table.

**Supporting types:** `Column`, `TableElement`.


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

**Supporting types:** `HttpError`.


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

Headless helpers to build styled components (one file each). Compose them: a
modal is `portal` + `trapFocus` + `dismissable`; a dropdown is `anchored` +
`dismissable` + `disclosure`. You bring the markup and CSS; they carry the
platform and a11y hard parts.

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


## utils

```js
import { … } from "@nemanjan00/qrp/utils/<name>"
```

Pure data helpers a dashboard needs (one file each): `memoize`, `lru`,
`cacheForever`/`precache`/`precacheWithRefresh`, `paginate`/`pageCount`.

### `lru`

```ts
lru<K = any, V = any>(max: number): LruStore<K, V>
```

A bounded key/value store with least-recently-used eviction.

### `memoize`

```ts
memoize<F extends (...args: any[]) => any>(fn: F, options?: MemoizeOptions): F
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
