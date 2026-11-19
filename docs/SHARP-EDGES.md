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

**Freezing opts out of reactivity *inside `list()` rows* too.** A frozen item
can't be wrapped, so bindings in its row (`() => r.payment`) have nothing to
track — they render once and never update. `list()` handles the refetch case
for you: when a *replacement* item arrives under a surviving key (a rebuilt
array from a `derive()`, a refetch), a frozen row is **rebuilt** — fresh element,
fresh bindings — where a normal row is rebound in place (bindings update, element
identity preserved). So both stay correct; the difference is that frozen rows
lose element reuse. Freeze rows you'll only ever replace wholesale; leave rows
you bind to unfrozen. (Rows fed from a `derive()` that rebuilds the array on
every change are the *normal* case, not a special one — bind to the item the
render callback receives and the rebind keeps cells live.)

**Writes are synchronous; batching is opt-in.** An assignment runs its dependent
effects immediately — that's why updates are cheap and why qrp is *not*
interruptible the way a scheduler-based renderer is. The flip side: an update
that spans several keys is applied one key at a time, and an effect reading two
of them can run *between* the writes and see the new `overall` next to the old
`latencyBounds`. Wrap a multi-key update in [`batch`](./API.md#qrp--core):

```js
const apply = (next) => batch(() => {
	store.overall = next.overall;
	store.latencyBounds = next.latencyBounds;
	store.rows = next.rows;
});   // each dependent effect runs once, here, against the final state
```

Writes inside `batch` still land immediately (reads inside it see them); only the
effects wait. Batches nest — the outermost one flushes. For a high-frequency
stream, coalesce upstream of `state` (see [`debounce`/`throttle`](./API.md#utils)).

**Table cells are reactive without thunks.** The thunk-vs-value rule (below) holds
everywhere you build the DOM yourself — but `table()` wraps every
`render:`/`formatter:` cell (and the `expandable` panel) in a thunk for you, so a
cell returning plain values still updates when its row is replaced or the state
it reads changes. Inner thunks in a `render:` only make the update finer (a text
node instead of the whole cell's content).

**An effect that throws is torn down** (its subscriptions removed) and the error
propagates. With no handler registered, qrp `console.error`s the failure by
default — so a component that dies during mount is never a *silent* blank region;
the console names the effect and its phase. Register
[`onEffectError`](./API.md#qrp--core) to route errors to your own reporting
(Sentry, etc.) — any registered handler takes over and silences the default.

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

**`...arr.map()` is the most convincing version of that mistake.** It *reads*
reactive state, so it looks like it should track — but the spread runs at the
call site, before `el()` is invoked, so `el` only ever sees a fixed list of
finished nodes:

```js
el("select", {}, ...app.targets.map((t) => el("option", {}, t)));            // ✗ once
el("select", {}, list(() => app.targets, (t) => t, (t) => el("option", {}, t)));  // ✓
```

**If the array can change after first render, it's `list()`.** (A *function*
child — `() => app.targets.map(…)` — does update, but rebuilds the whole subtree
on every change: no element reuse, focus and scroll lost. Correct for a few
static-ish nodes, wrong for rows.) See the
[reactivity cheatsheet](./GETTING-STARTED.md#7-the-reactivity-cheatsheet).

## DOM & rendering

**Cleanup follows ownership, not the DOM.** There is no `ondisconnect` prop.
Register teardown with [`onDispose`](./API.md#ondispose) inside the component
that owns the listener, `ResizeObserver`, timer, `requestAnimationFrame` loop or
camera stream; it runs when the owning `when()` branch switches, the `list()` row
goes away, or the `mount()`/`scoped()` handle is disposed:

```js
const Panorama = () => {
	const canvas = el("canvas");
	let frame = requestAnimationFrame(function draw() { paint(canvas); frame = requestAnimationFrame(draw); });
	const onKey = (e) => {
		if(e.key === "Escape") {
			ui.ar = false;
		}
	};
	window.addEventListener("keydown", onKey);
	onDispose(() => {
		cancelAnimationFrame(frame);
		window.removeEventListener("keydown", onKey);
	});
	return canvas;
};

el("section", {}, when(() => ui.ar, Panorama));   // leaving AR cleans up
```

Removing or moving a node yourself (`node.remove()`, `other.append(node)`)
disposes nothing. If you insert and remove a subtree by hand, build it in
`scoped()` and call its `dispose()` when you take it out. For a chart or canvas
widget that needs a sized, connected host, [`embed`](./RECIPES.md#imperative-widgets-and-layout) does the
create/resize/destroy cycle for you.

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

**`list()` keys must be unique.** Duplicate keys drop the row (two items can't
share one element) and `console.error` by default — pass
`{ onDuplicateKey: "throw" }` to make it fatal. For a feed with repeats, use a
composite key: `(r) => `${r.id}:${r.at}``.

**`list()` takes an array + `keyFn`; for a reactive *dictionary*, feed it
entries.** There's no object-keyed variant — map the object to pairs and key on
the pair's key:

```js
list(() => Object.entries(byMetric), ([key]) => key, (entry) => row(entry[0], () => entry[1]));
```

That gives you keyed reuse over `{ [k]: v }` data (add/remove a key → add/remove
one row) instead of a function-child that rebuilds the whole subtree on any change.
Read the value **through the item** (`() => entry[1]`), don't destructure it in the
render callback: a surviving key keeps its row and rebinds the item in place, so
`([key, points]) => row(key, points)` captures `points` once and the row keeps
showing the old value after `byMetric.cpu = 2`.

**SVG works, and it's namespace-aware.** `el("svg", …)` / `el("path", …)` /
`el("circle", …)` are created in the SVG namespace (so they actually render), and
their attributes — `d`, `viewBox`, `fill`, `cx`, even `class` — go through
`setAttribute`. The only gap: tags that exist in *both* namespaces (`a`, `title`,
`script`, `style`) stay HTML, since that's the common case — author an SVG `<a>`
or `<title>` with the [`html\`\``](./API.md#html--html-templates) module.

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
mix the two: `html` for the scaffold, `el()`/thunks for the live bits. Field
reports agree on where the line sits: around **three levels of static nesting**,
`el()` trees stop being scannable. "One idiom for consistency" is the wrong
trade — mixing is the intended style, not a compromise.

## Context

**`provide()` re-runs its readers synchronously — don't call it from inside one
of them under `untracked()`.** Children are built before their parent, so
`provide()` must re-run readers right away (that's how a trigger built earlier
in the same construction finds its root). But an effect that *reads* a context
and then, under `untracked()`, *provides* that context (or builds something that
does) is no longer "the running effect" to qrp, so the re-run re-enters it:

```js
// ✗ reads Ctx, then (untracked) builds a subtree that provides Ctx → re-entry
effect(() => {
	if(Ctx.read(node).open) {
		untracked(() => buildPanel());   // buildPanel() calls Ctx.provide(...)
	}
});
```

Set a guard before building (`if(building) return; building = true; …`), or
look the value up with `Ctx.find(node)` (untracked) when the effect doesn't need
to re-run on context changes. `setOwner()` / `portal()` don't have this problem:
owner changes re-run readers on a microtask.

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

**Dismissables stack.** Every live `dismissable` is a layer; Escape closes only
the most recently opened one, and an outside click closes layers from the top
until it reaches the one it landed in. That's what makes a popover inside a
dialog work — but it also means two *unrelated* open dismissables no longer close
together on one Escape: the newer goes first. Pass `inside: [trigger]` so a click
on the opener toggles instead of dismiss-and-reopen.

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

**Use a bundler (or vendored files) for anything real; a CDN is for prototypes.**
A CDN import is a network dependency on someone else's server: one failed fetch
and the page is blank. Install from npm and import `@nemanjan00/qrp` through
Vite/esbuild/Rollup/webpack, or copy `dist/` next to your page and map it with an
import map (see the README). Pin exact versions on a prototype that others use.

**Load exactly one copy of qrp per page.** Reactivity lives in the core module's
own variables, so two copies don't see each other: state changed through one
never updates bindings made by the other, and nothing throws. qrp logs
`qrp: a second copy of qrp's core loaded from …` when it happens. The usual causes:

- importing qrp from one CDN URL and qrp-shadcdn's bundle (which re-exports the
  core) from another — on a CDN, take `state`/`el`/`mount` from the qrp-shadcdn
  bundle;
- importing qrp subpaths through jsDelivr `+esm` or esm.sh — each subpath URL
  can bundle its own private core;
- two versions in `node_modules` (a dependency pinning a different qrp) — check
  with `npm ls @nemanjan00/qrp` and dedupe.

**History-API routing needs a server fallback.** A plain static server has no SPA
fallback, so refreshing a deep route (`/users/7`) 404s. Configure the host to
serve `index.html` for unknown paths (this repo's `render.yaml` shows one way).

---

See the **[API reference](./API.md)** for the details behind each, and the
**[Getting Started guide](./GETTING-STARTED.md)** for the happy path.
