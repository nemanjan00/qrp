# Sharp edges

qrp is small and uses the platform directly, which means a handful of behaviors
follow from how the DOM and `Proxy` actually work rather than from a framework
abstraction hiding them. None are bugs; all are things worth knowing once. Most
of the traps an early production port hit have since been *fixed* — this page is
the current, honest list.

## Reactivity

**A raw array/object mutated *after* you assign it to state bypasses the proxy.**
`state`'s reactivity lives on the proxy, not the raw object you handed in.

```js
const s = state({ rows: [] });
const fresh = await fetch(...);
s.rows = fresh;            // reactive from here on — through s.rows
fresh[0].done = true;      // ✗ mutates the RAW array — no update
s.rows[0].done = true;     // ✓ read back through the proxy
```

**`state()` only wraps plain objects and arrays.** DOM nodes, `Map`/`Set`, and
class instances are stored and returned as-is (wrapping would detach their
branded internals) — which is what makes it safe to stash them in state.
`Object.freeze(x)` is the documented opt-out from reactivity, and it makes reads
free.

**Writes are synchronous, with no batching.** An assignment runs its dependent
effects immediately — that's why updates are cheap and why qrp is *not*
interruptible the way a scheduler-based renderer is. For a high-frequency stream,
coalesce upstream of `state` (see [`debounce`/`throttle`](./API.md#utils)).

**An effect that throws is torn down** (its subscriptions removed) and the error
propagates. Register [`onEffectError`](./API.md#qrp--core) to observe them
centrally (Sentry, etc.) — otherwise a throwing binding is only visible at the
write site.

**An effect that synchronously writes state it (transitively) reads re-enters
itself forever.** The classic version is two effects that write *each other's*
keys, or a body that sets a key it reads:

```js
// ✗ A writes b (which A doesn't read) is fine; but a cycle isn't:
effect(() => { state.b = state.a + 1; });   // reads a, writes b
effect(() => { state.a = state.b + 1; });   // reads b, writes a → A↔B forever
```

This recurses until the stack overflows. qrp has a **runaway guard**: it tracks
each effect's **re-entrancy depth** (how many times it's already on the stack)
and, past `loopLimit` levels deep (default 1000), tears the effect down and
reports it through [`onEffectError`](./API.md#qrp--core) with `phase: "loop"` — a
catchable, named error instead of a dead tab. Name effects (`effect(fn, {
name })`) so the report points at the culprit; raise the ceiling with
`effect(fn, { loopLimit })` (or `Infinity`) for legitimate deep recursion. The
fix is almost always to **read less**: guard the write (`if(next !== state.x)`)
or read the trigger with [`untracked`](./API.md#qrp--core).

Depth — not a rate — is the test, so a legitimately *hot* effect (thousands of
sequential updates to one cell: bulk writes, animation) never trips: each run
completes before the next, so its depth stays 1. The one case this *doesn't*
catch is an **async** self-loop — a loader that resolves later and re-writes its
own dependency (`effect(() => { if(!state.x) load().then(v => state.x = v); })`) —
because separate microtasks don't re-enter the stack. Load *outside* the effect,
or guard the write. (qrp's own `createHttp` loader is leak-free, so it can't
cause this.)

**Thunk-vs-value is the papercut to internalize first.** A function child/prop is
*reactive*; a bare value is a one-time snapshot. The two look almost identical and
only one updates — this is the tax for having no compiler:

```js
el("span", {}, () => s.count)   // ✓ reactive — re-renders on change
el("span", {}, s.count)         // ✗ frozen — snapshot at construction

table({ rows: () => store.rows })   // ✓ reactive rows
table({ rows: store.rows })         // ✗ frozen at the value it had then
```

If something "won't update," this is the first thing to check: did you pass a
value where a `() =>` thunk was meant?

## DOM & rendering

**A DOM node lives in exactly one place.** Appending "the same" node in two spots
moves it. To render the same content twice, use a thunk `() => el(...)` (a fresh
node each call) or `node.cloneNode(true)` — never a shared live node.

**`when()`/`list()` markers render anywhere qrp accepts a Renderable** — an
`el()`/`html` child, returned bare from another branch, a `list()` render, a
`mount()` component. The one place they *don't* work is a **non-qrp** insertion (a raw
`parent.append(marker)` / `.appendChild`) — use `el()`/`mount()` (or a reactive
child) instead. If you do it by accident, it no longer fails silently: the marker
stringifies to a `[qrp when() — render via el()/mount(), …]` breadcrumb and logs a
`console.warn` at the call site.

**`when()` is value-keyed.** It re-renders when the condition's *value* changes
(by `Object.is`), so `when(() => state.tab, tab => TABS[tab]())` switches tabs.
The edge: if the value is an object whose *identity* changes on every read, that
rebuilds every time — key on a primitive (`() => user?.id`) or mutate the object
in place.

**`list()` keys must be unique.** Duplicate keys are dropped with a
`console.warn` (two items can't share one element). For a feed with repeats, use a
composite key: `(r) => `${r.id}:${r.at}``.

**Attach route content through `el()`/`mount()`, never a bare
`outlet.append(marker)`.** The router hands each route a real `outlet` element;
wrap the page body in one `el()` root (or `mount(outlet, () => …)`) so every
`when()`/`list()` marker is a qrp child and renders:

```js
// ✗ marker handed to native append → renders the breadcrumb text
outlet.append(header, when(() => empty, …, () => table));
// ✓ one el() root — every marker is a qrp child
outlet.append(el("div", {}, header, when(() => empty, …, () => table)));
```

**Reach for `el()` and `` html`` `` by shape, not dogma.** `el()` shines for
dynamic/branchy nodes (reactive children, event handlers); a deeply nested
*static* cell (icon + title + subtitle) becomes hard-to-balance `el(...)` paren
soup. For dense static structure, [`` html`` ``](./API.md#html--html-templates) reads better —
mix the two: `html` for the scaffold, `el()`/thunks for the live bits.

## Behaviors

**UI built inside an event handler has no owner scope.** A modal opened from
`onclick` runs where no scope is current, so reactive bindings inside it would be
ownerless effects that outlive the DOM. Build it with
[`scoped()`](./API.md#qrp--core):

```js
const { value: dialog, dispose } = scoped(() => buildReactiveDialog());
const remove = portal(dialog);
const close = () => { dispose(); remove(); };   // effects + DOM both gone
```

## HTTP

**A non-2xx response rejects** with `{ status, data, response }` (the body is
already parsed and consumed) and emits `error` on the bus; a 401 also emits
`auth:unauthorized`. For binary/non-JSON, pass
[`responseType`](./API.md#http).

**Issuing a request inside an `effect()` is safe.** The reactive
`loading.pending` counter is mutated `untracked`, so calling `http.get/post`
synchronously in an effect (the "refetch when filters change" pattern) does not
subscribe that effect to the loader — no infinite request loop. Pass a custom
transport with [`createHttp({ fetch })`](./API.md#http) to mock or wrap it.

## Routing & URL

**Navigate with a real `<a href>`, not `onclick` + `navigate()`.** The router's
delegated click handler upgrades in-app anchors to client-side nav *and* leaves
middle-click / ⌘/Ctrl-click / `target`/`download`/`rel=external` to the browser.
A `<button onclick={() => navigate(...)}>` looks identical but silently breaks
open-in-new-tab — there's no anchor for the browser to act on. Make row/nav
targets anchors; reserve `navigate()` for post-action redirects (after a save).

**`query()` (browser) and `setQuery()` (core) are two different URL channels —
pick one.** [`query()`](./API.md#browser) is a two-way reactive
`URLSearchParams` object (write `q.status = "x"`); [`setQuery()`](./API.md#qrp--core)
drives the router's query and updates `currentRoute.query`. Writing the same keys
through both makes them fight. For filters that live in the URL, use `query()` and
write to it directly. Keys are **string-valued by default**; for multi-value
filters declare them with `query({ arrays: ["status", "ids"] })` — those keys are
always arrays, parsed from and serialized to the repeated-key form
(`?status=a&status=b`).

## Serving

**History-API routing needs a server fallback.** A plain static server has no SPA
fallback, so refreshing a deep route (`/users/7`) 404s. Configure the host to
serve `index.html` for unknown paths (this repo's `render.yaml` shows one way).

---

See the **[API reference](./API.md)** for the details behind each, and the
**[Getting Started guide](./GETTING-STARTED.md)** for the happy path.
