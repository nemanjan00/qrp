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

## DOM & rendering

**A DOM node lives in exactly one place.** Appending "the same" node in two spots
moves it. To render the same content twice, use a thunk `() => el(...)` (a fresh
node each call) or `node.cloneNode(true)` — never a shared live node.

**`when()`/`list()` markers are only valid as an `el()` or `html` child.** They're
plain marker objects, not DOM; appended anywhere else (e.g. returned bare into a
non-qrp `append`) they stringify to `[object Object]`. To nest one inside another
branch, wrap it: `() => el("div", {}, when(...))`.

**`when()` is value-keyed.** It re-renders when the condition's *value* changes
(by `Object.is`), so `when(() => state.tab, tab => TABS[tab]())` switches tabs.
The edge: if the value is an object whose *identity* changes on every read, that
rebuilds every time — key on a primitive (`() => user?.id`) or mutate the object
in place.

**`list()` keys must be unique.** Duplicate keys are dropped with a
`console.warn` (two items can't share one element). For a feed with repeats, use a
composite key: `(r) => `${r.id}:${r.at}``.

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

## Serving

**History-API routing needs a server fallback.** A plain static server has no SPA
fallback, so refreshing a deep route (`/users/7`) 404s. Configure the host to
serve `index.html` for unknown paths (this repo's `render.yaml` shows one way).

---

See the **[API reference](./API.md)** for the details behind each, and the
**[Getting Started guide](./GETTING-STARTED.md)** for the happy path.
