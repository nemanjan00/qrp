# qrp — API reference

Every module is an independent ESM file; import only what you use. TypeScript
declarations ship next to each module (`*.d.ts`), so editors give you types and
autocomplete with no build step — see [TypeScript](#typescript) at the end.

- [`qrp` — core](#qrp--core)
- [`html` — HTML templates](#html--html-templates)
- [`forms`](#forms)
- [`collection`](#collection)
- [`table`](#table)
- [`http`](#http)
- [`events`](#events)
- [`toasts`](#toasts)
- [`browser`](#browser)
- [`behaviors`](#behaviors)
- [`utils`](#utils)
- [`proto`](#proto)

---

## `qrp` — core

`import { … } from "./qrp/index.js"`

### Reactivity

| Export | Signature | Notes |
|---|---|---|
| `state` | `state<T>(obj: T): T` | Reactive `Proxy`. Reads inside `effect` track per key; writes re-run only dependent effects. Primitives, **frozen** objects, DOM nodes, `Map`/`Set`, class instances are returned as-is. |
| `effect` | `effect(fn): EffectHandle` | Runs `fn` now, re-runs on change. `.dispose()` stops it. Owned by the enclosing scope/effect. |
| `derive` | `derive<T>(fn: () => T): { value: T }` | Read-only reactive computed. |
| `untracked` | `untracked<T>(fn: () => T): T` | Read state without creating a dependency. |
| `raw` | `raw<T>(obj: T): T` | Unwrap a proxy to its raw object. |
| `onDispose` | `onDispose(fn): void` | Register cleanup for the current effect/scope teardown. |
| `scope` | `scope(fn): { dispose() }` | Ownership scope; `dispose()` kills its effects. |

```js
const s = state({ first: "Ada", last: "Lovelace" });
const full = derive(() => `${s.first} ${s.last}`);
effect(() => console.log(full.value));   // logs now, and on change
s.first = "Grace";                        // → "Grace Lovelace"
```

### DOM

| Export | Signature | Notes |
|---|---|---|
| `el` | `el(tag, props?, ...children): HTMLElement` | Real element. Function props/children are reactive; `on*` add listeners; `bind: [state, key]` two-way. |
| `reactive` | `reactive<T extends Node>(node: T): T` | Proxy a node so `node.prop = () => …` becomes a reactive binding. |
| `bind` | `bind(node, state, key): Node` | Two-way binding for a form control. |
| `clear` | `clear(node): void` | Empty a node (`replaceChildren()`). |

```js
el("button", { class: () => (on.value ? "on" : ""), onclick: () => on.value = !on.value },
  () => `toggled ${on.value}`);
```

### Keyed lists

`list(source, keyFn, render): ListMarker` — one element per item identity, cached
and reused/reordered on change (never rebuilt). Pass as an `el` child. The marker
exposes `itemFor(elementOrEvent)` → the item that produced a node (leak-free via
`WeakMap`) for one-listener event delegation.

```js
el("tbody", {}, list(
  () => view.items(),          // reactive, ordered source
  (row) => row.id,             // stable key
  (row) => el("tr", {}, () => row.name)
));
```

### Conditionals

`when(cond, thenFn, elseFn?): WhenMarker` — render one of two subtrees on a
reactive condition, disposing the old branch (effects + DOM) on flip. The truthy
value is passed to the branch.

```js
el("div", {}, when(
  () => editing.on,
  () => el("input", { bind: [row, "name"] }),
  () => el("span", {}, () => row.name)
));
```

### Components

| Export | Signature | Notes |
|---|---|---|
| `mount` | `mount(parent, component): { dispose() }` | Mount `(parent) => void` into `parent`. `dispose()` tears down effects **and** clears the DOM. |
| `define` | `define(name, setup, options?): CustomElementConstructor` | Register a real Custom Element (no `class`). `setup(host, attrs)`; `options.attrs` are observed and reactive. |

### Routing

| Export | Signature | Notes |
|---|---|---|
| `router` | `router(routes, outlet, options?): { navigate, render, dispose }` | Matches `location.pathname` against patterns → `component(outlet, ctx)`; intercepts same-origin links; disposes the previous route's scope on nav. |
| `navigate` | `navigate(url, { replace? }?): void` | Programmatic navigation. |
| `compilePath` | `compilePath(pattern): { keys, regexp }` | Compile `/user/:id`, `/files/:path*`, `*`. |
| `matchPath` | `matchPath(compiled, path): Record<string,string> \| null` | Extract params. |

`ctx` is `{ params, query, path }`. `options`: `{ notFound?, transitions?, linksRoot? }`.

---

## `html` — HTML templates

`import { html, ref } from "./html/index.js"`

| Export | Signature | Notes |
|---|---|---|
| `` html`` `` / `html(str)` | `(strings, ...values) \| (markup) => Node \| DocumentFragment` | Inline (`${}`) or plain string. Text holes escaped; `${() => …}` reactive; `onX=${fn}` listener. |
| `html.template` | `html.template(source): (data) => Node` | **Storable** `#{field}` template — parsed once, filled from a data object, reactive with state, dotted paths, escaped. |
| `ref` | `ref(value): string` | Opt-in token to embed a live node/binding into a **plain** concatenated string. |

**Escaping:** text holes are rendered as text (never touch `innerHTML` — can't
inject elements/scripts). Attribute values are set verbatim (no breakout) **but
URL schemes are not sanitized** — don't put untrusted data in `href`/`src`.
Attack vectors live in `test/html-xss.test.js`.

---

## `forms`

`import { form, field, registerInput, inputs, parseKV, serializeKV } from "./forms/index.js"`

| Export | Signature |
|---|---|
| `form` | `form({ settings, fields?, sections? }): HTMLElement` |
| `field` | `field(settings, key, spec?): HTMLElement` |
| `registerInput` | `registerInput(type, factory): InputFactory` |
| `getInput` | `getInput(type): InputFactory \| undefined` |
| `inputs` | registry addressable by type name (`inputs.text`, …) + `multichoice` |
| `multichoice` | `multichoice(options): InputFactory` |
| `textual` | `textual(settings): HTMLTextAreaElement` |
| `parseKV` / `serializeKV` | `(text) => obj` / `(obj) => text` |

A `FieldSpec` is `{ name?, description?, type?, input?, default?, options?, …attrs }`.
Built-in types: every native `<input>` variant plus `textarea`, `select`, `radio`.

```js
registerInput("callsign", (settings, key, field) => {
  const input = inputs.text(settings, key, field);
  input.addEventListener("input", () => settings[key] = input.value.toUpperCase());
  return input;
});
form({ settings, fields: { CALL: { name: "Callsign", type: "callsign" } } });
```

---

## `collection`

`import { collection } from "./collection/index.js"`

`collection(source, options?): Collection` — reactive sort/filter/paginate.

- `options`: `{ sort?, page?, filter?, filterFn?, compare? }`
- returns `{ sort, filter, page, items(), total(), pageCount(), toggleSort(key) }`
- `items()` is reactive — feed it to `list()`.

---

## `table`

`import { table } from "./table/index.js"`

`table(options): HTMLTableElement & { view: Collection }` — declarative data table
over `collection` + `list`.

- `options`: `{ rows, fields, key?, sort?, page?, filter?, filterFn?, rowClass?, class? }`
- Column: `{ key, label?, accessor?, formatter?, render?, sortable?, sortByFormatted?, thClass?, tdClass? }`
- `.view` is the underlying collection (for pagination UI).

```js
const t = table({
  rows: () => store.rows, key: (r) => r.id, filter, page,
  fields: [
    { key: "name", label: "Name", sortable: true },
    { key: "signups", label: "Signups", sortable: true, formatter: (v) => v.toLocaleString() },
    { key: "actions", label: "", render: (r) => el("button", { onclick: () => open(r) }, "View") }
  ]
});
t.view.pageCount();
```

---

## `http`

`import { createHttp } from "./http/index.js"`

`createHttp(options?): HttpClient`

- `options`: `{ baseUrl?, token?, client?, headers?, bus? }`
- client: `loading` (reactive `{ pending }`), `request`, `get`, `delete`, `head`, `post`, `put`, `patch`
- request `config`: `{ params?, body?, headers?, signal?, init? }`
- **Errors reject with `{ status, data, response }`** and emit `error` on the bus; a 401 (or `Unauthorized` body) also emits `auth:unauthorized`. Nullish params are skipped; arrays repeat the key; `FormData`/`Blob`/etc. pass through; plain objects are JSON-encoded.

```js
const http = createHttp({ baseUrl: "/api", token: () => session.token });
effect(() => bar.hidden = http.loading.pending === 0);   // spinner in one line
http.get("/things", { params: { page: 2, ids: [1, 2, 3] } });
```

---

## `events`

`import { bus, emitter, fromEvent, channel, broadcast } from "./events/index.js"`

| Export | Signature |
|---|---|
| `emitter` | `emitter(): Emitter` |
| `bus` | the global `Emitter` |
| `fromEvent` | `fromEvent(source, type, map?, initial?): { value }` |
| `channel` | `channel(name): Channel` (cross-tab via BroadcastChannel) |
| `broadcast` | `broadcast(emitter, type, store, key?)` |

`Emitter`: `on(type, handler) → off`, `off`, `once(type) → Promise`, `emit(type, detail)`,
`request(type, payload, { timeout? }) → Promise`, `respond(type, handler) → off`.

---

## `toasts`

`import { notify, toasts, createToasts } from "./toasts/index.js"`

- `notify.success|error|info|warning(content)` — fire through the global bus; content is any renderable.
- `toasts` — the mountable singleton: `mount(document.body, toasts.component)`.
- `createToasts({ bus?, timeout?, dedupeWindow? })` — a scoped controller with `push`, `dismiss`, and per-variant helpers.

---

## `browser`

`import { persisted, query, media, viewport, online, visible, cookies, seen, hashState, watch } from "./browser/index.js"`

All return reactive state and self-clean via `onDispose`:

| Export | Returns |
|---|---|
| `persisted(key, defaults?)` | state persisted to localStorage, synced across tabs |
| `query()` | the URL query as two-way state |
| `hashState()` | `{ hash }` two-way |
| `media(q)` | `{ matches }` |
| `viewport()` | `{ width, height }` |
| `online()` | `{ online }` |
| `visible()` | `{ visible }` |
| `cookies(interval?)` | parsed `document.cookie` (polled) |
| `seen(el, options?)` | `{ matches }` (IntersectionObserver) |
| `watch(getter, cb, interval?)` | `stop()` — poll a value that has no event |

---

## `behaviors`

`import { portal } from "./behaviors/portal.js"` (one file each)

| Export | Signature |
|---|---|
| `portal(node, target?)` | `() => void` (dispose) |
| `dismissable(node, onDismiss, { escape?, outside? }?)` | `() => void` |
| `trapFocus(node)` | `() => void` (restores focus on dispose) |
| `anchored(trigger, floating, { placement?, gap? }?)` | dispose with `.update()` |
| `disclosure(initial?)` | `{ state, toggle, open, close, connect }` |
| `busyWhile()` | `{ state, run(promise), active }` |

Compose them: a modal is `portal` + `trapFocus` + `dismissable`; a dropdown is
`anchored` + `dismissable` + `disclosure`.

---

## `utils`

`import { memoize } from "./utils/memoize.js"` (one file each)

| Export | Signature |
|---|---|
| `memoize(fn, { key?, max?, store? }?)` | same-shape fn; async calls deduped in flight |
| `lru(max)` | `{ has, get, set, delete, size }` |
| `cacheForever(method)` | run once, cache result |
| `precache(method)` | start eagerly, return a getter |
| `precacheWithRefresh(method, refreshTime?, callback?)` | getter with `.refresh()`, `.stop()` |
| `paginate(array, index, size)` / `pageCount(total, size)` | pure paging math |

---

## `proto`

`import { findProto, wrapMethod, onceOnly, delegate } from "./proto/index.js"`

| Export | Signature |
|---|---|
| `findProto(obj, name)` | walk the prototype chain by constructor name |
| `wrapMethod(proto, method, make, tag?)` | idempotent method wrap; returns `restore()` |
| `onceOnly(fn)` | run at most once |
| `delegate(root, selector, handler, type?)` | one-listener event delegation |

---

## TypeScript

Declarations ship as `*.d.ts` next to each module, so importing `./qrp/index.js`
resolves types automatically — no `@types` package, no build step:

```ts
import { state, el, list } from "./qrp/index.js";

interface User { id: number; name: string; }
const users = state<{ rows: User[] }>({ rows: [] });
el("ul", {}, list(() => users.rows, (u) => u.id, (u) => el("li", {}, () => u.name)));
```

`npm run typecheck` runs `tsc --noEmit` over the declarations and a usage suite
(`test/types.ts`) in strict mode.
