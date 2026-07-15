# Changelog

All notable changes to `@nemanjan00/qrp`. Pre-1.0, so **breaking changes can land
in a minor/patch** — they're marked ⚠️ **BREAKING** here so you never have to
find out by reading a diff. Newest first.

## Unreleased

_(nothing yet)_

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
