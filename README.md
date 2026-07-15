<div align="center">

<img src="./assets/qrp-logo.svg" alt="qrp" width="420">

### Turn data into a dashboard. Nothing else.

A data-first, declarative frontend framework for the browser — reactivity is a `Proxy`, the DOM is real, and there's no build step.

[![npm](https://img.shields.io/npm/v/@nemanjan00/qrp?style=flat-square&labelColor=0a0d12&color=ffb23e&logo=npm)](https://www.npmjs.com/package/@nemanjan00/qrp)
[![CI](https://img.shields.io/github/actions/workflow/status/nemanjan00/qrp/ci.yml?branch=master&style=flat-square&labelColor=0a0d12&label=CI)](https://github.com/nemanjan00/qrp/actions/workflows/ci.yml)
[![dependencies](https://img.shields.io/badge/dependencies-0-34d399?style=flat-square&labelColor=0a0d12)](#-tests--tooling)
[![build step](https://img.shields.io/badge/build_step-none-34d399?style=flat-square&labelColor=0a0d12)](#-what-is-qrp)
[![core size](https://img.shields.io/badge/core-~3.9_KB_min%2Bgzip-ffb23e?style=flat-square&labelColor=0a0d12)](#-performance)
[![tests](https://img.shields.io/badge/tests-226_passing-34d399?style=flat-square&labelColor=0a0d12)](#-tests--tooling)
[![types](https://img.shields.io/badge/TypeScript-.d.ts_included-ffb23e?style=flat-square&labelColor=0a0d12)](#-typescript)
[![license](https://img.shields.io/npm/l/@nemanjan00/qrp?style=flat-square&labelColor=0a0d12&color=34d399)](LICENSE)

**[🚀 Getting started](docs/GETTING-STARTED.md)** · **[📦 npm](https://www.npmjs.com/package/@nemanjan00/qrp)** · **[▶ Live demo](https://qrp-xdl4.onrender.com/)** · **[📖 API reference](docs/API.md)** · **[💡 Why it exists](#-why-it-exists)**

</div>

---

Zero dependencies, zero build step — one `<script type="module">` and you're
running. No compiler, no bundler, no `node_modules` at runtime. Reactivity is a
`Proxy`, the DOM is real, and the published core is **~3.9 KB min+gzip** — the
number that lines up next to Solid (~7 KB) or React (~45 KB). The whole library,
every module, is **~17 KB min+gzip**.

> The npm package ships a minified, code-split build (esbuild), so a browser
> pulls the small file — still no build step on *your* end. The readable source,
> JSDoc and all, is ~12 KB gzipped if you load it raw; CDNs like esm.sh minify it
> on the fly, so only the vendored-raw path serves the larger file.

```js
import { state, el, mount } from "@nemanjan00/qrp";

const counter = state({ n: 0 });

mount(document.body, () =>
  el("button", { onclick: () => counter.n++ }, () => `clicked ${counter.n}×`));
```

That's the entire setup. No `createRoot`, no providers, no hydration. You mutate
data, the DOM follows.

---

## 🛰️ Small enough to run on a microcontroller

Because the whole library is ~17 KB min+gzip, a useful qrp app doesn't need a
server or a CDN — it fits **in flash on an ESP32**. Not a static form, either: a
**live dashboard** — telemetry streaming into reactive bindings, an LED you drive,
a config form that rewrites itself with `when()`, and a WiFi-scan modal built from
`portal` + `trapFocus` + `dismissable`.

**[▶ Live demo](https://qrp-xdl4.onrender.com/examples/esp32/dashboard.html)** ·
**[full example →](examples/esp32/)** (PlatformIO project + build)

| what the browser loads | size |
|---|---|
| qrp core + behaviors + the app, minified | ~10.9 KB |
| the whole self-contained HTML page | ~15.4 KB |
| **gzipped — the total baked into flash** | **~6 KB** |

`react-dom` alone is ~45 KB gzipped — **7× this entire live dashboard**, before a
line of your own UI. The chip serves the page from PROGMEM over its own WiFi AP:
no filesystem, no internet, no build step on the device. This is the
zero-dependency premise at its literal limit — the "server" is an $8
microcontroller and the "build pipeline" is `gzip | xxd -i`.

```cpp
// the entire web app, served straight from flash:
void handleRoot() {
  server.sendHeader("Content-Encoding", "gzip");
  server.send_P(200, "text/html", dashboard_html_gz, dashboard_html_gz_len);
}
```

---

## 📥 Install

> New here? The **[Getting Started guide](docs/GETTING-STARTED.md)** is a
> ten-minute, zero-to-dashboard walkthrough of the five core ideas. This section
> is the reference; that's the tutorial.

```sh
npm i @nemanjan00/qrp
```

The bare `@nemanjan00/qrp/*` specifiers in the snippets below resolve through the
package's `exports` map, so **with any bundler they just work** — and unused
subpaths tree-shake away.

**Zero-build in the browser** — two ways, both still no bundler:

```html
<!-- 1) a CDN that serves npm as ESM (clean subpaths honour exports) -->
<script type="module">
  import { state, el, mount } from "https://esm.sh/@nemanjan00/qrp";
  import { table } from "https://esm.sh/@nemanjan00/qrp/table";
</script>

<!-- 2) vendor the files and map the name once with an import map -->
<script type="importmap">
{ "imports": {
  "@nemanjan00/qrp":       "/vendor/qrp/qrp/index.js",
  "@nemanjan00/qrp/table": "/vendor/qrp/table/index.js"
} }
</script>
```

(This site's own pages use option 2 — see the `<script type="importmap">` block
in [`index.html`](index.html).)

## 🧭 What is qrp?

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

## 💡 Why it exists

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

## 🚀 5-minute example

A live, sortable, filterable table with a modal — the whole thing, no build step:

```js
import { state, el } from "@nemanjan00/qrp";
import { table } from "@nemanjan00/qrp/table";
import { portal } from "@nemanjan00/qrp/behaviors/portal";
import { trapFocus } from "@nemanjan00/qrp/behaviors/trap-focus";
import { dismissable } from "@nemanjan00/qrp/behaviors/dismissable";
import { notify, toasts } from "@nemanjan00/qrp/toasts";
import { html } from "@nemanjan00/qrp/html";

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

## ✨ Features

**Two ways to write markup.** Prefer functions, or prefer HTML — both are
first-class and produce the same real DOM.

```js
// el() — plain-DOM helper; function props/children are reactive
el("span", {}, () => `count: ${counter.n}`);

// html`` — for people who think in HTML. Interpolated text values are escaped;
// ${() => …} holes are reactive; onX=${fn} wires listeners.
html`<button onclick=${() => counter.n++}>${() => counter.n}</button>`;
```

**Storable templates.** `${}` is JavaScript's interpolation — gone before html()
sees it. For a template you keep in a file or config and fill later, use
`html.template` with `#{}` placeholders — parsed once, reactive when filled with
state:

```js
const row = html.template("<tr><td>#{name}</td><td>#{email}</td></tr>");
row(user);                       // → DOM bound to user.name / user.email
row(state({ name: "R2" }));      // reactive; #{} fields escaped as text
```

**On escaping (the precise guarantee).** A value interpolated in **text**
position (a child hole, `${}` or `#{}`) is rendered as a text node — it can never
inject an element, `<script>`, or event handler, whatever string it holds.
Attribute holes are set as the attribute *value* verbatim (via `setAttribute` /
property, never re-parsed as HTML — so a value can't break out into a new
attribute or tag), **but qrp does not sanitize URL schemes**: a `javascript:`
value in an `href` passes through, same as Lit. Don't put untrusted data in
`href`/`src`/`style` without your own check. The full set of attack vectors —
`<script>`/`<img onerror>` in text holes, unquoted-attribute breakout attempts,
the `javascript:` boundary — lives in `test/html-xss.test.js` and is verified in
real Chromium.

And to drop a live node into a plain concatenated string (no tagged template),
`ref()` gives you an opt-in token — no prototype patching:

```js
html("<div class='card'>" + ref(myButton) + "</div>");   // real node, injected
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
  () => view.items(),                     // reactive source (items() is a method)
  (row) => row.id,                         // stable key
  (row) => html`<tr><td>${() => row.name}</td></tr>`  // built once per key
));
```

**Conditional subtrees, with cleanup.** `when()` swaps a branch on a condition
and disposes the old branch's effects — no leaks, no DOM surgery. It's
**value-keyed**, so it drives tabs directly (re-renders when the value changes,
not just on true⇄false):

```js
// edit vs display
el("div", {}, when(() => editing.on,
  () => html`<input value=${row.name}>`,
  () => html`<span>${() => row.name}</span>`));

// a tab switcher — re-renders on every tab
el("div", {}, when(() => ui.tab, (tab) => TABS[tab]()));
```

**A fetch client built for dashboards.** URL shaping, auth headers, a **reactive**
in-flight loader, and errors routed to the toast bus.

```js
const http = createHttp({ baseUrl: "/api", token: () => session.token });
http.get("/things", { params: { page: 2, ids: [1, 2, 3] } });   // → parsed JSON
effect(() => bar.hidden = http.loading.pending === 0);          // a spinner in one line
http.get("/export.msgpack", { responseType: "arraybuffer" });  // binary, not just JSON
```

**Dashboard utilities that carry the boring parts.** Rate-limit, debounce,
validate — the stuff every admin tool hand-rolls.

```js
const search = debounce((q) => http.get("/find", { params: { q } }), 300);
const sync   = limit((id) => http.post(`/follow/${id}`), { max: 5 });  // ≤5 in flight
const { errors, value } = validate(schema, form);  // value is coerced; [] = ok
```

**Reactive routing & owned side-effects.** The route is state; UI built outside a
render stays owned.

```js
el("a", { class: () => currentRoute.path === "/users" ? "active" : "" }, "Users");
const { value: modal, dispose } = scoped(() => buildDialog());  // no ownerless effects
onEffectError((err) => Sentry.captureException(err));           // central crash reporting
```

Plus: a global event bus, cross-tab persistence, HTML5 routing with `:param`
patterns (keep-alive on same-pattern navigation), real custom elements (no
`class extends`), and headless behaviors for modals, dropdowns, tooltips, and
disclosures.

## 📦 Modules

Each module is an independent file — import only what you use; with a bundler,
unused exports tree-shake away.

| Module | What it gives you |
|--------|-------------------|
| `@nemanjan00/qrp` | Core: `state`, `effect`, `derive`, `untracked`, `raw`, `onEffectError`, `el`, `reactive`, `bind`, `list` (keyed), `when`, `clear`, `mount`, `scope`, `onDispose`, `define`, `router`, `navigate`, `currentRoute`, `compilePath` |
| `@nemanjan00/qrp/html` | `` html`` `` / `html()` (inline, `${}` holes), `html.template` (storable, `#{}` placeholders), `ref` (inject a live node into a plain string) — author DOM as HTML; text holes escaped (see escaping guarantee above) |
| `@nemanjan00/qrp/forms` | Declarative forms + open input-type registry (`registerInput`, `field`, `form`, `parseKV`) |
| `@nemanjan00/qrp/table` | Declarative data table: sortable headers, keyed row reuse, per-column accessor/formatter/render |
| `@nemanjan00/qrp/collection` | Reactive sort/filter/paginate over a dataset — drives a keyed `list()` |
| `@nemanjan00/qrp/http` | `createHttp` — fetch client with auth headers, reactive loader, error bus routing, per-request `responseType` (json/text/binary) |
| `@nemanjan00/qrp/events` | Global event bus on native `EventTarget`: `bus`, `emitter`, `request`/`respond`, `channel` |
| `@nemanjan00/qrp/toasts` | Notifications off the bus: `notify.*`, mountable `toasts`; content is any renderable |
| `@nemanjan00/qrp/browser` | Reactive wrappers over native APIs: `persisted`, `query`, `media`, `viewport`, `online`, `cookies`, `seen` |
| `@nemanjan00/qrp/behaviors/*` | Headless helpers to build styled components: `portal`, `dismissable`, `trapFocus`, `anchored`, `disclosure`, `busyWhile` |
| `@nemanjan00/qrp/utils/*` | Pure data helpers for dashboards: `memoize` (+ttl/invalidate), `lru`, `cache`, `paginate`, `limit` (concurrency/rate/timeout), `debounce`/`throttle`, `validate`, `loadScript` |
| `@nemanjan00/qrp/proto` | Prototype-level enhancement (objects & `__proto__`, no classes): `findProto`, `wrapMethod`, `onceOnly`, `delegate` |
| `qrp.css` | Optional minimal baseline (design tokens + semantic classes). Link it yourself. |

## 📊 Performance

### The headline: change one field in a 10,000-row table

This is the operation where qrp's architecture is *categorically* different from
a virtual-DOM framework — so it deserves its own measurement. Mutate one row's
field; the `Proxy` setter fires exactly one tracked effect, which writes the one
text node it already holds a reference to. Measured in real Chromium with a
`MutationObserver` watching the whole table:

> **1 DOM node touched, out of 40,002.** No diff. No component re-render. No
> reconcile pass. The cost is **~0.8 µs** of reactivity bookkeeping.

That "1 of 40,002" is the important number — it's machine-independent and
falsifiable: rerun it on any hardware and you get the same answer, because it's
architectural, not a timing.

**Measured against React 18**, same operation, same `MutationObserver`. The
setup, stated precisely so the number defends itself: React 18.2 production
build; rows are keyed and wrapped in `React.memo`; the update replaces one row
object in a new array; `flushSync` makes the reconcile synchronous so it can be
timed.

| Change one cell in 10,000 rows | JS per update | DOM nodes touched |
|---|---|---|
| **qrp** | **~0.8 µs** | **1** of 40,002 |
| React 18 | **~800 µs** | 1 of 40,002 |

Both touch **exactly one DOM node**. Where React's ~800 µs goes: `React.memo`
stops each row's DOM from re-rendering, **but the parent still re-runs and
allocates 10,000 element descriptors, and the reconciler still walks all 10,000
children to find the one that changed** — that walk is the cost. qrp has no walk;
the `Proxy` subscription already points at the one text node, so it spends
~0.8 µs. Same DOM outcome, **~1000× the work** — the reconcile pass qrp doesn't
have. It's O(1) and independent of table size.

Two things people rightly challenge, answered up front:

- ***`flushSync` is cheating / concurrent mode defers.*** `flushSync` doesn't add
  work — it stops batching from smearing the reconcile across a later frame so it
  can be timed. Concurrent mode can slice that walk and interleave it, but the
  total CPU is the same; we're measuring it, not hiding it behind a frame.
- ***You wrote slow React.*** Colocating state per row (a store per row) does
  narrow the gap — but that's the point: you have to restructure to avoid the
  reconcile; qrp is O(1) for free with the ordinary "data in a parent array"
  pattern.

Reproduce it: `examples/react-compare.html` (the objections are answered in its
comments too).

To put ~0.8 µs in perspective without overclaiming: it's ~20,000 single-cell
updates' worth of *bookkeeping* inside one 16 ms frame budget. In practice you'd
never do that many — layout and paint dominate long before (see "update every
10th row" below, which is 8 ms paint-timed for 1,000 cells: ~10% reactivity,
~90% paint). That internal consistency is the point: the reactivity is real and
small, and paint is the rest.

**Honest footnote — vs hand-written vanilla, not React:** this is a win over
*virtual-DOM frameworks*. A bare `textContent =` when you already hold the node
reference is ~0.27 µs; finding the cell with `querySelector` first is ~0.46 µs.
qrp's ~0.8 µs is slightly more — reactivity isn't free, and that ~0.5 µs is
exactly what buys the automatic dependency tracking. qrp *derives* the node
reference from the subscription, so you never write or maintain the `id → node`
map the fast vanilla depends on.

### The rest of the suite

Paint-timed (time until the frame is painted, not just the synchronous write),
median of 5 after warmup, against a hand-written keyed vanilla-DOM control —
*"the floor"*, not another framework.

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

On create, replace, update, and remove, qrp is at **hand-written DOM parity
(0.9–1.3×)** — there's no reconcile pass to pay for, because updates are
fine-grained. The swap case was 5.9× before a longest-increasing-subsequence
reconcile brought it to 1.3×. The remaining gaps are per-row subscriptions
(select) and scope disposal (clear). **`clear` at 1.8× is the honest weak
spot**: it disposes each row scope's effects individually, so it scales with
bindings-per-row — fatter rows make it worse. A bulk scope-drop that frees
children without visiting each dep-set would fix it; not done yet.

Run it yourself: `examples/bench.html` exposes the suite on `window.bench`
(`runAll()`, `updateOneNs()`, `mutationsForOne()`).

## 🧠 Philosophy

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

## 🔬 Advanced implementation details

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

## ▶️ Running the demos

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

## 🟦 TypeScript

Types ship as `*.d.ts` next to each module, so importing `./qrp/index.js`
resolves them automatically — no `@types` package, no build step, no change to
how qrp loads. Generics flow through: `state<T>`, `list<T>`, `collection<T>`,
`table<T>`, `memoize`, and the rest.

```ts
import { state, el, list } from "@nemanjan00/qrp";

interface User { id: number; name: string; }
const users = state<{ rows: User[] }>({ rows: [] });
el("ul", {}, list(() => users.rows, (u) => u.id, (u) => el("li", {}, () => u.name)));
```

`npm run typecheck` runs `tsc --noEmit` over the declarations and a usage suite
in strict mode.

## 📖 API reference

Full reference — every export, signature, and a usage snippet per module — in
[`docs/API.md`](docs/API.md). Gotchas worth knowing once: [`docs/SHARP-EDGES.md`](docs/SHARP-EDGES.md).

## 🧪 Tests & tooling

```sh
npm install     # dev-only: happy-dom (tests), eslint, typescript, husky
npm test        # node --test — 226 tests across every module
npm run lint    # eslint (eslint:recommended + house style)
npm run typecheck  # tsc --noEmit over the .d.ts + a usage suite (strict)
```

The framework has **zero runtime dependencies**; everything in `devDependencies`
is for tests, lint, types, and the pre-commit hook. Nothing is required to *use*
qrp — just load the modules.

## 📄 License

[MIT](LICENSE) © Nemanja Nedeljkovic

---

*Named after QRP — the ham-radio practice of getting the job done with the least
possible power.*
