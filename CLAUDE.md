# qrp — project guide for Claude

qrp is a **data-first, declarative, low-overhead framework for dashboards** —
zero runtime dependencies, no *required* build step, for the browser. It can
load straight from a `<script type="module">` with no tooling at all — **and** it's
a first-class ESM package you consume through a bundler (Vite/webpack/Rollup),
which gets you subpath imports + tree-shaking + types. Build-**optional** is the
point: qrp never requires a build and never forbids one. (It's MIT — consumers use
it however they like; docs/messaging must NOT imply a bundler is off-limits. Past
wording over-sold "zero build" to the point that readers — humans and AI — thought
a bundler was unsupported; keep it framed as a free choice.)

## What qrp is (and isn't)

It does **one thing well**: turn data into a dashboard (settings panels, forms,
tables, control UIs), with the least machinery possible. It is **not** a
general-purpose SPA framework competing with React. When weighing a feature, ask
"does this serve data-driven dashboards, kept small and declarative?" — if it
adds weight or ceremony for a use case outside that, it probably doesn't belong.

The four commitments that gate every design decision:

1. **Data first** — reactive state (`Proxy`) is the single source of truth; the
   DOM reflects it.
2. **Declarative first** — describe *what* (forms as data, routes as patterns),
   not *how*.
3. **Low overhead** — no runtime boot, no hydration, no virtual DOM; keep the
   gzipped size and first-paint budget small.
4. **Do one thing well** — small, sharp, composable modules; include only what a
   dashboard needs.

## Always use the implement-js skill

When writing or changing JavaScript in this repo, **always follow the
`/implement-js` skill.** Apply its style rules:

- Tabs for indentation, double quotes for strings, semicolons always.
- `const`/`let`, never `var`. Never reassign function parameters — make a new
  variable instead.
- Functional style: `map`/`filter`/`reduce`/`forEach` over `for` loops.
- JSDoc on anything with an ambiguous signature (options objects, factories).
- Encapsulate complexity so call sites read like pseudocode.

## Deliberate deviations from implement-js (approved by the user)

The skill is written for Node/backend services. This is a browser library, so
two of its defaults do **not** apply here — keep it this way:

1. **ES modules, not CommonJS.** Use `import`/`export`. The user explicitly
   asked to keep modern modules — CommonJS would break `<script type="module">`
   loading and defeat the zero-build premise. (This overrides the skill's
   CommonJS rule.)
2. **`node --test`, not jest.** Tests use Node's built-in runner with
   `happy-dom` for a DOM. Adding jest would add heavy dependencies to a
   framework whose entire value is having none. Keep tests zero-runtime-dep.

The service pattern, `forever`/herokuish/`Procfile`, `got-verbose`, and
`queue-promised` sections of the skill are backend-only and don't apply to this
browser library.

## Layout

One folder per module, each with an `index.js` (per the skill's structure
rule). Cross-module imports use the explicit `../<folder>/index.js` path —
browser and Node ESM don't auto-resolve a bare directory to `index.js`, so the
`/index.js` is always written out.

- `qrp/index.js` — core: reactivity (`state`/`effect`/`derive`/`untracked`,
  `onEffectError` for central crash reporting — `phase: "loop"` when the
  runaway-effect guard tears down an effect that writes state it reads; tune with
  `effect(fn, { loopLimit })`), DOM (`el`, `reactive`, `bind`,
  `clear`), keyed lists (`list` — element reuse + `itemFor` delegation),
  conditional subtrees (`when` — swaps branch + disposes old scope), components
  (`mount`/`scope`/`onDispose`), routing
  (`router`/`navigate`/`compilePath`, reactive `currentRoute`). `state()` skips
  proxying frozen objects (freeze static data to opt out of reactivity).
- `html/index.js` — author DOM as HTML strings, three forms: `` html`` `` /
  `html()` (inline `${}` holes), `html.template("…#{field}…")` (STORABLE — parsed
  once, filled from a data object, reactive with state), and `ref(value)` (opt-in
  token to inject a live node into a plain concatenated string; no prototype
  patching). Holes: string→escaped text, `${()=>…}`→reactive, `onX`→listener.
  `${}` = JS interpolation (inline only); `#{}` = html-parsed (survives as text,
  hence storable).
- `forms/index.js` — declarative forms + open input-type registry
  (`registerInput`, `field`, `form`).
- `table/index.js` — declarative data table (collection + list): sortable
  headers, keyed row reuse, per-column accessor/formatter/render.
- `collection/index.js` — reactive sort/filter/paginate combiner; drives `list`.
- `browser/index.js` — reactive wrappers over native browser APIs.
- `events/index.js` — global event bus over native `EventTarget`.
- `toasts/index.js` — notifications driven by the bus (`notify.*`, `toasts`);
  content is any renderable.
- `http/index.js` — `fetch` wrapper (`createHttp`): URL shaping, auth headers,
  reactive in-flight loader, centralized errors → bus (`error`,
  `auth:unauthorized`), per-request `responseType` (json/text/arraybuffer/blob/
  response for binary + non-JSON). Auth-agnostic: takes a `token()` getter, emits
  `auth:unauthorized` rather than knowing about logout.
- `utils/*.js` — pure data helpers **that a dashboard actually needs**, one file
  per concept so file-level import = pay-for-what-you-use with no bundler:
  `memoize.js`, `lru.js`, `cache.js`, `paginate.js`, `limit.js` (concurrency /
  rate / timeout — the `queue-promised` wrapper core, dependency-free),
  `debounce.js` (`debounce`/`throttle`, scope-aware), `validate.js` (schema
  checker), `load-script.js` (reactive UMD loader); `index.js` is an opt-in
  barrel. (Keep this tight — "do one thing well." round-robin / weighted-pool
  style load-balancer helpers were removed because they don't serve dashboards;
  don't re-add general-purpose utilities that aren't dashboard-shaped.)
- `behaviors/*.js` — headless behaviors to build styled components (one file
  each): `portal`, `dismissable`, `trap-focus`, `anchored`, `disclosure`,
  `busy-while`. Carry platform/a11y hard parts; caller brings markup + CSS. The
  teardown-returning ones (`portal`/`dismissable`/`trapFocus`/`anchored`) also
  `onDispose`-register their (idempotent) undo, so building them inside
  `scoped()`/`mount()` means `dispose()` alone cleans up effects AND behaviors.
- `collection/index.js` — reactive sort/filter/paginate combiner over a
  dataset; `.items` drives a keyed `list()`. The `form()`-analog for data.
  `.filtered()` exposes the full filtered set (unpaged/unsorted) for
  select-all/export.
- `datagrid/index.js` — headless data-grid state machine over `collection`:
  keyed row selection (select-all + indeterminate; survives sort/filter/page +
  refetch), column visibility, page-size, windowed pager. State only, no markup
  ("helpers not components"); `grid.items()` feeds `list()`/`table()`.
- `table/index.js` — declarative data table over collection+list: column config
  (accessor/formatter/sortByFormatted/render/classes), sortable headers, keyed
  row reuse. Uses a per-key reactive HOLDER so cells reflect immutable row
  REPLACEMENT (refetch) without rebuilding the element. `key` option = the
  `:key` equivalent (a function → stable id).
- `qrp.css` — optional minimal baseline (design tokens + semantic classes);
  link it yourself, qrp never injects it. Styling guide: `docs/STYLING.md`.
- `proto/index.js` — prototype-level enhancement helpers.
- Optional helpers (all separate opt-in modules, zero-dep, pay-for-what-you-use):
  - `format/index.js` — Intl-backed pure formatters (`num`/`compact`/`pct`/
    `bytes`/`duration`/`relTime`/`date`); nullish → "".
  - `resource/index.js` — reactive async data (`{ data, loading, error, reload }`),
    transport-agnostic (fetcher thunk); optional `refreshOn` bus event(s) for a
    global refresh; `asyncView(res, { loading, error, empty, data })` → `when`.
  - `export/index.js` — `toCSV`/`download`/`copy`; pairs with table/collection.
  - `spark/index.js` — charting PRIMITIVE (not a library): data → reactive `el()`
    `<svg>` (line/area/bar). Enabled by SVG-aware `el`; composes `scale`.
  - `scale/index.js` — micro scales (`linear`/`ordinal`/`quantize`/`ticks`) +
    colourblind-safe `palette`.
  - `timeseries/index.js` — pure `{x,y}` math (`deltas`/`rate`/`rolling`/`bucket`/
    `downsample` LTTB); pairs with spark.
  - (`browser/index.js` also exports `poll(fn, ms)` — scope-aware interval, pauses
    while the tab is hidden.)

## Types & docs

- **`*.d.ts` next to every module** (hand-written) — importing `./qrp/index.js`
  resolves `./qrp/index.d.ts` automatically (no `@types`, no build). Generics
  flow through (`state<T>`, `list<T>`, `collection<T>`, `table<T>`). `Renderable`
  in `qrp/index.d.ts` is the shared child type (strings/nodes/arrays/functions/
  list()+when() markers). `npm run typecheck` = `tsc --noEmit` over the `.d.ts`
  + a usage suite (`test/types.ts`) in strict mode with `skipLibCheck:false`.
- **`docs/API.md`** — the API reference (curated). **`api.html`** renders it
  live with a qrp-built markdown renderer (single source — the site derives from
  the markdown; don't hand-duplicate API content into the page).
- **`docs/GETTING-STARTED.md`** — the tutorial (zero-to-dashboard, the five core
  ideas). **`start.html`** renders it with the same markdown renderer as
  `api.html` (same single-source pattern; it rewrites the `.md`'s doc-relative
  links — `./API.md` → `api.html`, `../examples` → `examples` — for the web
  context). Both pages' `slug()` is GitHub-compatible so cross-page `#anchors`
  from the docs line up.
- **`docs/API.md` is generated** from the `.d.ts` by `bin/gen-api.js` (`npm run
  docs`) — the `.d.ts` are the single source; don't hand-edit `API.md`. Curated
  module prose lives in `@module` doc-comments at the top of each `.d.ts`.
- **Minified build**: `bin/build.js` (`npm run build`, also `prepack`) bundles +
  minifies each module in place into `dist/` — a flat mirror (one file per
  module, same names, no hashes, no chunks); cross-module imports stay relative
  (`table.js` → `./qrp.js`) so core is shared, not duplicated, and vendoring is
  copy-the-dir. The npm package ships `dist/` (minified) + the hand-written
  `.d.ts` — **not** the raw source `.js` — plus `docs/*.md` + `CHANGELOG.md` (so
  the reference travels with the package: a coding agent reads the API straight
  out of `node_modules`). Core is **~4.6 KB min+gzip**, whole library ~18.7 KB.
  `dist/` is gitignored (rebuilt on pack/publish). The consumer still runs zero
  build. (No code-splitting: the opaque `chunk-*.js` files it produced made
  self-hosting on a plain static server confusing — the user rejected chunking.)
- NOTE (future / "another day"): `.d.ts` could be *generated* from JSDoc to make
  the code the single source — verified `tsc --declaration --allowJs` emits
  `.d.ts` from JSDoc, but `any`-heavy without `@template` generics. Enriching
  JSDoc + keeping the JSDoc→md generator is the north star.

Philosophy in practice: qrp ships **helpers to build (styled) components**, not
components. Table = collection + list; modal = portal + dismissable + trapFocus;
dropdown = anchored + dismissable + disclosure. Each helper is headless and
standalone (like forms' individual inputs); the combiners (form, collection) are
optional sugar.
- `test/*.test.js` — tests. `examples/*.html` — runnable demos.

## Gotchas learned the hard way

- **A DOM node lives in exactly one place.** Reusing "the same" content in
  multiple spots means a thunk `() => el(...)` or `cloneNode(true)`, never a
  shared live node.
- **The DOM rejects `Proxy`-wrapped nodes** (`appendChild` brand-checks →
  "not of type Node"). `reactive()` therefore unwraps to the raw node on
  insert; qrp auto-unwraps in `el`/`appendChild`/`toNodes`.
- **`state()` only wraps plain objects/arrays** — never DOM nodes, Map/Set, or
  class instances (wrapping detaches their branded internal slots). This is what
  makes it safe to stash a node or Map in reactive state.
- `examples/` — runnable demos (`index.html`, `todomvc.html`). Serve over HTTP;
  the router needs the History API.
- `test/` — `*.test.js`, run with `npm test`.

## Design principles (the reason this project exists)

- **Use the platform.** Wrap native `URL`, `URLSearchParams`, `EventTarget`,
  History API, IntersectionObserver, matchMedia — don't reinvent them.
- **Proxy for reactivity.** `state()` is a `Proxy`; reads track per key, writes
  trigger only dependent effects. `reactive(node)` proxies a DOM node so
  property assignment becomes a live binding.
- **No classes.** Objects and `__proto__`/`Object.create` throughout — never the
  `class` keyword.
- **Declarative over procedural**, especially forms.
- **Small core, everything else a peer.** The real core is Proxy tracking +
  ownership (`state`/`effect`/`scope`/`onDispose`). Everything above it consumes
  those primitives with NO privileged access: `table` = `collection` + `list`,
  `html` is an alternate front-end to the same renderer, and `when`/`list` are
  just the first implementations of the **renderable protocol**
  (`Symbol.for("qrp.renderable")`: an object with `[renderable](parent)` renders
  in child position). The normalizer (`appendChild`/`toNodes`) does NOT
  special-case `when`/`list` — it dispatches on the symbol, so a userland
  `switchOn`/`virtualList`/suspense composes at first-party parity. When adding a
  "core-adjacent" feature, prefer a renderable/peer module over touching the
  core. A renderable's `[renderable]` must remove its own nodes + anchor on
  `onDispose` (nested-teardown contract).

## Commands

- `npm test` — run the test suite (`node --test`, happy-dom).
- `npm run lint` — ESLint (`eslint:recommended` + the style rules above).
- `npm run typecheck` — `tsc --noEmit` over the `.d.ts` + `test/types.ts`.
- `npm run docs` — regenerate `docs/API.md` from the `.d.ts`.
- `npm run build` — build the minified `dist/` (esbuild; runs on `prepack`).

Package manager: **npm** (a `package-lock.json` is present, so per the skill use
npm, not yarn). ESLint is pinned to v8 with `@babel/eslint-parser@7` so the
classic `.eslintrc.json` config works; run the local binary
(`node_modules/.bin/eslint`), not `npx eslint` (which fetches a newer major).

## Pre-commit hook

husky + lint-staged run on every commit (`.husky/pre-commit`): `lint-staged`
(eslint --fix on staged `*.js`) then `npm test`. Config lives in `package.json`
(`lint-staged`) and `prepare: husky`.

## Releasing (do this in order — bumping AFTER publish causes drift)

The npm-published version is the source of truth; a missing git tag makes "is it
bumped?" unanswerable, so **tag every release**. Any change that reaches `dist/`
(anything under a shipped module, i.e. not docs/examples-only) needs a version
bump before it's published. Order:

1. **Land the code** (committed, green: `npm test` + `npm run typecheck` + `npm run lint`).
2. **Move the CHANGELOG `Unreleased` bullets into a new `## X.Y.Z` section.** Patch
   for fixes, minor for a new export/module (pre-1.0, so breaking changes can ride
   a minor/patch — mark them ⚠️). Never append post-publish changes to an
   already-published section.
3. `npm version X.Y.Z --no-git-tag-version` (updates package.json + lock), then
   commit as `X.Y.Z`.
4. `git tag vX.Y.Z` at that commit. (The user runs `npm publish` and
   `git push --tags` — the sandbox never publishes or pushes.)

`docs/` (the `.md` reference) and `CHANGELOG.md` **do** ship in the tarball —
they're the reference a coding agent reads straight out of `node_modules`, so
keep them accurate. But a docs-only edit still doesn't force its own bump; it
rides the next real release (it just means the published `.md` lags until then).
The site pages (`*.html`, `docs-site.*`) and `examples/` are **not** shipped, so
changes to those never need a bump. README ships too — keep its
size/benchmark/version numbers current.

## Keeping this file in sync

Update this CLAUDE.md and `README.md` whenever modules, exports, or conventions
change. If the user states a new code-style preference, also suggest adding it
to the `/implement-js` skill.
