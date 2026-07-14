# qrp

**Turn data into a dashboard. Nothing else.**

A data-first, declarative frontend framework for the browser. Zero dependencies,
zero build step — one `<script type="module">` and you're running. No compiler,
no bundler, no `node_modules` at runtime. Reactivity is a `Proxy`, the DOM is
real, and the whole core gzips to **11.5 KB**.

```js
import { state, el, mount } from "./qrp/index.js";

const counter = state({ n: 0 });

mount(document.body, () =>
  el("button", { onclick: () => counter.n++ }, () => `clicked ${counter.n}×`));
```

That's the entire setup. No `createRoot`, no providers, no hydration. You mutate
data, the DOM follows.

---

## What is qrp?

qrp does **one thing well**: it turns **data** into a **dashboard** — the
settings panels, forms, tables, and control UIs that make up an admin or
internal tool. It is not trying to be a general-purpose app framework that
competes with React. It's the right tool for the enormous class of apps that
are, at heart, *"render this data, let me edit it, reflect the changes."*

- **Reactive state** is a `Proxy`. Read a key inside an `effect`, and that effect
  re-runs when the key changes — nothing else does.
- **The DOM is real.** `el()` returns actual elements; there's no virtual DOM and
  no reconcile pass on update. A field edit touches exactly one text node.
- **Keyed lists reuse elements.** Sort, filter, or paginate 10,000 rows and qrp
  moves nodes instead of rebuilding them.
- **Batteries where dashboards need them:** declarative forms, a data table, a
  fetch client, a toast system, an event bus — each an independent module you
  import only if you use it.

## Why it exists

Modern frontend split one app into two — a "frontend app" and a "backend app" —
and in doing so **duplicated** state, validation, types, and auth across the wire.
Then it papered over the duplication with more machinery than it removed: a
compiler, a bundler, a hydration pass, a client-side cache to hold a copy of data
the server already has.

For a dashboard behind a login, most of that machinery is paying for problems you
don't have. Nobody SEOs an admin panel, so you don't need SSR or hydration. Your
data lives one `fetch` away, so you don't need a normalized client store. What you
actually need is: *show the data, let me sort and edit it, send it back.*

qrp keeps the good ideas the platform already ships — the DOM, `URL`,
`EventTarget`, the History API, custom elements, `Proxy` — and adds only the thin
reactive layer that ties them together. The result is small, fast, and boring in
the way infrastructure should be.

## 5-minute example

A live, sortable, filterable table with a modal — the whole thing, no build step:

```js
import { state, el } from "./qrp/index.js";
import { table } from "./table/index.js";
import { portal } from "./behaviors/portal.js";
import { trapFocus } from "./behaviors/trap-focus.js";
import { dismissable } from "./behaviors/dismissable.js";
import { notify, toasts } from "./toasts/index.js";
import { html } from "./html/index.js";

const users = state({ rows: await fetch("/api/users").then(r => r.json()) });
const filter = state({ q: "" });

const t = table({
  rows: () => users.rows,
  key: (u) => u.id,                                  // the :key equivalent
  filter,
  filterFn: (u, f) => u.name.toLowerCase().includes(f.q.toLowerCase()),
  page: state({ index: 0, size: 20 }),
  fields: [
    { key: "name",   label: "Name",   sortable: true },
    { key: "email",  label: "Email",  sortable: true },
    { key: "signups",label: "Signups",sortable: true, formatter: (v) => v.toLocaleString() },
    { key: "actions",label: "",       render: (u) => el("button", { onclick: () => open(u) }, "View") }
  ]
});

// a search box wired to the filter, written as HTML:
const search = html`
  <input type="search" placeholder="Filter users…"
         oninput=${(e) => { filter.q = e.target.value; }}>`;

document.querySelector("#app").append(search, t);

// a modal from three headless behaviors + an html template
function open(user) {
  const dialog = html`
    <div class="qrp-modal">
      <h3>${user.name}</h3>
      <p>${user.email} — ${() => user.signups.toLocaleString()} signups</p>
      <button onclick=${() => close()}>Close</button>
    </div>`;
  const backdrop = el("div", { class: "qrp-modal-backdrop" }, dialog);

  const remove = portal(backdrop);          // → document.body
  const untrap = trapFocus(dialog);         // focus trap + restore
  const undismiss = dismissable(dialog, () => close());  // Esc / outside-click

  function close() { undismiss(); untrap(); remove(); notify.info("Closed"); }
}
```

Sorting, filtering, pagination, keyed row reuse, a focus-trapped modal, and
toasts — with no framework runtime to boot and no bundler in sight.

## Features

**Two ways to write markup.** Prefer functions, or prefer HTML — both are
first-class and produce the same real DOM.

```js
// el() — plain-DOM helper; function props/children are reactive
el("span", {}, () => `count: ${counter.n}`);

// html`` — for people who think in HTML. String holes are escaped (XSS-safe);
// ${() => …} holes are reactive; onX=${fn} wires listeners.
html`<button onclick=${() => counter.n++}>${() => counter.n}</button>`;
```

**Reactive state that tracks per key.**

```js
const s = state({ first: "Ada", last: "Lovelace", tags: [] });
const full = derive(() => `${s.first} ${s.last}`);   // recomputed on change
effect(() => console.log(full.value));               // logs on change
s.tags.push("math");                                 // arrays are reactive too
```

**Declarative forms with an open input registry.** Describe fields as data; add
your own input types at runtime.

```js
registerInput("callsign", (settings, key, field) => {
  const input = inputs.text(settings, key, field);
  input.addEventListener("input", () => settings[key] = input.value.toUpperCase());
  return input;
});

form({ settings, fields: {
  name: { label: "Name", type: "text" },
  call: { label: "Callsign", type: "callsign" },       // your custom type
  mode: { label: "Mode", type: "select", options: { dmr: "DMR", ysf: "YSF" } }
}});
```

**Keyed lists that reuse elements.** The primitive under every table.

```js
el("tbody", {}, list(
  () => view.items,                       // reactive source
  (row) => row.id,                         // stable key
  (row) => html`<tr><td>${() => row.name}</td></tr>`  // built once per key
));
```

**Conditional subtrees, with cleanup.** `when()` swaps a branch on a condition
and disposes the old branch's effects — no leaks, no DOM surgery.

```js
el("div", {}, when(
  () => editing.on,
  () => html`<input value=${row.name}>`,   // edit
  () => html`<span>${() => row.name}</span>`  // display
));
```

**A fetch client built for dashboards.** URL shaping, auth headers, a **reactive**
in-flight loader, and errors routed to the toast bus.

```js
const http = createHttp({ baseUrl: "/api", token: () => session.token });
http.get("/things", { params: { page: 2, ids: [1, 2, 3] } });   // → parsed JSON
effect(() => bar.hidden = http.loading.pending === 0);          // a spinner in one line
```

Plus: a global event bus, cross-tab persistence, HTML5 routing with `:param`
patterns, real custom elements (no `class extends`), and headless behaviors for
modals, dropdowns, tooltips, and disclosures.

## Modules

Each module is an independent file — import only what you use; with a bundler,
unused exports tree-shake away.

| Module | What it gives you |
|--------|-------------------|
| `qrp/index.js` | Core: `state`, `effect`, `derive`, `untracked`, `raw`, `el`, `reactive`, `bind`, `list` (keyed), `when`, `clear`, `mount`, `scope`, `onDispose`, `define`, `router`, `navigate`, `compilePath` |
| `html/index.js` | `` html`` `` / `html()` — author DOM as HTML strings with reactive, XSS-safe holes |
| `forms/index.js` | Declarative forms + open input-type registry (`registerInput`, `field`, `form`, `parseKV`) |
| `table/index.js` | Declarative data table: sortable headers, keyed row reuse, per-column accessor/formatter/render |
| `collection/index.js` | Reactive sort/filter/paginate over a dataset — drives a keyed `list()` |
| `http/index.js` | `createHttp` — fetch client with auth headers, reactive loader, error bus routing |
| `events/index.js` | Global event bus on native `EventTarget`: `bus`, `emitter`, `request`/`respond`, `channel` |
| `toasts/index.js` | Notifications off the bus: `notify.*`, mountable `toasts`; content is any renderable |
| `browser/index.js` | Reactive wrappers over native APIs: `persisted`, `query`, `media`, `viewport`, `online`, `cookies`, `seen` |
| `behaviors/*.js` | Headless helpers to build styled components: `portal`, `dismissable`, `trapFocus`, `anchored`, `disclosure`, `busyWhile` |
| `utils/*.js` | Pure data helpers: `memoize`, `lru`, `cache`, `paginate`, `roundRobinByKey`, `weightedPool` |
| `proto/index.js` | Prototype-level enhancement: `findProto`, `wrapMethod`, `delegate` |
| `qrp.css` | Optional minimal baseline (design tokens + semantic classes). Link it yourself. |

## Performance

Measured in real Chromium, **paint-timed** (time until the frame is painted, not
just the synchronous write), median of 5 after warmup. The control is a
hand-written keyed vanilla-DOM implementation of the same table — *"the floor"*,
not another framework.

| Operation | qrp | vanilla DOM | ratio |
|---|---|---|---|
| create 1,000 rows | 29 ms | 31 ms | **0.9×** |
| create 10,000 rows | 271 ms | 214 ms | 1.3× |
| replace all 1,000 rows | 32 ms | 33 ms | **1.0×** |
| update every 10th row | 8 ms | 9 ms | **0.9×** |
| swap 2 rows in 10,000 | 44 ms | 34 ms | 1.3× |
| remove 1 row in 10,000 | 58 ms | 48 ms | 1.2× |
| select 1 row in 10,000 | 10 ms | 7 ms | 1.5× |
| clear 10,000 rows | 40 ms | 22 ms | 1.8× |

The headline: on create, replace, update, and remove, qrp is at **hand-written
DOM parity (0.9–1.3×)** — there's no reconcile pass to pay for, because updates
are fine-grained. The swap case was 5.9× before a longest-increasing-subsequence
reconcile brought it to 1.3×. The remaining gaps (select, clear) are the cost of
per-row subscriptions and scope disposal, and are the next things to sharpen.

Run it yourself: `examples/bench.html` exposes the suite on `window.bench`.

## Philosophy

Four commitments gate every design decision:

1. **Data first.** Reactive state is the single source of truth; the DOM is a
   reflection of it. You never imperatively poke the DOM to stay in sync.
2. **Declarative first.** Forms are data, routes are patterns, tables are column
   configs. You say *what*, not *how*.
3. **Low overhead.** No runtime to boot, no hydration, no virtual DOM. Small
   gzipped size, fast first paint, cheap updates.
4. **Do one thing well.** Small, sharp, composable modules. qrp ships **helpers
   to build styled components**, not components — a table is `collection` +
   `list`; a modal is `portal` + `trapFocus` + `dismissable`. You bring the
   markup and CSS; the helpers carry the platform and a11y hard parts.

And underneath all of it: **use the platform.** `URL`, `URLSearchParams`,
`EventTarget`, `IntersectionObserver`, custom elements, the History API — qrp
wraps them reactively instead of reinventing them.

## Advanced implementation details

**Reactivity is a `Proxy` with per-key dependency tracking.** `state()` wraps a
plain object; the `get` trap records `(effect, key)` pairs, the `set` trap
re-runs exactly the effects that read that key. Writes use `Object.is`, so
`NaN`-over-`NaN` doesn't spuriously re-trigger. Arrays track `length` explicitly
so `push()` updates length-only readers. Frozen objects are returned as-is —
`Object.freeze(bigStaticData)` is the documented opt-out from reactivity, and it
makes reads free.

**Ownership-based cleanup.** Every effect created during a component's render is
adopted by its `scope`; unmounting disposes them all — no manual unsubscribe.
`onDispose(fn)` registers arbitrary cleanup against the current scope, which is
how `list()`, `when()`, and every `browser/` factory tear down their
subscriptions on unmount. An effect that throws is torn down (unsubscribed) and
the error propagates — no dangling subscriptions.

**Keyed reconciliation with minimal moves.** `list()` keeps a `Map<key, element>`
and a `WeakMap<element, item>` (the latter powers `itemFor()` for one-listener
event delegation over huge lists). On change it diffs new positions against old,
keeps the longest increasing subsequence as a stable backbone that never moves,
and inserts only new or genuinely-displaced rows. A 2-row swap does 1 DOM move,
not O(n).

**The DOM rejects `Proxy`-wrapped nodes** (`appendChild` brand-checks its
argument), verified in Chromium — so `reactive(node)` unwraps to the raw node on
insert, and `state()` never proxies DOM nodes, `Map`/`Set`, or class instances
stored inside it. A DOM node also lives in exactly one place, so reusing content
across sites means a thunk `() => el(...)`, never a shared live node.

**Synchronous by design.** qrp writes to the DOM synchronously — there's no
scheduler and no batching, which is why updates are cheap and why it's *not*
interruptible the way React's concurrent renderer is. For a dashboard that's the
right trade; if you need to coalesce a high-frequency stream, do it upstream of
`state`.

## Running the demos

The demos use HTML5 History routing, so serve over HTTP (not `file://`):

```sh
python -m http.server 8000
# then open http://localhost:8000/examples/table.html
```

`examples/` — `table.html` (styled data table + modal), `todomvc.html` (the
classic, built with `list()` + `when()`), `index.html` (forms, routing, toasts),
`bench.html` (the performance harness).

> Note: a plain static server has no SPA fallback, so refreshing a deep route
> (e.g. `/settings/user`) 404s. That's expected for a History-API app, not a qrp
> bug.

## Tests & tooling

```sh
npm install    # dev-only: happy-dom (tests), eslint (lint), husky (git hooks)
npm test       # node --test — 182 tests across every module
npm run lint   # eslint (eslint:recommended + house style)
```

The framework has **zero runtime dependencies**; everything in `devDependencies`
is for tests, lint, and the pre-commit hook. Nothing is required to *use* qrp —
just load the modules.

---

*Named after QRP — the ham-radio practice of getting the job done with the least
possible power.*
