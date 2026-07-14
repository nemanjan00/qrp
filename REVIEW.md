# qrp — Code Review

- **Date:** 2026-07-14, at commit `357e97a` (working tree clean)
- **Scope:** every source module (`qrp`, `forms`, `browser`, `events`, `toasts`, `http`, `utils`, `behaviors`, `collection`, `table`, `html`, `proto`), `qrp.css`, `examples/`, `test/`, `README.md`, `CLAUDE.md`, `package.json`
- **Method:** full manual read of all sources, plus automated reviewer agents over `http`/`utils`/`behaviors` and 18 empirical probe scripts run against the real modules (happy-dom, same setup as the test suite)
- **Ground truth:** `npm test` → **141/141 pass**; `npm run lint` → clean (but see D-2: `html/` is not linted); core gzips to ~9.0 KB alone, core+browser to ~11.5 KB

**Legend:**
✅ = reproduced by running code today · 📖 = verified by careful code reading · ⚠️ = reported by an automated reviewer, consistent with the code but not independently executed

No code was changed. Suggested fixes are sketches only.

---

## Top issues at a glance

| # | Sev | Where | Issue |
|---|-----|-------|-------|
| CORE-1 | High | `qrp/index.js:141` | ✅ `push()` never re-runs effects that read only `.length` (`pop()` does) |
| CORE-2 | High | `qrp/index.js:113`, `:458` | ✅ `state()` on a primitive throws → `list()` over string/number arrays crashes |
| FORM-1 | High | `qrp/index.js:556`, `forms/index.js:117` | ✅ `<select>` `bind` runs before options exist — initial value silently not applied |
| BROW-1 | High | `browser/index.js` (all factories) | 📖 Every factory leaks window/document listeners, observers, or timers — no dispose path anywhere |
| CORE-3 | Medium | `qrp/index.js:410` | ✅ Reactive region crashes (`TypeError` on null `insertBefore`) on the next state write after `clear()` of its container |
| CORE-4 | Medium | `qrp/index.js:449` | ✅ Duplicate `list()` keys silently drop rows |
| CORE-5 | Medium | `qrp/index.js:770` | ✅ `compilePath` misassigns params when a literal `*` precedes a `:param` |
| EVT-1 | Medium | `events/index.js:41` | ✅ `off()` silently fails when one handler is subscribed to two event types |
| HTTP-1 | Medium | `http/index.js:169` | ✅ Loader counter sticks at ≥1 forever if the URL builder throws after `start()` |
| HTTP-2 | Medium | `http/index.js:83` | ✅ `params: { q: undefined }` is sent as the literal string `?q=undefined` |
| UTIL-1 | Medium | `utils/round-robin.js:28` | ✅ Crashes when a bucket key is `"constructor"`, `"__proto__"`, `"toString"`, … |
| D-1/D-2/D-3 | Medium | docs/tooling | ✅ `html/` module is undocumented, unlinted, and untested |

---

## Core — `qrp/index.js`

### Reactivity

**CORE-1 · High · ✅ `push()` does not trigger `length`-only effects; `pop()` does.**
`qrp/index.js:141-161`. When `push()` sets the new index, the array's own exotic `[[DefineOwnProperty]]` updates `length` as a side effect; by the time `push()` then explicitly sets `length`, the trap sees `old === next` and does not `trigger(target, "length")`. Only the `ITERATE` symbol fires (from the new index key), which `length`-readers never tracked.
Probe: `effect(() => s.arr.length)` then `s.arr.push(3)` → effect ran **1** time (stale `length = 2`). The same probe with `pop()` ran **2** times. Failure scenario: any counter badge (`el("span", {}, () => items.length)`), "N results" label, or pagination total driven by `.length` silently goes stale on append — one of the most common dashboard patterns.
Suggestion: in the `set` trap, when `isNew && Array.isArray(target)`, also `trigger(target, "length")`.

**CORE-2 · High · ✅ `state()` throws on primitives → `list()` over primitive arrays crashes.**
`qrp/index.js:113-124` does not guard the argument: `state("a")` reaches `new Proxy("a", …)` → `TypeError: Cannot create proxy with a non-object as target`. `setupList` calls `state(item)` unconditionally at `qrp/index.js:458`, so `list(() => ["a", "b"], x => x, …)` — a perfectly natural list of tag names, IDs, or options — crashes the whole render (reproduced end-to-end through `mount`). Suggestion: `state()` should return non-reactable values as-is (reuse `isReactable`, minus the frozen check — see CORE-8).

**CORE-3 · Medium · ✅ A reactive region whose anchor was removed crashes on the next update.**
`qrp/index.js:410-417`. The region's effect does `anchor.parentNode.insertBefore(...)`. After `clear(container)` (or any removal of the anchor comment) the anchor's `parentNode` is `null`, and the *next* state write throws `TypeError: Cannot read properties of null (reading 'insertBefore')` from inside `trigger()` — reproduced. The comment on `clear()` (`qrp/index.js:389`) does warn "dispose component scopes first", but the failure is an unrelated-looking crash at mutation time, far from the `clear()` call. Note the same pattern exists in `html/index.js:114-124` (`fillChild`), which even looks the parent up per-run but then calls `parent.insertBefore` without a null check. Suggestion: bail out (or self-dispose) when `anchor.parentNode` is null.

**CORE-4 · Medium · ✅ Duplicate `list()` keys silently drop rows.**
`qrp/index.js:449` (`cache.get(key) || next.get(key)`). Two items with the same key resolve to the same entry/element; the element is inserted once, so the probe rendered **1 of 2** items with no warning. Real data (refetches with accidental duplicate IDs, or a bad `keyFn`) silently loses rows. Suggestion: at minimum `console.warn` on duplicate keys in the reconcile loop.

**CORE-5 · Medium · ✅ `compilePath` capture-group/param misalignment with a literal `*`.**
`qrp/index.js:764-781`. A bare `*` becomes a capture group `(.*)` (line 775) but pushes nothing onto `keys`, while `:param` groups map to `keys` positionally. `compilePath("/a/*/b/:id")` matched against `/a/xxx/b/42` returns `{ id: "xxx" }` (reproduced) — the param gets the wildcard's capture. Suggestion: push a positional key (`0`, `1`, …) for bare `*`, path-to-regexp-style, so groups and keys stay aligned.

**CORE-6 · Medium · ✅ `reactive()` stacks `on*` listeners on reassignment instead of replacing.**
`qrp/index.js:618-624`. Every assignment calls `addEventListener`; assigning `node.onclick = fn` twice fires both (probe: 2 calls from one click). Native `onclick` property semantics — which this API deliberately mimics (README "Novel: reactive node proxies") — replace the previous handler. Any code that re-renders/re-binds accumulates duplicate handlers. Suggestion: remember the previous wrapper per (node, type) and remove it first.

**CORE-7 · Low · ✅ `NaN` writes always re-trigger.**
`qrp/index.js:150` uses `old !== next`; `NaN !== NaN` is true, so writing `NaN` over `NaN` spuriously re-runs effects every time (probe: 2 runs). A polling data source that yields `NaN` (failed parse, missing metric) re-renders on every tick. Suggestion: `!Object.is(old, next)`.

**CORE-8 · Low · ✅ Frozen objects are only skipped when *nested* — `state(frozen)` at the root still proxies, and writes throw.**
`isReactable` (`qrp/index.js:86-105`) is consulted for nested reads only; `state()` itself never checks it. `state(Object.freeze({a: 1}))` returns a proxy (contradicting CLAUDE.md/README "state() skips proxying frozen objects"), reads pay tracking overhead, and a write throws `TypeError: 'set' on proxy: trap returned falsish` (reproduced) rather than the plain strict-mode read-only error. Interacts with CORE-2's fix: `list()` rows over frozen static data (`Object.freeze` is the documented opt-out!) get proxied at `qrp/index.js:458` today.

**CORE-9 · Low · 📖 `derive()` created outside any scope/effect can never be disposed.**
`qrp/index.js:279-287` creates an internal `effect` but returns only the state object; the runner (with `.dispose`) is unreachable. Inside a scope/effect it's adopted and cleaned up; at module/top level it's immortal by design-hole rather than by choice. Suggestion: attach the runner (e.g. non-enumerable `dispose`) to the returned object.

**CORE-10 · Low · 📖 Mutually-triggering effects recurse without any guard.**
`trigger` (`qrp/index.js:67-73`) only skips `runner === activeEffect`. Effect A writing a key read by effect B and vice versa recurses synchronously until the stack overflows — no iteration cap, no helpful error. Worth at least a documented stance ("don't do this") or a depth guard with a clear message.

### DOM layer

**CORE-11 · Low · 📖 Reactive `style` objects never remove stale properties.**
`setAttr` (`qrp/index.js:348-351`) merges with `Object.assign(node.style, value)`. A binding `style: () => (cond ? { color: "red" } : {})` leaves `color: red` forever once set. Same code duplicated in `html/index.js:40-44`. Suggestion: track and clear keys absent from the new object (or document "styles are additive").

**CORE-12 · Low · 📖 `render(item, index)` in `list()` receives a creation-time `index` that goes stale on reorder.**
`qrp/index.js:446-472`: rows are built once per key, so the `index` argument reflects position at first build only; after sorts/moves it's wrong. The JSDoc advertises `render(item, index)` without that caveat — either document it or drop the parameter.

### Router / components

**CORE-13 · Medium · 📖 Same-page anchor (`#hash`) clicks are hijacked into full route re-renders.**
`qrp/index.js:914-937` intercepts any same-origin `a[href]`, including `href="#section"` / same-path-with-hash links. It calls `navigate(pathname + search + hash)` → `pushState` → `qrp:navigate` → `render()` disposes and remounts the current component; native scroll-to-anchor behavior is lost. Suggestion: let clicks through (or only `history.replaceState` + native behavior) when `url.pathname === location.pathname && url.hash`.

**CORE-14 · Low · 📖 `matchPath` can throw on malformed percent-encoding.**
`qrp/index.js:794` `decodeURIComponent(match[…])` throws `URIError` for paths like `/user/%zz` (typo'd or hostile URL) — the exception escapes `render()` and breaks navigation. Suggestion: try/catch falling back to the raw segment.

**CORE-15 · Low · 📖 Link interception edge cases.**
`qrp/index.js:923-926`: only `target="_blank"` is exempted — `target="_top"`/named-frame links are still hijacked; `rel="external"` isn't honored; `download` is. Also `router()` re-queries `document.querySelectorAll("a[href]")` on every navigation (`qrp/index.js:896`) to toggle `.active` — links rendered *after* the navigation never get the class until the next one, and it's O(document) per navigation.

**CORE-16 · Info · 📖 Re-entrant `navigate()` during a route's synchronous render** (component calls `navigate` while rendering, e.g. an auth-redirect guard) re-enters `render()` and disposes `current` mid-swap. Survivable but worth a re-entrancy guard or documented constraint.

---

## Forms — `forms/index.js`

**FORM-1 · High · ✅ `<select>` initial value is silently not applied (state/UI desync).**
`el()` processes props before children (`qrp/index.js:559-578`), so the `bind` effect at `forms/index.js:117-123` sets `select.value` while the select has **zero** options; the assignment is dropped. Options are appended afterwards and the effect has no reason to re-run. Probe: `state({ MODE: "ysf" })` bound to a select → `select.value === "dmr"` (first option) while state says `"ysf"`. The form *displays* a value that is not the stored one until the user manually touches the field — for a settings dashboard this is a correctness bug, not a cosmetic one. Affects any direct `el("select", { bind }, ...options)` too. Suggestion: in `bind()`, re-apply the value after children are attached (e.g. run the effect via microtask, or have the select input factory pass options before binding).

**FORM-2 · Low · 📖 Radio groups collide across forms.**
`forms/index.js:132` sets `name: key`; two forms on one page whose settings share a key (`settings` and `defaults` both with `MODE`) join one radio group — checking one unchecks the other form's. Suggestion: prefix with a per-form unique id.

**FORM-3 · Low · 📖 `bind` number coercion produces `NaN` and mixed types.**
`qrp/index.js:669`: `Number("abc")` → `NaN` stored in state; empty input stores `""` (a string) in an otherwise-numeric field, so state holds `number | "" | NaN`. Downstream `serializeKV`/validation sees inconsistent types.

**FORM-4 · Low · 📖 `serializeKV` corrupts values containing newlines; `parseKV` has no comment/escape support.**
`forms/index.js:29-52`. A value with `\n` round-trips into extra bogus keys. A line without `=` becomes a key with value `""` (indistinguishable from `KEY=`). Fine if the backend contract guarantees flat values — worth a JSDoc note at least.

**FORM-5 · Low · 📖 Section names that collide with `Object.prototype` crash grouping.**
`forms/index.js:236-237`: `grouped[name] = grouped[name] || []` — a section literally named `"constructor"` yields `grouped[name]` truthy (the inherited function) → `.push` on a function → TypeError. Same defect class as UTIL-1; a `Map` fixes both.

---

## Browser — `browser/index.js`

**BROW-1 · High · 📖 Systemic: every factory registers global listeners/observers/timers with no dispose path.**
This is the module's design gap, not one line: nothing here can ever be torn down, and the file-header comment ("create these once per component") *prescribes* the leaking pattern — components unmount, these don't.
- `persisted()` — `window` `storage` listener (`browser/index.js:45`), plus its re-persist `effect` is only cleaned up if created in a scope.
- `query()` — `popstate` listener (`:98`).
- `hashState()` — `hashchange` listener (`:127`).
- `media()` — `MediaQueryList` `change` listener (`:143`).
- `viewport()` / `online()` / `visible()` — `resize` / `online`+`offline` / `visibilitychange` listeners (`:154`, `:166-167`, `:176`).
- `seen()` — an `IntersectionObserver` that is **never disconnected** (`:249-255`); it also keeps observing after the element is removed.
- `cookies()` — worst case: starts `watch()`'s `setInterval` (default 250 ms, forever) and **discards the stop function `watch` itself returns** (`:226-236`). A dashboard that creates `cookies()` per view accumulates immortal 4 Hz timers.
Each closure also pins its state object (and for `seen`, the element) in memory. Suggestion: return a dispose alongside the store (or register cleanup with the current `scope`), mirroring what `watch()` already gets right.

**BROW-2 · Low · 📖 `cookies()` parser breaks on flag-style cookies and can throw.**
`browser/index.js:212-221`: a cookie without `=` gives `eq === -1` → key loses its last character and the value becomes the whole name; `decodeURIComponent` on malformed values (`%zz`) throws inside the `watch` callback on every poll tick. Suggestion: guard `eq === -1` and try/catch the decode.

**BROW-3 · Low · 📖 `query()` writes drop `location.hash` interplay & always `replaceState`.**
`browser/index.js:81-96`: fine for its stated purpose, but note the effect fires once immediately on creation and will *rewrite* the URL (normalizing param order/encoding) even before any user change — surprising with bookmarked URLs containing params it re-serializes differently (e.g. `?a=1&a=2` collapses to the last value via `Object.fromEntries` at `:77`).

---

## Events — `events/index.js`

**EVT-1 · Medium · ✅ `off()` breaks when one handler is registered for two event types.**
`events/index.js:41`: `wrappers` is keyed by the handler alone, so the second `on(type2, handler)` overwrites the first wrapper. Probe: `on("a", h); on("b", h); off("a", h)` removes nothing for `"a"` — both events still fire (2 calls observed). The same keying means double-subscribing the same handler to one type leaves an unremovable duplicate. Suggestion: key wrappers by handler → `Map<type, wrapped>` (or a `${type}` composite).

**EVT-2 · Low · 📖 `fromEvent()` has no unsubscribe.**
`events/index.js:122-134` subscribes (`source.on(...)` — discarding the returned off — or `addEventListener`) and returns only the store. Once created it lives as long as the source. Same systemic issue as BROW-1.

**EVT-3 · Low · 📖 `channel()` inconsistencies.**
`events/index.js:155-167`: `emit` returns the internal `local` emitter, not the channel (breaks chaining `channel.emit(...).emit(...)` in a subtle way — the second emit skips the `BroadcastChannel`); `close()` closes the BC but leaves local listeners; messages with no `type` (foreign producers on the same channel name) call `local.emit(undefined, …)`.

**EVT-4 · Info · 📖 `respond()` rethrows falsy errors as successes.**
`events/index.js:96-102`: `throw undefined` (or a falsy rejection) in a responder hits `detail.error` falsy → the requester *resolves* with `undefined`. Also `once()` (`:55-57`) leaks its listener forever if the event never fires and offers no cancellation.

---

## Toasts — `toasts/index.js`

**TOAST-1 · Low · 📖 `createToasts()` subscribes 4 bus handlers with no dispose** (`toasts/index.js:129-131`) — fine for the singleton, a leak for any additional `createToasts({ bus })` instance created per view. `lastSeen` (`:70`) also grows unboundedly, one entry per unique message string ever shown.

**TOAST-2 · Low · 📖 Error toasts use `role="status"`** (`toasts/index.js:137`) — polite live region. Errors/warnings should be `role="alert"` (assertive) to be announced promptly by screen readers.

**TOAST-3 · Info · 📖 Auto-dismiss timers are never cleared on manual dismiss** (`:106-108`) — harmless double-`dismiss` (filter no-op) but keeps the closure alive for the full timeout; an object payload with none of `content`/`message`/`body` renders `"[object Object]"` (`:115`).

---

## HTTP — `http/index.js`

**HTTP-1 · Medium · ✅ Loader counter permanently stuck when the request line throws synchronously.**
`http/index.js:169-171`: `start()` runs before `buildUrl(path, config.params)` is evaluated as `fetch`'s argument. `http.get()` (missing path → `path.indexOf` TypeError) or a params object `URLSearchParams` rejects leaves `loading.pending` at 1 with no matching `stop()` — probe confirmed `pending === 1` forever. Every UI bound to `loading.pending === 0` shows an eternal spinner, and the 0→1 edge for `loader.start` misfires from then on. Suggestion: build `url` before `start()`, or try/catch → `stop()` + rethrow.

**HTTP-2 · Medium · ✅ Query params serialize `undefined`/`null` as literal strings; arrays comma-join.**
`http/index.js:83`: probe → `a=undefined&b=null&ids=1%2C2%2C3`. The everyday pattern `params: { q: maybeUndefined }` sends `?q=undefined` and the backend happily filters on the string. Arrays never produce the `ids=1&ids=2` repeated-key form most backends expect. Suggestion: skip nullish entries; append array values individually.

**HTTP-3 · Medium · ✅ Case-sensitive header merge produces combined/corrupt headers.**
`http/index.js:94-109`: `headers["Content-Type"] === undefined` misses a caller's `"content-type"`, so both keys survive the plain-object merge and `Headers` **combines** them — probe: `new Headers(...)` yields `content-type: "text/plain, application/json"`. Same class for hardcoded lowercase `authorization` vs a `baseHeaders`/caller `Authorization` (→ `"Bearer x, Basic y"`). Suggestion: normalize keys to lowercase during merge.

**HTTP-4 · Medium · 📖 Non-JSON-able bodies are silently destroyed.**
`http/index.js:166`: any non-string body is `JSON.stringify`'d — `FormData`, `Blob`, `URLSearchParams`, `ArrayBuffer` all become `"{}"` (with a JSON content type added), so `http.post("/upload", new FormData(f))` uploads nothing, successfully. Suggestion: pass through body types `fetch` natively supports and only stringify plain objects/arrays.

**HTTP-5 · Medium · 📖 Rejection value is a consumed `Response` — error bodies are unreadable by callers.**
`http/index.js:171-190`: `response.text()` consumes the body, the parsed `data` is used only for the toast message, then the bare `response` is the rejection value (`bodyUsed === true`). The natural caller move — `.catch(r => r.json())` to show per-field validation errors on a form — throws "Body has already been read". For a forms/dashboard framework this blocks the primary 422 workflow. Also inconsistent: HTTP errors reject with a `Response`, network failures with a `TypeError` (`:192-196`) — callers must type-sniff. Suggestion: reject with `{ status, response, data }`.

**HTTP-6 · Low · 📖 The 302 branch is unreachable.**
`http/index.js:179-182`: `fetch` follows redirects by default and `request()` exposes no `redirect` option, so `response.status === 302` can't be observed (a manual redirect yields status 0/`opaqueredirect`). Dead code that the file header and README both advertise as behavior ("a 302 rejects silently").

**HTTP-7 · Low · 📖 `isUnauthorized` misses the documented string-body form.**
`http/index.js:145-151` checks `data.error.message === "Unauthorized"` only; a body of `{"error": "Unauthorized"}` (which `errorMessage` at `:134` explicitly supports) does not emit `auth:unauthorized`, contradicting the header comment ("an 'Unauthorized' body or 401").

**HTTP-8 · Low · 📖 `errorMessage` garbles common error shapes.**
`http/index.js:129-143`: `data.errors` entries that are strings append the text `"undefined"` (`entry.message` on a string); multiple messages concatenate with **no separator** (`message += entry.message`); an `{ errors: {...} }` body *without* `error` falls to the generic message, discarding the details.

**HTTP-9 · Low · 📖 A `response.text()` failure bypasses error reporting.**
`http/index.js:172` + `:192`: the second `.then` argument only catches *fetch* rejections; if reading the body fails (connection reset mid-body), no `error` bus event is emitted (contract in the header comment says every failure path emits) — the promise still rejects and `finally(stop)` still runs.

**HTTP-10 · Low · 📖 URL joining quirks.**
`http/index.js:78`: the "absolute URL" test is `path.indexOf("http") !== 0` — a path like `"httpx/report"` (or any path *starting* with the letters "http") skips `baseUrl`; no slash normalization between `baseUrl` and `path` (`"/api/" + "/things"` → `//`), and `?` detection at `:86` is fine but combined with HTTP-2's serialization.

**HTTP-11 · Low · 📖 No `AbortSignal`/timeout/`fetch`-init passthrough.**
`http/index.js:160-167`: `config` accepts only `params`/`body`/`headers`; anything else (signal, credentials, mode, cache, redirect) is silently dropped. Dashboards polling slow backends can't cancel superseded requests — relevant to the framework's stated niche.

---

## Utils — `utils/*.js`

**UTIL-1 · Medium · ✅ `roundRobinByKey` crashes on `Object.prototype` bucket keys.**
`utils/round-robin.js:28-36`: buckets live on `{}` and are initialized only when `buckets[key] === undefined`; keys like `"constructor"`, `"toString"`, `"__proto__"` (probe: both `"constructor"` and `"__proto__"` throw `TypeError: buckets[key].push is not a function`) hit inherited properties. Grouping by an arbitrary user/data-supplied string is this function's whole purpose, so hostile or unlucky data crashes the render. Bonus from the same storage choice: numeric keys coerce to strings (`1` and `"1"` merge). Suggestion: `new Map()`.

**UTIL-2 · Medium · ✅ `memoize`'s default key is lossy — silent wrong-result collisions.**
`utils/memoize.js:22`: probe — `f(undefined)` and `f(null)` share key `"[null]"`; the underlying fn ran **once** and `f(null)` returned `undefined`'s cached result. Same class: `{a: undefined}` vs `{}`, key-order-sensitive objects, `Date` vs its ISO string (via `toJSON`), and `JSON.stringify` throws outright on circular/BigInt args. The `key` option exists, but the default silently returns wrong data rather than failing loudly. Worth documenting the sharp edge prominently or hardening the default.

**UTIL-3 · Medium · ✅ `weightedPool` mangles weight `0` and negative weights.**
`utils/weighted-pool.js` (`push`, `:96` in file terms — `weights.push(weight || 1)`): weight `0` ("never pick") is coerced to 1 — probe: an item pushed with weight 0 **was picked**. Negative weights flip `min`, corrupting the cumulative map — probe: a pool of weights `[-1, 2]` picked the negative-weight item at seed 0.5. Suggestion: treat `0` as 0 (skip in the map), validate/throw on negatives; only default `undefined` to 1.

**UTIL-4 · Medium/Low · 📖 `precacheWithRefresh` last-write-wins race serves stale data.**
`utils/cache.js:58-70`: each `refresh()` assigns `current = next` when *its own* promise resolves; with an in-flight interval refresh plus a manual `get.refresh()` (or a producer whose latency varies across an interval boundary), an **older** slow call resolving after a **newer** fast one overwrites it — the getter then serves the older snapshot until the next tick. Suggestion: ignore the resolution if a newer refresh has started (generation counter).

**UTIL-5 · Low · 📖 `precache`/`precacheWithRefresh` produce unhandled rejections for eager failures.**
`utils/cache.js:37-41` and `:53`: the eagerly-started promise (and the initial `current = method()`) has no rejection handler attached until a consumer reads it — if the producer rejects first, that's an `unhandledrejection` (crashes strict Node runners; console noise + monitoring alarms in browsers). The interval path (`:72-74`) *does* catch. Suggestion: attach a no-op `.catch` for the pre-read window without replacing the stored promise.

**UTIL-6 · Low · ✅ `paginate` with a negative index wrap-slices from the end.**
`utils/paginate.js:15-20`: probe — `paginate([1..10], -2, 3)` → `[5, 6, 7]` (and `-1` → `[]`). A pagination UI that decrements below zero shows data from the *end* of the set. Suggestion: clamp `index` to ≥ 0.

**UTIL-7 · Low · 📖 `memoize({ max: 0 })` means *unbounded*, `lru(0)` means *nothing retained*.**
`utils/memoize.js:23` (`options.max ? lru(...) : new Map()`) — falsy 0 silently selects the unbounded Map, the exact opposite of the caller's intent and of `lru(0)`'s semantics.

**UTIL-8 · Info · 📖 `paginate(arr, i, 0)` returns the array by reference** (`utils/paginate.js:15`) while every other size returns a fresh slice — callers that mutate the "page" corrupt the source only in the size-0 case.

---

## Behaviors — `behaviors/*.js`

**BHV-1 · Medium · 📖 `trapFocus` a11y cluster** (`behaviors/trap-focus.js`):
- `FOCUSABLE` (`:6-13`) doesn't exclude invisible elements (`display:none` sections, collapsed panels inside the dialog). A hidden element as first/last match breaks the wrap logic: `.focus()` on it silently no-ops, `document.activeElement` never equals `first`/`last`, and Tab escapes the trap.
- It also *misses* focusable things: `[contenteditable]`, `audio/video[controls]`, `iframe`, `summary`, `area[href]` — Tab escapes through any of them.
- Shift+Tab when focus is on the container itself (the `initial = ... || node` fallback, `:54`) doesn't match `first`, so focus walks out backwards.
- That fallback `node.focus()` (`:56-58`) silently fails unless the container has `tabindex="-1"` — a modal with no focusable content gets no trap at all.
Suggestion: filter candidates by visibility (`offsetParent`/`getClientRects`), extend the selector, give the container `tabindex="-1"` before focusing, and treat "activeElement outside items" as wrap-to-edge.

**BHV-2 · Medium · 📖 `dismissable` layering and portal blind spots** (`behaviors/dismissable.js`):
- Escape (`:24-28`, capture-phase document listener) closes **every** stacked dismissable at once — modal + its dropdown both die on one keypress; inner layers can't veto outer ones. Suggestion: a simple global stack, topmost-only.
- Outside-click uses DOM containment (`:30-34`); a *portaled descendant* (dropdown/tooltip of a modal, moved to `document.body` by `portal()` — the composition the README explicitly recommends) is not DOM-inside `node`, so clicking it dismisses the parent.
- Both document listeners attach even when the corresponding option is disabled (`:36-41` — flags are checked inside the handlers, cheap but every keydown/pointerdown in the app still runs them).

**BHV-3 · Medium/Low · 📖 `anchored` measures before it positions** (`behaviors/anchored.js:24-45`): the first `update()` reads `floating.getBoundingClientRect()` *before* setting `position: fixed`, so a statically-laid-out element (often full-width in flow) is measured with wrong dimensions and lands misplaced until the next scroll/resize. Also flip logic only handles `bottom → top` overflow (`:32-34`); `placement: "top"` near the viewport top renders off-screen with no flip down. The capture-phase window scroll listener (`:50`) fires for every scroll in the app — fine at one dropdown, noticeable with many live instances.

**BHV-4 · Low · 📖 `disclosure.connect()` returns nothing** (`behaviors/disclosure.js:36-45`): the click listener on a persistent trigger and the effect have no dispose path (effect is scope-adopted if created inside one; the listener never is). Reconnecting the same trigger later stacks toggle handlers → double-toggle = appears dead. Also wires `aria-expanded` but not `aria-controls`/panel `id` (screen readers can't associate trigger and panel).

**BHV-5 · Low · 📖 `busyWhile.run()` doc mismatch + spurious unhandled rejections** (`behaviors/busy-while.js:24-33`): JSDoc says "returns the same promise" but it returns the `.finally()`-derived one; a caller who tracks `b.run(p)` fire-and-forget while handling `p` elsewhere gets an `unhandledrejection` from the derived promise when `p` rejects.

**BHV-6 · Info · 📖 `portal()` dispose removes the node, it doesn't restore it** to its original slot (`behaviors/portal.js:15-22`) — matches its JSDoc, but a "portal" name suggests round-trip; re-opening a portaled panel requires the caller to have kept its own reference to the original parent.

---

## Collection & Table

**COLL-1 · Medium/Low · 📖 Page index is never clamped.**
`collection/index.js:78-88`: filter shrinks the set while `page.index` stays (say) 5 → `items()` returns `[]`, the table renders blank with working pagination showing a phantom page. Typing in a search box while on page 3 is the canonical repro. Suggestion: clamp in `items()` or expose a `setPage` that clamps against `pageCount()`.

**COLL-2 · Low · 📖 The default comparator is not a valid comparator for mixed/missing data.**
`collection/index.js:63-69` (`a[key] > b[key] ? 1 : -1` after an `===` check): with `undefined`/`null` cells or mixed number/string columns, both `(a,b)` and `(b,a)` can return `-1` (not antisymmetric) → order depends on the engine's sort internals; strings compare by code unit (no locale/numeric awareness — `"item10" < "item2"`). Same logic duplicated in `table/index.js:87-102`. Suggestion: undefined-last rule + `String.prototype.localeCompare` / numeric detection, or document "provide `compare` for real data".

**COLL-3 · Low · 📖 Every read of `items()`/`total()`/`pageCount()` re-filters (and `items()` re-sorts) from scratch** (`collection/index.js:39-92`): a pagination footer reading all three in one effect runs the filter three times per change; with `list()` also pulling `items()`, a keystroke in a filter box does the full pipeline several times over. Not wrong, but at odds with the perf story for large tables; a `derive`-based memo per stage would fix it.

**TBL-1 · Medium · 📖 Sortable headers are mouse-only and announce nothing.**
`table/index.js:113-125`: sort is a bare `onclick` on a `<th>` — no `tabindex`/button, no keyboard operability, no `aria-sort` on the header (the arrow is a text node in a `span`). For a framework whose README highlights carrying "the a11y hard parts", the flagship table combiner ships none for sorting.

**TBL-2 · Low · 📖 `sortByFormatted` without `formatter` silently sorts raw** (`table/index.js:48-56` requires both; a column declaring only `sortByFormatted: true` gets no warning), and formatter-based sorting on localized numbers (`toLocaleString` → `"1,234"`) does string comparison — worth a doc note since the header example (`:16`) shows exactly that combination.

**TBL-3 · Info · 📖 `render` cells are built once per key and never see row replacement** — accurately documented in the code comment (`table/index.js:167-170`), but it's the sharp edge users will hit first (action buttons capturing a stale `item` after a refetch); consider passing the holder (or a getter) to `render`.

---

## HTML & Proto

**HTML-1 · Medium (process) · ✅ The `html/` module is invisible to the project's own quality gates.** See D-1/D-2/D-3 below — not in README's module table, not in CLAUDE.md's layout, **not in the `package.json` lint file list, and zero tests** (no `test/html.test.js`; no example uses it). Everything else in the repo has all three.

**HTML-2 · Low · 📖 `insideTag` heuristic is fooled by `>` / `<` in attribute values or text.**
`html/index.js:77`: `` html`<div title="a>b" class=${x}>` `` — the `>` inside the quoted title makes `insideTag` return false → the hole is emitted as a *child comment marker inside the tag*, producing garbage markup. Conversely `5 < 3` in text before a hole flips it the other way. Template text is author-controlled so this is a footgun rather than an injection, but it fails silently.

**HTML-3 · Low · 📖 Partial attribute holes silently leave sentinel text.**
`html/index.js:151`: `class="a ${x}"` doesn't match the whole-value regex, so the attribute keeps the literal `__qrp_hole_0__` in the DOM and the value is never applied. The header documents "one dynamic value per attribute" as a limitation, but the failure mode is silent corruption — a `console.warn` when a sentinel survives would save users an hour each.

**HTML-4 · Low · 📖 Reactive child holes share CORE-3's crash** (`html/index.js:114-124`): `comment.parentNode` is re-read each run but not null-checked — same detached-anchor `TypeError` after the region's container is cleared.

**PROTO-1 · Low · 📖 `wrapMethod` on a missing method defers the failure.**
`proto/index.js:46-58`: if `proto[method]` is `undefined` (typo, older browser), `make(undefined)` is happily installed and the crash happens later at call time inside the replacement (`original.apply`). Suggestion: throw early when the original is absent. Also `findProto` (`:19-31`) relies on `constructor.name`, which is fine un-minified but breaks if consumers bundle/minify qrp with their app — worth one doc line given the no-build premise makes this rare.

---

## CSS & Examples

**CSS-1 · Low · 📖 `[data-theme="light"]` doesn't fully win over OS dark mode.**
`qrp.css:53-58`: the light override resets `--qrp-fg/bg/surface/border` but **not** `--qrp-muted` or `--qrp-shadow`, so with `prefers-color-scheme: dark` + explicit `data-theme="light"`, muted text stays `#9aa4b2` (low contrast on white) and the heavy dark shadow leaks through. The file header promises "a `[data-theme]` attribute wins."

**CSS-2 · Info · 📖 Toast variant backgrounds don't pin a foreground color** (`qrp.css` `.qrp-toast-*` set `background` only) — text color inherits from the page, so a dark-theme page with light text is fine, but a light page with custom body color can end up low-contrast on the colored toasts. Badges hardcode `#fff` (`:97-100`); toasts should match.

**EX-1 · Info · 📖 The demo's routes 404 on reload.**
`examples/index.html:146-155` + README "Running the demo": `python -m http.server` has no SPA fallback, so after clicking to `/settings/user`, a browser refresh (or a shared link) is a 404. Expected for History-API demos, but the README doesn't warn, and the router offers no hash-mode/base-path escape hatch.

**EX-2 · Info · 📖 `examples/bench.html` compares framework reconcile vs hand-optimal surgical DOM** (e.g. `swap` at `:82` assigns a whole new array to qrp while vanilla moves two nodes at `:140-148`). The file honestly labels vanilla "the floor", so this is fine — just don't quote the ratios as framework-vs-framework numbers. The paint-timing methodology (rAF + setTimeout, median of 5 after warmup) is sound.

---

## Tests

**T-1 · Low · ✅ A test title asserts something the test doesn't check.**
`test/utils.test.js:118-135` ("…stop() clears"): `get.stop()` is called on the last line but nothing asserts the interval actually stopped (e.g. tick again and assert no further producer calls). The stop behavior is effectively untested.

**T-2 · Low · ⚠️ `test/http.test.js` stubs `fetch` with a plain object, not a `Response`** — so body-consumption (HTTP-5), Headers case-normalization (HTTP-3), and redirect semantics (HTTP-6) are structurally invisible to the suite; no tests cover concurrent-request loader counting or sync-throw paths (HTTP-1).

**T-3 · Low · ✅/📖 Coverage gaps by module.** No test file exists for `html/` (see HTML-1). Behaviors tests can't catch positioning or focus-visibility regressions under happy-dom (zero-size rects, permissive `.focus()`) — `anchored`'s math and `trapFocus`'s wrap logic are effectively untested even where files exist. The reactivity edges confirmed above (CORE-1 push/length, CORE-2 primitives, CORE-4 duplicate keys, FORM-1 select) all pass through untested paths — each reproduced case in this review is a ready-made regression test.

---

## Documentation

**D-1 · Medium · ✅ `html/` module is entirely undocumented** — absent from README's "The modules" table (`README.md:258-275`) and from CLAUDE.md's Layout section, despite being 193 lines of user-facing API (`html` tagged templates).

**D-2 · Medium · ✅ `html` is missing from the lint script.**
`package.json:8`: `"lint": "eslint qrp forms browser events toasts proto http utils behaviors collection table test"` — no `html`. "Lint clean" does not cover that file. (lint-staged *does* catch it on commit since it matches `*.js`, so the gap is `npm run lint` only.)

**D-3 · Low · ✅ Stale README numbers.**
`README.md:398`: "80 tests" — the suite runs **141**. `README.md:376`: "core + browser … ~26 KB (~9 KB gzipped)" — measured today: **34 KB raw, ~11.5 KB gzipped** (core alone is 27.3 KB / 9.0 KB). The "~9 KB gzipped" bullet at `README.md:20` matches core-only, not core+browser as the table claims.

**D-4 · Low · ✅ Documented behaviors that don't hold.**
- "state() skips proxying frozen objects" (CLAUDE.md; README `:114-116`) — only true for *nested* values, and the root case throws on write (CORE-8).
- "a 302 rejects silently (caller handles the redirect)" (`http/index.js` header; README `:362`) — unreachable (HTTP-6).
- "an 'Unauthorized' body or 401 also emits auth:unauthorized" (`http/index.js` header) — the string-body form doesn't (HTTP-7).
- `busyWhile.run` "returns the same promise" (BHV-5).

**D-5 · Info · 📖 CLAUDE.md's "Gotchas" section contains stray Layout bullets** (the `examples/` and `test/` entries at the end of Gotchas duplicate the Layout list) — reads like a copy/paste remainder.

---

## Cross-cutting observations

1. **Disposal is the framework's weakest axis.** The core gets ownership right (scopes, list rows, router teardown), but the satellite modules (`browser`, `events.fromEvent`, `toasts.createToasts`, `disclosure.connect`) create global subscriptions that outlive any component. A single convention — *every factory that subscribes returns (or registers with the current scope) a dispose* — would fix BROW-1, EVT-2, TOAST-1, and BHV-4 uniformly, and the `scope()` machinery to do it already exists.
2. **Plain objects as keyed maps** (`{}` + `key in`/`=== undefined` checks) appear in `roundRobinByKey` (crash), `forms.form` grouping (crash), and `toasts.lastSeen` (benign) — `Map` (or `Object.create(null)`) is the drop-in fix and also repairs numeric-key coercion.
3. **The error paths of `http` assume the happy shape.** Five findings (HTTP-1, -5, -7, -8, -9) are all "what if the failure isn't the expected failure" — worth one hardening pass with tests using real `Response` objects.
4. **a11y ships half-done in the pieces marketed for it** (trapFocus visibility, table sort semantics, toast roles). The primitives are close; each needs one focused pass.
5. **Nothing security-critical was found**: no `innerHTML` with user data (`html` escapes interpolated strings to text nodes; static template text is author-trusted by design), no eval, event payloads inert. The `__proto__`-adjacent items (UTIL-1, FORM-5) are crash bugs, not pollution vectors, since only same-object lookups are affected — `parseKV`'s `settings["__proto__"] = "…"` assignment is silently ignored for string values and cannot poison `Object.prototype`.

## Review coverage notes

- All 16 source modules, CSS, examples, tests, and docs were read line-by-line; 18 targeted probes were executed against the real modules (16 reproduced defects, 1 refuted a suspected issue — `clear()` on an *ancestor* of a reactive region does **not** crash, only clearing the anchor's direct parent does, which narrowed CORE-3's scope).
- Automated reviewer coverage completed for `http`, `utils`, and `behaviors`; the remaining modules were covered by the manual read plus probes. Findings marked ⚠️ (T-2 and parts of T-3) came from the automated pass and were checked for consistency against the code but not executed.
- Not exercised: real-browser rendering (View Transitions path in `router`, actual `<select>`/focus behavior beyond happy-dom — though FORM-1 reproduces even in happy-dom), cross-tab `storage`/`BroadcastChannel` delivery, and `examples/*` runtime behavior beyond static reading.
