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

**An effect that writes state it (transitively) reads loops forever.** The
classic version is a loader called from an effect that sets state the *same*
effect depends on:

```js
// ✗ re-fires forever: reads metrics, writes metrics
effect(() => { if(!state.metrics) { loadMetrics().then(m => state.metrics = m); } });
```

Synchronously this recurses until the stack overflows; with an async loader
(`fetch`) it spins an unbounded request loop that ends in
`net::ERR_INSUFFICIENT_RESOURCES` and a tab crash. Two effects that write *each
other's* keys are the same bug. qrp has a **runaway guard**: past ~1000 re-runs
in a second an effect is torn down and reported through
[`onEffectError`](./API.md#qrp--core) with `phase: "loop"` — a catchable, named
error instead of a dead tab. Name effects (`effect(fn, { name })`) so the report
points at the culprit; raise the ceiling with `effect(fn, { loopLimit })` for a
legitimately high-frequency effect. The fix is almost always to **read less**:
load outside the effect, guard the write (`if(next !== state.x)`), or read the
trigger with [`untracked`](./API.md#qrp--core).

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
