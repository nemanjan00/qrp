# qrp — project guide for Claude

qrp is a **data-first, declarative, low-overhead framework for dashboards** —
zero dependency, zero build step, for the browser. The whole premise is that you
load it with `<script type="module">` and ship no compiler, no bundler, no
`node_modules` at runtime.

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

- `qrp/index.js` — core: reactivity (`state`/`effect`/`derive`/`untracked`),
  DOM (`el`, `reactive`, `bind`, `clear`), keyed lists (`list` — element reuse +
  `itemFor` delegation), conditional subtrees (`when` — swaps branch + disposes
  old scope), components (`mount`/`scope`/`onDispose`), custom elements
  (`define`), routing (`router`/`navigate`/`compilePath`). `state()` skips
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
  `auth:unauthorized`). Auth-agnostic: takes a `token()` getter, emits
  `auth:unauthorized` rather than knowing about logout.
- `utils/*.js` — pure data helpers **that a dashboard actually needs**, one file
  per concept so file-level import = pay-for-what-you-use with no bundler:
  `memoize.js`, `lru.js`, `cache.js`, `paginate.js`; `index.js` is an opt-in
  barrel. (Keep this tight — "do one thing well." round-robin / weighted-pool
  style load-balancer helpers were removed because they don't serve dashboards;
  don't re-add general-purpose utilities that aren't dashboard-shaped.)
- `behaviors/*.js` — headless behaviors to build styled components (one file
  each): `portal`, `dismissable`, `trap-focus`, `anchored`, `disclosure`,
  `busy-while`. Carry platform/a11y hard parts; caller brings markup + CSS.
- `collection/index.js` — reactive sort/filter/paginate combiner over a
  dataset; `.items` drives a keyed `list()`. The `form()`-analog for data.
- `table/index.js` — declarative data table over collection+list: column config
  (accessor/formatter/sortByFormatted/render/classes), sortable headers, keyed
  row reuse. Uses a per-key reactive HOLDER so cells reflect immutable row
  REPLACEMENT (refetch) without rebuilding the element. `key` option = the
  `:key` equivalent (a function → stable id).
- `qrp.css` — optional minimal baseline (design tokens + semantic classes);
  link it yourself, qrp never injects it.
- `proto/index.js` — prototype-level enhancement helpers.

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
  History API, custom elements, IntersectionObserver, matchMedia — don't
  reinvent them.
- **Proxy for reactivity.** `state()` is a `Proxy`; reads track per key, writes
  trigger only dependent effects. `reactive(node)` proxies a DOM node so
  property assignment becomes a live binding.
- **No classes.** Objects and `__proto__`/`Object.create`, including for custom
  elements (registered without `class extends`).
- **Declarative over procedural**, especially forms.

## Commands

- `npm test` — run the test suite (`node --test`, happy-dom).
- `npm run lint` — ESLint (`eslint:recommended` + the style rules above).

Package manager: **npm** (a `package-lock.json` is present, so per the skill use
npm, not yarn). ESLint is pinned to v8 with `@babel/eslint-parser@7` so the
classic `.eslintrc.json` config works; run the local binary
(`node_modules/.bin/eslint`), not `npx eslint` (which fetches a newer major).

## Pre-commit hook

husky + lint-staged run on every commit (`.husky/pre-commit`): `lint-staged`
(eslint --fix on staged `*.js`) then `npm test`. Config lives in `package.json`
(`lint-staged`) and `prepare: husky`.

## Keeping this file in sync

Update this CLAUDE.md and `README.md` whenever modules, exports, or conventions
change. If the user states a new code-style preference, also suggest adding it
to the `/implement-js` skill.
