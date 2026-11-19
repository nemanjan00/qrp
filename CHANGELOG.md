# Changelog

All notable changes to `@nemanjan00/qrp`. Pre-1.0, so **breaking changes can land
in a minor/patch** — they're marked ⚠️ **BREAKING** here so you never have to
find out by reading a diff. Newest first.

## Unreleased

_(nothing yet)_

## 0.15.0

Large apps. mailab (56k lines, 39 pane types, live samples at kilohertz
rates, a GridStack layout) used qrp for its views and hand-wrote its app
plumbing. That plumbing is now in qrp.

- **New `docs/LARGE-APPS.md`**: how to structure a large qrp app (transport →
  store → features → shell), with bulk data kept outside `state()`, a feature
  registry with lazy `import()`, testing, and instructions for coding agents.
  RECIPES.md has rows for the new helpers.
- **New module `store`**:
  - `assign(target, patch, { prune })` merges a server snapshot in one batch
    and writes only the keys that changed. It compares raw values, so an
    unchanged object read back through the proxy counts as unchanged.
  - `append(array, items, max)` adds to a capped feed in one batch.
  - `coalesce(target, { interval })` buffers high-rate values (latest per key
    wins) and writes them once per interval or animation frame, skipping
    unchanged ones.
- **New module `host`**:
  - `island(parent, view, props)` mounts a qrp view in a container owned by
    something else (a layout library) and returns reactive `props`,
    `update(next)` and `dispose()`. It also disposes with the scope it was
    created in.
  - `reconcile(source, key, { create, update, recreate, destroy })` keeps a
    keyed set of foreign widgets in sync with state. Each item gets its own
    scope, so whatever `create` builds is cleaned up with it.

## 0.14.0

Lessons from mailab, a production lab dashboard built on qrp. It reimplemented
a lot that qrp already had, and also hit some real gaps.

- **New `docs/RECIPES.md`**: "I'm about to write X → use Y". The README now
  links it next to SHARP-EDGES.
- **New module `socket`**: `socket(url, options)` is a reconnecting WebSocket.
  A path becomes `ws(s)://` on the page's origin, and `url` may be a function
  that is re-read on each reconnect. Backoff is exponential (500 ms → 10 s).
  `status` is reactive (`state`, `connected`, `attempts`). JSON is decoded and
  messages are routed by type with `on("samples", fn)`. `send()` returns false
  while disconnected, and `buffered()` returns the socket's `bufferedAmount`.
  The socket closes with its scope.
- **Core: `onChange(source, callback, { immediate, equals })`**: runs a side
  effect when a reactive value changes. Only `source` is tracked, and the
  callback runs untracked. This replaces the error-prone
  `effect(() => { key(); untracked(…) })` + `last !== key` pattern.
- **`collection`**: `sorted()` returns the filtered and sorted rows without
  paging (export what the user sees). The `clearSort` option makes headers
  cycle asc → desc → off (also on `table`). `searchFilter(fields)` is a
  ready-made search-box `filterFn`: AND-ed case-insensitive terms,
  `field:text` scoping, `"quoted phrases"`, and an unknown `x:y` kept as text.
- **`format`**: `si(value, unit)` gives SI/engineering notation ("1.2 mV",
  "433.92 MHz"). The prefix is picked after rounding. `parseSI(text, unit)` is
  its inverse ("2.4G", "3.3 kV", with `u`/`μ`/`K` spellings), so a numeric input
  can accept engineering suffixes.
- **`browser`**: `size(element)` returns a reactive `{ width, height }` from a
  ResizeObserver. It disconnects with the scope.
- **`behaviors/embed`**: `embed(create)` hosts an imperative widget (uPlot,
  canvas, xterm). It creates the widget only once the host is connected,
  forwards `resize(w, h)`, and destroys it with the scope.
- **`behaviors/stick-to-bottom`**: `stickToBottom(scroller)` keeps a log, chat
  or feed at the newest entry only while the user is at the bottom. A reactive
  `pinned` drives a "jump to latest" button.
- **Fix (`export`)**: `copy()` threw a synchronous TypeError on plain-http
  origins (`http://192.168.x.x` has no `navigator.clipboard`). It now falls back
  to `execCommand("copy")` and always returns a promise.
- **Fix (`export`)**: `download()` revoked the object URL in the same task as
  `click()`, which can cancel the download in Safari and Firefox. The revoke is
  now delayed by 30 s.

## 0.13.1

- **`el()`: read-only DOM props fall back to the attribute.** Passing `list`
  (or `form`, or any other getter-only property) to an `<input>` threw
  "Cannot set property list … which has only a getter", because `el()` assigned
  every key that exists on the element as a property. A prop with no setter now
  goes through `setAttribute`/`removeAttribute`. The check is cached per element
  type.

## 0.13.0

A batch of community fixes (thanks @mihailozepina, #1–#27).

- ⚠️ **BREAKING (`export`): `toCSV` guards against CSV/formula injection by
  default.** String cells and header labels starting with `=` `+` `-` `@` or a
  tab/CR get a leading `'` so Excel/Sheets show them as text. Numbers, numeric
  strings — plain or formatted (`"-1,234.50"`, `"-10%"`, `"-$5"`) — and a lone
  `"-"` are left alone, so `format` output stays numeric. Opt out with
  `toCSV(rows, columns, { formulaGuard: false })`. (#22)
- ⚠️ **BREAKING (`collection`/`table`): a consistent sort order.** The old
  `a > b ? 1 : -1` comparator broke `Array#sort` on null/undefined/mixed values.
  The new default (exported as `compareValues`) sorts missing values last in
  both directions, numbers and Dates numerically, and strings in natural,
  locale-aware order: `"item 2"` before `"item 10"`, and `"a"` before `"B"`
  (code-unit order put `"B"` first). (#11)
- ⚠️ **BREAKING (`forms`): radio groups get a unique `name`**
  (`qrp-radioN-<key>`, was the key), so two forms over the same key no longer
  share one group. Flat dotted keys (`{ "server.port": … }`) are bound as-is
  instead of being split into a nested path. (#10)
- ⚠️ **Types: `TableOptions<T>` is now a union type alias** (`rows` or `view`).
  An `interface X extends TableOptions<T>` should extend `TableBaseOptions<T>`.
  `tablePager`/`tableSummary` accept a `dataGrid`, and toast payload types match
  what the runtime accepts. (#23)
- **Core: `list()` follows every in-place array mutator** (`sort`, `reverse`,
  `splice`, `unshift`, `shift`, `fill`, `copyWithin`, `rows[i] = x`), re-running
  once per call against the final array. `unshift`/`shift` used to re-run
  mid-operation and drop a row with a bogus duplicate-key error. (#1)
- **Core: `list()` rows may render several nodes or a `when()`.** Only the first
  node was kept, so a row returning a `when()` vanished after a flip. `itemFor`
  resolves nodes inside such rows. (#2)
- **Core: `scope()`/`scoped()`/`mount()` own their effects inside a running
  effect**, and the enclosing effect disposes them on re-run. (#3)
- **Core: `el()` prop fixes.** `null`/`undefined`/`false` on a DOM property
  removes it instead of rendering `"null"`/`"false"` (`href: null`,
  `class: () => on && "x"`); `false` still means `"false"` on `aria*` props and
  `contentEditable`. `bind` applies after the other props (so `type` is set
  first), and a style object sets `--custom` properties. (#4)
- **Core: `list()`/`when()` no longer throw after their container is cleared.** (#5)
- **Router: `currentRoute` updates atomically** (an effect never sees a new
  path with old params), and a stale View Transition swap no longer mounts the
  wrong page on fast A → B → A navigation or after `dispose()`. (#6)
- **`resource`: documented that `asyncView` builds a branch once per phase.**
  Read `res.data` inside the data branch (`() => list(() => res.data, …)`) to
  follow reloads; the branch is not rebuilt per value. (#7, docs only)
- **`http`:** an aborted request no longer emits `error`; only `scheme://` URLs
  skip `baseUrl` (`"httpbin/x"` used to; a protocol-relative `//host` is treated
  as a path so the token never leaves the origin); a custom `fetch` that throws
  synchronously rejects and releases the loader. (#8)
- **`html`:** renderables (`when`/`list`/userland) render in `html` holes, SVG
  attribute holes use `setAttribute`, and `html.template` wires `on*` handlers. (#9)
- **`collection`: `pageIndex()`** returns the clamped page that `items()` shows;
  `tablePager`, `tableSummary` and `datagrid` use it, so a filter that shrinks
  the set no longer reads "Showing 91–25 of 25". (#12)
- **`datagrid`: `toggleAll()` "off" deselects only the filtered rows**, keeping
  selections the filter hides (symmetric with `selectAll`). (#13)
- **`toasts`:** a repeat message is deduped only onto a toast still on screen;
  the stock renderer is a keyed `list()`, so enter animations don't restart. (#14)
- **`events`:** each `on()` returns an unsubscribe for that subscription only
  (the same handler twice no longer leaks); `fromEvent` unsubscribes on dispose;
  the no-`BroadcastChannel` fallback gets `close()` and its `emit` reaches the
  channel. (#15)
- **`busyWhile`: `run()` inside an effect no longer subscribes it to the
  counter**, which re-ran the effect forever (unbounded memory). (#16)
- **`browser`:** `persisted` survives a throwing `localStorage` (quota/private
  mode); `poll().stop()` isn't undone by the tab becoming visible again, and
  `start()` while hidden waits for visibility; odd cookies (`%`, no `=`) parse. (#17)
- **`trapFocus` skips elements Tab can't reach** (`tabindex="-1"`, `[hidden]`,
  `[inert]`, not rendered), so focus no longer escapes the dialog. (#18)
- **`spark`:** null/NaN points are gaps (the line splits) instead of throwing or
  producing NaN paths, and very large series no longer overflow the stack. (#19)
- **`format`:** invalid dates return `""` instead of throwing;
  `minimumFractionDigits` above the default maximum works; values are rounded
  before the unit is picked (`"1 minute"`, not `"60 seconds"`). (#20)
- **`utils`:** `memoize` keeps its expiry map bounded by the LRU, an evicted key
  doesn't inherit a stale expiry, and a promise settling after `invalidate()`
  can't clobber the new entry; `precacheWithRefresh` ignores out-of-order
  responses and stops when its scope is disposed; `loadScript` has no unhandled
  rejection; `validate` handles `/g` and `/y` patterns. (#21)
- **Tooling:** lint covers every module and `bin/`; CI also builds, packs and
  checks `docs/API.md` is in sync; `gen-api` no longer truncates signatures at
  `=>`. (#24, #25, #27) Docs: read `Object.entries` list items through the item. (#26)

## 0.12.2

- **Fix: `setOwner()` (and so `portal()`) could re-enter the running effect.**
  It bumped the readers' version synchronously; `portal()` runs inside an
  overlay's open effect, so an effect that also read a context re-ran in the
  middle of opening — and could open the overlay again, recursively. Owner
  changes now re-run readers on a coalesced microtask. `provide()` stays
  synchronous (readers built earlier in the same construction rely on it).

## 0.12.1

- **Fix (regression in 0.12.0): `toasts.dismiss()` ignored items flagged
  `removed` by someone else.** 0.12.0 skipped any toast already marked
  `removed`, meant to make a repeat dismiss during qrp's own exit phase a no-op —
  but a renderer running its own exit animation (setting `removed`, then calling
  `dismiss()` to delete, as 0.11 code did) never got its toast deleted. Only a
  toast inside qrp's own `exitMs` window is skipped now.

## 0.12.0

- **New module: `context`** (`@nemanjan00/qrp/context`). `createContext(fallback)`
  returns `{ provide, read, watch, find }`: a subtree provides a value, descendants
  read the nearest one by walking DOM ancestors — the missing piece for compound
  components (Tabs → its triggers, a sidebar → its parts) without threading a
  controller through every call. Children are built before their parent, so
  `read` is reactive: `provide()` re-runs readers that ran too early, and a
  reader whose node is still detached (a `list()`/`when()` row being inserted)
  gets one microtask retry. `watch(node, fn)` binds a read to an element (a
  reactive prop can't reference the element `el()` is still building).
  `setOwner(node, owner)` gives portaled content a logical parent;
  **`portal()` now records it** (the node's previous parent, or
  `options.owner`), so a menu moved to `<body>` still reads its component's
  context.

- **`toasts`: ids, updates, per-toast duration, pause/resume, an exit phase.**
  `push()` (and the variant helpers) return the toast id; `meta.id` updates the
  live toast with that id instead of adding one; `meta.duration` is a per-toast
  timeout (0 / `Infinity` = sticky); any other meta field (`description`,
  `action`, …) stays on the item for renderers. New `update(id, patch)` (merges
  reactively; a `duration` in the patch restarts the countdown), `pause(id?)` /
  `resume(id?)` (keep the remaining time; no id = all), and
  `createToasts({ exitMs })`: `dismiss()` marks the item `removed: true` and
  deletes it after `exitMs` so a renderer can animate the exit (default 0 =
  today's behavior; pushing the same id during the exit revives it). Any variant
  string works (`bus.emit("toast", { variant: "loading", … })`, or extra event
  names via `createToasts({ variants })`); object bus payloads pass their extra
  fields through as meta; a deduplicated message returns the original id. The
  stock `component` pauses a hovered toast and adds `qrp-toast-exit` while it
  leaves.
- **`datagrid`: multi-row writes are batched.** `selectAll`, `clearSelection`,
  `toggleAll` and `setPageSize` run in one `batch()` — an "n selected" counter
  or header checkbox re-runs once per call, not once per row.
- **`table`: share a view, set attributes per part.** `view` renders through an
  existing `collection()` or `dataGrid` instead of building a second collection
  (the view owns rows/sort/filter/page, so those options and `filterFn` are
  ignored) — a toolbar or pager reading the same view always agrees with the
  table. `attrs: { tr: item => ({…}), td: (column, item) => ({…}), th: column =>
  ({…}) }` are reactive attribute hooks next to `classes` (e.g. `data-state` /
  `aria-selected` on a selected row); `null`/`false` removes, `true` sets empty,
  attributes the hook stops returning are removed.

- **`spark`: several series, one chart.** `xDomain` / `yDomain` (`[min, max]` or
  a thunk) put several sparks on shared axes — layer their `<svg>`s for
  actual-vs-target or multi-series charts. `base` is the y baseline areas fill
  down to and bars grow from (bars still default to zero; lines/areas to the
  data's extent).
- **`spark`: `curve`** — `"linear"` (default), `"monotone"` (never overshoots),
  `"natural"` (cubic spline) or `"step"` for lines and areas.
- **`spark`: stacking and grouped bars.** `stack` (array aligned with the data,
  or `(d, i) => number`) is a per-point baseline for stacked areas and bars;
  `group: [slot, slots]` places the slot-th of `slots` bars in each band, with
  `gap` (default 0.2 — today's 80% bar) and `radius`.
- **`spark`: `responsive`.** The `<svg>` fills its container and strokes get
  `vector-effect: non-scaling-stroke`, so stretched lines keep their width.
- **New: `project(source, opts)` in `spark`** returns the points the marks are
  drawn from (`{ x, y, y0, index, datum }`, bars add `width`/`left`) — hit-test a
  pointer against them for your own tooltip or cursor.
- **New: `nice(domain, count)` in `scale`** rounds a domain out to whole 1/2/2.5/5
  × 10ⁿ steps → `{ domain, step, ticks }`, float noise removed.
- All spark defaults render as before (checked byte-for-byte against 0.11.0
  for lines, bars and dots); area paths now trace the baseline back point by
  point — same filled shape, different path text.

## 0.11.0

- ⚠️ **BREAKING (behavior): `dismissable` is nesting-aware.** All live
  dismissables now form one layer stack. Escape dismisses only the most recently
  opened layer that listens for it, and an outside pointerdown dismisses layers
  from the top down, stopping at the layer it landed in — so a click inside a
  popover opened from a dialog closes neither, and a click in the dialog closes
  just the popover. Before, every open dismissable reacted on its own: nested
  floating UI closed its parent, and one Escape closed everything. If you had two
  unrelated dismissables open at once and relied on one Escape closing both, the
  newer one now closes first. New options: `inside` (extra nodes that count as
  inside, e.g. the trigger) and `modal` (outside clicks don't reach the layers
  below). Document listeners now exist only while a layer is open.
- **`anchored`: sides, alignment, flip and shift.** New options `side`
  (top/right/bottom/left; `placement` stays as an alias), `align`
  (start/center/end, default start), `sideOffset` (alias of `gap`),
  `alignOffset`, `collisionPadding`, `avoidCollisions` (flip to the opposite side
  when it fits better — both directions now — and shift along the cross axis).
  It writes `data-side`/`data-align` and the CSS variables
  `--qrp-transform-origin`, `--qrp-anchor-width/-height`,
  `--qrp-available-width/-height`, accepts a virtual reference, and re-places on
  floating-element resize. New `pointAt(x, y)` for context menus. Default options
  give the same positions as before whenever the preferred side fits; when
  neither side fits it now picks the roomier one (before: overflowed the bottom),
  a top placement can flip down, and the element is kept on screen horizontally.
- **`disclosure`: controlled modes + richer `connect`.** `disclosure(initial,
  { onChange })` — `initial` may be a boolean (as before), a `[state, "key"]`
  tuple (two-way bound) or a thunk (driven: toggles only call `onChange`).
  `connect(trigger, panel, { hide, disabled })` also sets `data-state` and
  `aria-controls`; `hide: false` leaves visibility to your CSS so the panel can
  animate.
- **`table`: design-system class hooks.** `classes: { thead, headRow, th, tbody,
  tr, td, expandRow, expandCell }` (`tr` may be `item => string`) adds classes
  next to the stable `qrp-*` ones; `sortIndicator: (dir) => Renderable` replaces
  the ▲/▼ text; sortable headers get `aria-sort`. `tablePager` takes `classes: {
  nav, button, active, gap }`.
- **`forms`: `field()` labels button-based controls.** A custom input type that
  renders a `<button>` (a styled checkbox or switch) now gets its `<label for>`
  linked like native inputs (also `meter`/`output`/`progress`).

## 0.10.0

- **New: `batch(fn)` in core.** Writes inside `fn` apply immediately, but the
  effects they trigger are held back and run once each after `fn` returns,
  against the final state. Before this, a multi-key update (`store.overall = …;
  store.latencyBounds = …`) re-ran effects after every write, so an effect reading
  both keys could briefly see the new value of one next to the old value of the
  other. Batches nest; the flush runs in effect creation order (owners before the
  effects they own, so a child the parent is about to dispose never gets a wasted
  run); a throwing effect doesn't skip the others, and the first error is rethrown.
  Adds ~0.14 KB gzip to core.
- **The package now ships source maps.** Every `dist/*.js` has a `.js.map` with
  the original source embedded, so devtools show the commented source when you
  debug an app built on qrp. No runtime cost; the tarball is larger.
- **Docs: table cells are reactive without thunks.** `table()` already wraps
  every `render:`/`formatter:` cell and the `expandable` panel in a thunk; this is
  now documented (the `Column.render` JSDoc, SHARP-EDGES). Inner thunks only make
  the update finer.

## 0.9.6

- **`table({ expandable })`: an OPEN detail panel now refreshes on refetch.** A
  custom `render:` cell is a thunk, so it re-runs when the row's item is
  replaced — but the expandable panel was built once, so on a live dashboard it
  kept showing the values it was opened with while the row's own cells updated
  around it. It is a thunk now too (the panel rebuilds when the item is
  replaced, same as a render cell).
- **Docs: writing to the raw object instead of the proxy.** `state()` returns a
  proxy and the original object is still reachable; writes that go straight to
  it notify nothing. Next to a sort this reads as a *mis-sorted* table rather
  than a stale one — the sort re-runs on the new values while the cells still
  show the old. New
  [cheatsheet section](docs/GETTING-STARTED.md#the-third-footgun-writing-to-the-object-instead-of-the-proxy).

## 0.9.5

From a field report: a table whose headers did nothing.

- **`table()`/`collection()` accept a plain object for `sort` (and `page`,
  `filter`).** The docs show `state({ key, dir })`, and the types accept a
  bare `{ key: "count", dir: -1 }` structurally — so a literal typechecked,
  rendered the correct INITIAL order, and then ignored every header click: the
  sort indicator stayed on the starting column and the rows only re-sorted the
  next time the DATA changed. On a dashboard pushing a snapshot every couple of
  seconds that reads as "sorting takes two seconds", which sends you profiling
  layout instead of reactivity. These options are now wrapped in `state()`
  (idempotent, so passing `state({...})` still hands back *your* object and your
  reference keeps working).
- **Docs: transitive tracking is now spelled out.** An effect depends on every
  key read *while it runs*, including reads inside functions it calls — so
  `effect(() => { theme.revision; render(); })` silently subscribes to whatever
  `render()` reads. New
  [section in the cheatsheet](docs/GETTING-STARTED.md#the-other-footgun-tracking-is-transitive)
  and expanded `effect`/`untracked` reference docs.

## 0.9.4

From a field report: a silent 404 with a confusing cause.

- **`createHttp({ baseUrl })` now joins `baseUrl` and the path on exactly one
  `/`.** `baseUrl: "/api/v1"` + `http.get("dimensions")` concatenated naively
  into `/api/v1dimensions` — a 404 at runtime that nothing warned about (the
  docs' examples all happen to pass a leading slash). A slash on either side,
  both, or neither now all produce `/api/v1/dimensions`. Absolute (`http…`)
  URLs, an empty `baseUrl`, and query-only paths (`"?page=2"`) are unchanged.

## 0.9.3

From a field report: the one thing that cost a user fifteen minutes.

- **`list()` reacts to in-place array mutation again.** The reconcile effect
  unwrapped the source array (`raw(source())`) before iterating, so it only ever
  tracked the *key* holding the array — `store.rows = next` re-rendered, but
  `store.rows.push(row)` / `splice` / `pop` did **not**. It now touches `.length`
  through the proxy first: one extra tracked read, keeping the raw-iteration
  fast path (no per-element proxy tax). The `push`-driven example in the getting
  started guide works as documented.
- **Docs: the `...arr.map()` footgun is now loud.** A spread of `.map()` reads
  reactive state and looks correct, but renders once — the spread runs before
  `el()` is called, so there's no function to re-run. New
  [reactivity cheatsheet](docs/GETTING-STARTED.md#7-the-reactivity-cheatsheet)
  (function re-runs vs value-evaluated-once, in one table), a matching
  [sharp edge](docs/SHARP-EDGES.md), and a **reactive `<select>` recipe**
  (live options + live selection).

## 0.9.2

Fixes from a second production port's field report (a loan dashboard).

- **`list()`: non-proxyable rows are rebuilt on replacement, not silently
  frozen.** A row whose item `state()` can't wrap (a **frozen** object — the
  documented reactivity opt-out — a primitive, or an exotic instance) has
  bindings that can never update; when a replacement item arrived under a
  surviving key (a refetch, or a `derive()` rebuilding the array wholesale), the
  row kept showing stale data and the rebind merge then **threw**
  (`Cannot assign to read only property`) on frozen items. Such rows are now
  rebuilt with fresh bindings; normal rows keep the in-place rebind + element
  reuse — including items that arrive *already proxied* (the idiomatic
  `() => store.rows.filter(...)` source reads elements through the proxy).
  Related: a frozen *nested* object inside a reactive row is now replaced
  wholesale instead of merged into (which threw).
- **Unhandled effect errors `console.error` by default.** An effect that throws
  is still torn down and the error still propagates — but if no `onEffectError`
  handler is registered, qrp now also reports it to the console (effect name +
  phase). A component dying during `mount()` was previously invisible when the
  caller swallowed the propagated throw: a blank page with an empty console.
  Registering any `onEffectError` handler takes over and silences the default.
- **Docs, from the same field report:** SHARP-EDGES entry on freeze × `list()`
  rows (and that `derive()`-rebuilt arrays are the normal, supported case);
  `dismissable` now documents the same-click-that-opened guarantee (next-tick
  listener — no `stopPropagation` needed at the opener); a debounced-commit
  recipe in `forms`; a multi-series shared-scale chart recipe in `spark`; a
  stronger "mix `` html`` `` and `el()` past ~3 levels of static nesting" nudge
  in the tutorial.

## 0.9.1

- **`spark`: single-point / flat series now render centered** instead of pinned
  to the bottom-left corner. A degenerate extent (one snapshot, or a perfectly
  flat line) maps to the middle of the axis, so a chart looks tidy before it has
  history. (`scale.linear`'s zero-span behavior is unchanged; the fix is in
  spark's projection.)
- **`spark` docs:** clarified that the mark uses `currentColor` (inherits text
  colour, theme-friendly) and that `axis: true` draws only a baseline rule (no
  tick labels — a primitive); for labels, add your own `<text>`/caption.

## 0.9.0

- **Six new optional helper modules** — separate opt-in subpaths, zero-dep,
  pay-for-what-you-import. Grounded in what real dashboards rebuild by hand:
  - **`format`** — Intl-backed pure formatters: `num`, `compact`, `pct`, `bytes`,
    `duration`, `relTime`, `date`. Nullish/NaN → "" (safe inside a binding).
  - **`resource`** — reactive async data (`{ data, loading, error, reload }`) over
    a fetcher thunk; transport-agnostic (composes with `http` without coupling).
    Optional `refreshOn` wires it to the event bus — `bus.emit("refresh")` reloads
    every listening resource. `asyncView(res, {...})` maps state → `when` branches,
    killing the loading/error/empty boilerplate.
  - **`spark`** — a charting *primitive* (not a library): data → a reactive `el()`
    `<svg>` (line/area/bar). No tooltips/legends — the sparkline 80%. Enabled by
    0.8.0's SVG-aware `el`; composes `scale`.
  - **`scale`** — micro scales (`linear`/`ordinal`/`quantize`/`ticks`) + a
    colourblind-safe categorical `palette`.
  - **`timeseries`** — pure `{x,y}` math: `deltas`, `rate`, `rolling`, `bucket`,
    `downsample` (LTTB). Pairs with `spark`.
  - **`export`** — `toCSV` / `download` / `copy`; pairs with table/collection.
- **`browser` gains `poll(fn, ms)`** — scope-aware interval (cleared on dispose)
  that pauses while the tab is hidden (composes `visible()`).
- **Docs:** GETTING-STARTED now leads the no-build path with a vendored `dist/` +
  import map (the common self-hosted usage), CDN reframed as demo-only.
- Whole library ~22.3 KB min+gzip — but you only pay for what you import; core is
  unchanged at ~4.7 KB.

## 0.8.0

- **`el()` is SVG-namespace-aware.** SVG tags (`svg`, `path`, `circle`, `rect`,
  `text`, gradients, filters, `foreignObject`, …) are now created with
  `createElementNS`, so they actually render, and their attributes (`d`,
  `viewBox`, `fill`, `cx`, and `class`) go through `setAttribute` (`className` is a
  read-only `SVGAnimatedString`). Before this, `el("svg", …)` landed in the HTML
  namespace and rendered nothing — you had to hand-build charts with the `html\`\``
  module. Dual-namespace tags (`a`/`title`/`script`/`style`) stay HTML. Reactive
  SVG attributes work like any other (`y1: () => s.y`).
- **Docs:** the reactive-dictionary pattern (`list(() => Object.entries(x), …)`)
  and the SVG note added to SHARP-EDGES; `el()`'s attribute rules — SVG, and
  `false`/`null` **removing** an attribute (so `disabled: () => x` toggles it) —
  spelled out in the API reference.

## 0.7.0

- ⚠️ **BREAKING: removed `define()` (custom-element registration).** Authoring
  Custom Elements is tangential to "turn data into a dashboard" — it was more a
  "look, no `class extends`" flex than something a dashboard needs — so it's gone,
  per do-one-thing-well. Core drops to ~4.4 KB min+gzip. `mount()`/`scoped()`
  cover in-app component lifecycles; if you specifically need to expose a qrp
  widget as a real HTML tag in a *foreign* page, `define` was ~50 self-contained
  lines (`state` + `scope` + `clear`) that can live in userland.

## 0.6.1

- **"Read SHARP-EDGES before implementing" callout** at the top of the README and
  the API reference (added to the generator, so it survives `npm run docs`) — the
  gotchas doc ships in the package now, so point readers and coding agents at it
  before they hit thunk-vs-value or a duplicate key.
- **API reference now documents `list()`'s `onDuplicateKey`.** The option shipped
  in 0.6.0 but its generated `API.md` section lagged; regenerated so the reference
  matches the types. Docs only.

## 0.6.0

- **`dist/` is a flat per-module minified mirror — no code-splitting, no
  chunks.** Was: esbuild `splitting` produced a shared core chunk plus opaque
  `chunk-*.js` files, so self-hosting meant serving hashed chunks. Now each module
  is minified in place to `dist/<name>.js` (same names, no hashes); cross-module
  imports stay relative (`table.js` → `./qrp.js`), so the core is still shared
  (imported once, not inlined) and bundlers still tree-shake — but vendoring is
  just "copy `dist/`". Whole library ~18.7 KB min+gzip (core ~4.6 KB).
- **`list(src, key, render, { onDuplicateKey })`.** Duplicate keys still drop the
  row (a node lives in one place), but the report is now `console.error` by
  **default** (was `console.warn`) — CI/test harnesses fail on it, so the silent
  "missing rows" symptom gets caught. Opt into `"throw"` (fatal, dev/CI) or down
  to `"warn"`.
- **Docs: qrp is build-*optional*, not build-*forbidden*.** The old "zero build /
  no bundler" wording led readers — humans and coding agents reading the shipped
  docs — to think a bundler was unsupported. Reworded README, package
  `description`, getting-started, and site to frame the build as a free choice:
  `<script type="module">` with no tooling, **or** any bundler (Vite/webpack/
  Rollup/esbuild) — same library.
- **Docs: vendoring is the recommended no-build path; CDN is demo-only.** A flaky
  CDN import blanks the whole page with no graceful degradation, so the Install
  section now leads with vendored `dist/` + an import map (rock-solid, offline)
  and frames a CDN as fine-for-a-prototype only.
- **Docs: headless testability called out as a first-class plus.** Because qrp
  writes the real DOM (no VDOM/hydration/test-renderer), you unit-test a component
  in a plain `node --test` script under `happy-dom` — mount, write state, assert
  the DOM. README shows the pattern (a table going 0→3 rows on a state write).

## 0.5.2

- **The package now ships the docs.** `docs/*.md` (API reference, getting
  started, sharp edges, styling) and `CHANGELOG.md` are in the npm tarball, so the
  full reference travels with the install — a coding agent (or a human) reads the
  API straight out of `node_modules`, offline, no repo visit. Also fixes the
  README links that previously pointed at files an npm reader didn't have (they're
  relative again, resolving to the shipped `docs/`). Adds ~30 KB to the packed
  tarball. Runtime code is unchanged.

## 0.5.1

- **Runaway-effect guard reworked from wall-clock rate to re-entrancy depth.**
  0.5.0's guard (inherited from 0.4.10) counted an effect's runs in a ~1s window,
  which false-flagged a legitimately *hot* effect — thousands of sequential
  updates to one cell (bulk writes, animation, a benchmark) — as a runaway and
  tore it down. The guard now detects the true signature — an effect re-entered
  while already on the stack (the A→B→A cascade / stack-overflow class) — via
  re-entrancy depth. Sequential hot updates never re-enter (depth stays 1), so
  they're never flagged; the synchronous cascades that matter still are.
  `loopLimit` now bounds depth (same default 1000; `Infinity` disables). Async
  self-loops aren't re-entrant so aren't caught here — but `createHttp`'s loader
  is leak-free (0.4.10), which removed the one that shipped in practice.

## 0.5.0

- **New module: `datagrid`** (`@nemanjan00/qrp/datagrid`, ~0.8 KB gzip). A
  headless data-grid state machine over `collection()` — row selection
  (select-all + indeterminate, keyed so it survives sort/filter/page and
  refetch), column visibility, page-size, and a windowed pager. State only, no
  markup (the batteries every admin table rebuilds). `grid.items()` feeds a
  `list()`/`table()`.
- **`collection().filtered()`** — the full filtered set (unpaged, unsorted), for
  select-all-across-pages / export / match counts. (Powers `datagrid`.)
- **Behaviors auto-register teardown with the current scope.** `portal`,
  `dismissable`, `trapFocus`, and `anchored` now call `onDispose` internally, so
  building them inside `scoped()`/`mount()` means `dispose()` alone tears down
  effects AND behaviors — no hand-tracking the undos. The undos are still
  returned and are now idempotent (manual call + scope dispose is safe).
- **`query({ arrays })` — first-class multi-value URL params.** Declared keys are
  always arrays (absent → `[]`), parsed from and serialized to the repeated-key
  form (`?status=a&status=b`). Default keys stay string-valued (unchanged).
- **Marker mis-append now logs at `console.error`** (was `warn`) — so a bare
  `parent.append(when(…))` in headless/CI surfaces (most harnesses fail on
  console.error); the in-DOM breadcrumb is unchanged.

## 0.4.10

- **`createHttp` no longer leaks the loader subscription into a caller's effect.**
  The in-flight counter's `loading.pending += 1` *reads* `pending`; issuing a
  request synchronously inside an `effect()` (the normal "refetch when filters
  change" pattern) subscribed that effect to `pending`, so every request re-ran
  it → another request → infinite recursion (`net::ERR_INSUFFICIENT_RESOURCES`,
  tab crash). The counter is now mutated `untracked`, so it stays reactive for
  legitimate loader-bar readers but never attaches to whoever issued the request.
  (The 0.4.10 runaway guard below is the safety net; this removes the cause.)
- **`createHttp({ fetch })` — pluggable transport.** Optional `fetch` option
  (defaults to the global) so you can mock the backend in tests or wrap it
  (retry, dedupe, circuit-breaker) without monkeypatching `globalThis.fetch`.
- **Runaway-effect guard.** An effect that (transitively) writes state it reads
  used to loop forever — synchronously until the stack overflowed, or, with an
  async loader, as an unbounded `fetch` loop ending in
  `net::ERR_INSUFFICIENT_RESOURCES` and a tab crash. The `runner === activeEffect`
  self-guard never caught it (async re-fires with no active effect; an A→B→A
  cascade never has A active when it re-runs). Effects now count their re-runs in
  a sliding ~1s window; past `loopLimit` (default 1000) the effect is torn down
  and reported through `onEffectError` with the new `phase: "loop"` — a catchable,
  named error instead of a dead tab. Opt out / tune per effect with
  `effect(fn, { loopLimit })` (`Infinity` disables). See
  [`docs/SHARP-EDGES.md`](docs/SHARP-EDGES.md).

## 0.4.9

- **Tree-shaking:** added `"sideEffects": ["**/*.css"]` so a consumer's bundler
  (webpack especially — it needs the flag) reliably drops unused re-exports.
  Importing one util from the barrel no longer pulls in the others; CSS imports
  stay side-effectful.

## 0.4.8

- **Markers self-diagnose a bare DOM append.** The one unsupported position —
  `parent.append(marker)` — used to fail as a silent `[object Object]`. Markers
  now `console.warn` and stringify to a `[qrp when() — render via el()/mount()…]`
  breadcrumb at the call site. (Can't fire in normal use — qrp routes markers via
  the renderable symbol before any string coercion.)

## 0.4.7

- **Public renderable protocol.** `Symbol.for("qrp.renderable")` — any object
  with `[renderable](parent)` renders in child position exactly like `when`/`list`
  (which are now just its first implementations; the normalizer no longer
  special-cases their brands). Userland can build peers — `switchOn`,
  `virtualList`, a suspense-alike — at full first-party parity, no wrapper element
  needed. The method appends its nodes and registers an `onDispose` that removes
  its own nodes + anchor (nested-teardown contract). Internal brands
  `__qrpWhen`/`__qrpList` were removed (they were undocumented).

## 0.4.6

- **Fix (P0): nested-marker teardown leak.** A `when()`/`list()` nested inside a
  parent marker's branch stranded its DOM when the parent switched (symptom:
  both tabs' content stacking). A marker now removes its **own** current nodes +
  anchor on disposal, instead of relying on the parent — which only tracked the
  nodes present at mount, missing anything a nested marker re-rendered since.
  Wrapper `<div>`s are no longer needed around nested markers.

## 0.4.5

- **`table` dynamic columns** — `fields` may be a thunk `() => Column[]` for a
  reactive column set (visibility toggle, role-gated columns). The header and
  each row's cells re-render on change; row elements are reused. Static `fields`
  arrays keep the build-once fast path (no regression).
- **`table` expandable rows** — `expandable: (item) => Renderable` renders a
  detail panel below a row (via `when()`, one `<tbody>` per row group). A row
  click toggles it (clicks on interactive cells are excluded); also
  `tableEl.toggleRow(key)` and the reactive `tableEl.expanded` map.

## 0.4.4

Round-four fixes from the production port's open list:

- **Markers render when returned** — a `when()`/`list()` marker returned from
  another branch, a `list()` render, a `mount()` component, or a reactive hole
  now renders instead of stringifying to `[object Object]`. (Only a bare non-qrp
  `parent.appendChild(marker)` is unsupported.)
- ⚠️ **`mount()` appends the component's RETURN value** — the documented
  `mount(parent, () => el(...))` style silently did nothing before; now it works
  (guarded so the append-to-view style doesn't double).
- **`onEffectError` context** — the handler's 2nd arg is now a documented
  `{ phase, name }` (`"create"` vs `"update"`, plus `effect(fn, { name })`)
  instead of the opaque internal effect.
- **`setQuery(params, { replace, merge })`** — persist filters/sort to the URL
  query without a remount (rides the same-pattern keep-alive; `currentRoute.query`
  updates reactively).
- **`tablePager(view)` + `tableSummary(view)`** — stock prev/pages/next control
  and "Showing X–Y of Z" summary over a `table().view` (or any collection).
- **`table` custom headers** — `field.header(column) => Renderable` for a
  select-all box / filter icon in a `th` (its clicks don't trigger the sort).

## 0.4.3

- ⚠️ **BREAKING (`validate`):** a **present-but-empty `""` is now validated**
  instead of skipped — so a `pattern`/`check` can reject empty on an *optional*
  patch field ("must not be empty"). Only **absent** (`undefined`/`null`) optional
  fields are skipped; `required` still fails on both. If you relied on optional
  `""` bypassing all checks, add `check: (v) => v === "" || …` or omit the key.
- **`validate(schema, data, { strict })`** — opt-in rejection of keys the schema
  doesn't declare (recursively). Default stays permissive (unknown keys pass into
  `value`).

## 0.4.2

- ⚠️ **BREAKING (`validate`):** now **coerces + returns `{ errors, value }`**
  instead of an errors array. Form strings become their declared type
  (`"5"→5`, `"true"→true`), checks run on the coerced value, and `value` is ready
  to `PATCH`. Migrate `const errs = validate(...)` → `const { errors, value } = validate(...)`.

## 0.4.1

- **Fix (packaging):** `dist/utils/` shipped without
  `debounce`/`limit`/`validate`/`load-script` in 0.4.0, so the deep `./utils/*`
  subpaths 404'd (the `@nemanjan00/qrp/utils` umbrella worked). The build now
  derives its entry list from the filesystem, and a build guard fails
  `prepack`/`publish` if any `exports` subpath has no built file.

## 0.4.0

Behavioral fixes from a production port's field report — all ⚠️ **BREAKING** in
the sense that they change runtime behavior (mostly bug→correct):

- **`when()` is value-keyed** — re-renders when the condition's *value* changes,
  not just on truthy⇄falsy. Value-switches (tabs) work directly:
  `when(() => tab, t => TABS[t]())`. (Was: stuck on the first truthy value.)
- **`list()` rebinds surviving rows** — a row whose key survives a refetch now
  reflects the fresh object (bounded recursive merge, nested proxy identity
  preserved, dropped keys removed, cycle-safe). (Was: showed the object it was
  built with.)
- **`table` render cells are reactive** — custom `render(...)` cells re-run when
  the row's item is replaced. (Was: built once per key.)
- **`form()` renders the `fields` spec** — a field shows even before the server
  sends its key; unknown settings keys no longer leak in as inputs. Adds
  dotted-path nesting (`"wifi.ssid"`) + default seeding. (Was: iterated
  `Object.keys(settings)`.)
- **Router keep-alive** — same-pattern navigation (a `:param`/query change like a
  tab switch) no longer tears down and remounts; in-pane state survives and the
  handler reacts through `currentRoute`. Pass `{ remount: true }` for the old
  behavior.

Additive: `onEffectError`, reactive `currentRoute`, `scoped()`, http
`responseType` (json/text/arraybuffer/blob/response), `memoize({ ttl, invalidate })`,
`lru.clear`, `utils` `limit`/`debounce`/`throttle`/`validate`/`loadScript`,
`anchored({ matchWidth })`, forms style passthrough (any non-meta field-spec key
reaches the control). API.md now inlines supporting-type definitions.

## 0.3.0

Additive — the field report's P0s: `onEffectError`, reactive `currentRoute`, http
`responseType`, `utils/limit` (concurrency + rate + timeout, the `queue-promised`
core distilled dependency-free), `utils/debounce` + `throttle` (scope-aware), and
forms style passthrough. No breaking changes.

## 0.2.1

- **`forms`:** `field()` associates its `<label>` with the control (`for`/`id`)
  for a real label relationship (fixes the Lighthouse `select-name`/`label` gaps).

## 0.2.0

- The npm package now ships a **minified, code-split `dist/`** (esbuild) + the
  hand-written `.d.ts` — not the raw source. `exports` map points at `dist/`.
  Consumer still runs zero build. Core ~3.9 KB, whole library ~17 KB min+gzip.

## 0.1.1

- First public release under the scoped name **`@nemanjan00/qrp`** (plain `qrp`
  was taken), MIT licensed.

## 0.1.0

- Initial internal version.
