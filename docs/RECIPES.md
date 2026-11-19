# Recipes: before you hand-roll it

qrp is split into small opt-in modules, so most of it is invisible unless you
go looking. A production dashboard built on qrp imported only `el`, `list`,
`when`, `state` and `mount`, then rewrote sorting, filtering, CSV export,
polling, persisted settings, URL routing, popover positioning and a WebSocket
client by hand. All of those already existed or now exist in qrp. Several of
the hand-written versions had bugs that qrp's versions have tests for: a feed
that scrolled back to the bottom while the user was reading history, polls
that kept running in hidden tabs, a copy button that threw on `http://` origins,
and widgets created before their host had a size.

**Look up what you're about to write in this table first.** Each row names the
import and the trap it already handles. Signatures are in [API.md](./API.md).

## Data in

| You're about to write… | Use | It already handles |
|---|---|---|
| `fetch` + JSON + auth header + error toast | `createHttp` from `qrp/http` | query params, auth, a reactive in-flight count, errors sent to the bus, 401 → `auth:unauthorized` |
| `{ data, loading, error }` + reload | `resource` / `asyncView` from `qrp/resource` | races (only the latest call wins), refresh on a bus event, loading/error/empty branches |
| `setInterval(load, 2000)` + `clearInterval` in `onDispose` | `poll(fn, ms)` from `qrp/browser` | pauses in hidden tabs, stops with the scope |
| `new WebSocket` + `onclose → setTimeout(connect)` + a `switch` on `msg.type` | `socket(url)` from `qrp/socket` | ws/wss from the page, backoff, a reactive `status`, JSON decode, `on(type)` routing, `send()` → false while down, closes with the scope |
| a high-rate stream written straight into `state` | `coalesce(target, { interval })` from `qrp/store` | latest value per key wins, one batch per interval (or frame), unchanged values skipped |
| `Object.keys(msg.state).forEach(k => store[k] = msg.state[k])` inside `batch` | `assign(store, snapshot)` from `qrp/store` | writes only the keys that changed, so bindings on untouched keys don't re-run |
| `feed.push(x); if(feed.length > N) feed.splice(…)` | `append(feed, x, N)` from `qrp/store` | one push and one trim in a batch; a keyed `list()` reconciles once |

## Data shown

| You're about to write… | Use | It already handles |
|---|---|---|
| a `<table>` with click-to-sort headers | `table` from `qrp/table` (or `collection` + `list`) | keyed row reuse, refetch without rebuilding rows, sort indicators |
| sort by a formatted cell (`"1.2 kHz"`) | keep the **number** in `accessor`/`value` and format in `formatter` | the sort and the export both see the raw value. Don't parse display text back into numbers |
| "asc → desc → original order" headers | `collection({ clearSort: true })` / `table({ clearSort: true })` | the third click clears the sort |
| a search box with `col:text` terms | `searchFilter(fields)` from `qrp/collection` as the `filterFn` | AND-ed terms, `field:text`, `"quoted phrases"`, an unknown `x:y` kept as plain text (so `12:30` still matches) |
| CSV export of "what I'm looking at" | `toCSV(view.sorted(), columns)` + `download` from `qrp/export` | RFC-4180 quoting, formula-injection guard, a delayed `revokeObjectURL` |
| select-all / bulk actions | `dataGrid` from `qrp/datagrid` | keyed selection that survives sort, filter, page and refetch |
| a "copy" button | `copy(text)` from `qrp/export` | an `execCommand` fallback on plain-http origins (`http://192.168.x.x` has no `navigator.clipboard`), always a promise |
| `1.2 mV`, `433.92 MHz`, `4.7 µF` | `si(value, unit)` from `qrp/format` | the prefix is picked after rounding (`999.9996` → `1 k`), blank for NaN |
| parse `"2.4G"`, `"100m"`, `"3.3 kV"` from an input | `parseSI(text, unit)` from `qrp/format` | case-sensitive prefixes (m ≠ M), `u`/`μ`/`K` spellings, NaN for anything else |
| numbers, %, bytes, durations, "2 hours ago" | `num` / `pct` / `bytes` / `duration` / `relTime` from `qrp/format` | Intl, blank for nullish input |
| a sparkline / tiny chart | `spark` + `scale` + `timeseries` | SVG output, gaps, LTTB downsampling |

## Imperative widgets and layout

| You're about to write… | Use | It already handles |
|---|---|---|
| `requestAnimationFrame(() => chart = new uPlot(…, host))` + `ResizeObserver` + `destroy` in `onDispose` | `embed(create)` from `qrp/behaviors/embed` | waits until the host is **connected** (not just one frame), skips unchanged sizes, cancels a pending create, destroys with the scope |
| a `ResizeObserver` feeding layout math | `size(element)` from `qrp/browser` | reactive `{ width, height }`, disconnects with the scope |
| a feed that should "stay at the bottom" | `stickToBottom(scroller)` from `qrp/behaviors/stick-to-bottom` | follows only while the user is at the bottom, a reactive `pinned` for a "jump to latest" button, disconnects with the scope |
| a popover placed with `getBoundingClientRect` math | `anchored` + `dismissable` (+ `portal`) | flip/shift, one Escape/outside-click layer stack, nested popups |
| a modal with a focus trap | `portal` + `trapFocus` + `dismissable` | focus return, inert background, layer order |
| "re-run this when `config.x` changes, but don't track what the reload reads" | `onChange(() => cfg.x, reload)` from the core | tracks only the source and runs the callback untracked; `equals` for compound keys |

## App shell

| You're about to write… | Use | It already handles |
|---|---|---|
| a `{ mount(body, props), update(next), destroy() }` adapter so a layout library can host a qrp view | `island(parent, view, props)` from `qrp/host` | reactive props (`update` re-runs only bindings on changed keys), disposes with its scope |
| a keyed diff of "which widgets should exist" (`syncPanes`: mount new, update changed, remove gone) | `reconcile(source, key, { create, update, recreate, destroy })` from `qrp/host` | one scope per item (everything `create` builds is disposed with it), recreate on type change, duplicate-key warning |
| `localStorage.getItem` / `setItem` in try/catch for a theme or name | `persisted(key, defaults)` from `qrp/browser` | quota and private-mode errors, sync across tabs |
| `/tab/:name` with `pushState` + `popstate` | `router` / `navigate` / `currentRoute` from the core | param matching, back/forward, intercepted links, a reactive current route |
| `?filter=` in the URL | `query()` from `qrp/browser` | two-way reactive query string |
| an app-wide event emitter | `bus` / `emitter` from `qrp/events` | native `EventTarget`; `off` works with the same handler |
| toasts | `notify.*` + `toasts` from `qrp/toasts` | driven by the bus, so http errors show up without extra wiring |
| `prompt()` / `confirm()` / a form in a dialog that stays open on a server error | `confirmDialog` / `promptDialog` in [qrp-shadcdn](https://www.npmjs.com/package/@nemanjan00/qrp-shadcdn) | a promise result, inline errors from a rejected `onSubmit`, focus return |

## Bigger than one page?

For where state, features and the shell go in a large app, see
[LARGE-APPS.md](./LARGE-APPS.md).

## Ownership rule of thumb

Everything above that observes, listens or polls registers its cleanup with
`onDispose`. Create it inside the view function you pass to `mount()` (or
inside `scoped()`) and disposing that one handle cleans everything up. If you
write `new ResizeObserver`, `addEventListener(window…)` or `setInterval` in a
view yourself, add an `onDispose` next to it in the same edit. Otherwise it
leaks for every pane that opens and closes.
