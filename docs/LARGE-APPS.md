# Structuring a large qrp app

qrp's examples are single pages: one table, one form, one chart. This guide
covers the next size up: dozens of feature views, live data from a server, a
layout library you didn't write, and more than one person (or coding agent)
adding features at the same time.

It is based on mailab, a lab-instrument dashboard built on qrp: about 56k
lines, 39 pane types, a WebSocket that streams kilohertz-rate samples, and
panes laid out by GridStack. Where mailab did something well, this guide says
so. Where it worked around a gap, qrp now has a helper, and the guide uses
that helper.

Read [RECIPES.md](./RECIPES.md) alongside this guide. It answers "is there
already a helper for X". This guide answers "where does X go".

## The layers

```
transport   socket() / createHttp()             gets bytes in and out; knows nothing about the UI
   ↓
store       state() + assign/append/coalesce    one mirror of the server, written only by the transport
   ↓
features    view(ctx, props) per feature        reads the store, owns its own UI state
   ↓
shell       router / reconcile + island         decides which features are mounted where
```

Data flows down and commands flow back through the transport. A feature never
writes to the server mirror directly. It sends a command and waits for the
server's update to come back down the same path as everyone else's. That keeps
one source of truth when several clients (mailab has humans and an AI) edit
the same state.

## 1. Transport

Keep one module that owns the connection and nothing else.

```js
// app/transport.js
import { socket } from "@nemanjan00/qrp/socket";
import { createHttp } from "@nemanjan00/qrp/http";

export const http = createHttp({ baseUrl: "/api", token: () => session.token });
export const live = socket("/ws");
```

- `socket()` reconnects with backoff and exposes `live.status.connected` for a
  connection indicator. `live.on("<type>", fn)` replaces a `switch` over
  `msg.type`.
- After a reconnect the server should send a full snapshot. Subscribe to
  `live.on("open", …)` if the client has to ask for one.
- Commands go through `http` (request and response, errors on the bus →
  toasts) or `live.send()` (fire and forget; it returns false while
  disconnected, so the caller decides whether to queue or drop).

## 2. The store: one mirror, written in one place

```js
// app/store.js
import { state } from "@nemanjan00/qrp";
import { assign, append, coalesce } from "@nemanjan00/qrp/store";
import { live } from "./transport.js";

export const lab = state({ devices: [], channels: [], panes: [], tabs: ["main"] });
export const feeds = state({ activity: [], chat: [] });
export const latest = state({});          // channel → last value, for readouts

const latestValues = coalesce(latest, { interval: 250 });

live.on("state", (msg) => assign(lab, msg.state));
live.on("activity", (msg) => append(feeds.activity, msg.entry, 500));
live.on("chat", (msg) => append(feeds.chat, msg.message, 500));
live.on("samples", (msg) => Object.entries(msg.samples).forEach(([name, s]) => {
	series.push(name, s);                                  // see "Bulk data" below
	latestValues.set(name, s.v[s.v.length - 1]);
}));
```

The rules:

- **`assign` snapshots, don't replace the root.** `assign(lab, msg.state)`
  writes only the keys whose value changed, in one batch. Bindings that read
  `lab.devices` don't re-run when only `lab.panes` changed.
- **Cap every feed.** `append(array, item, max)` pushes and trims in one batch.
  A feed without a cap is a memory leak with a delay.
- **Coalesce high-rate values.** A readout doesn't need 1 kHz. `coalesce`
  writes the latest value per key once per interval (or per animation frame)
  and skips unchanged values. mailab did this by hand with a 250 ms
  `setInterval` and `batch()`, and it's the right call.
- **Freeze data you only ever replace.** A server response that is never
  edited in place (`Object.freeze(result)`) skips proxying. mailab freezes
  search hits, board geometry and diff results this way.
- **Split stores by owner, not by screen.** `lab` (the server mirror), `feeds`
  (append-only logs) and `latest` (hot values) have different write patterns.
  Keeping them apart makes an effect that reads `latest` cheap to reason about.

### Bulk data stays outside `state()`

Time series, waveforms, images and blobs don't belong in a proxy. Every element
read would be tracked. mailab keeps sample buffers in plain arrays
(`{ t: [], v: [] }` per channel) and tells views that new data arrived with an
event. Each chart then redraws imperatively.

```js
// plain arrays + a revision counter the views can depend on
const buffers = new Map();
export const revision = state({ samples: 0 });

export const series = {
	get: (name) => buffers.get(name) || buffers.set(name, { t: [], v: [] }).get(name),
	push: (name, s) => { const b = series.get(name); b.t.push(...s.t); b.v.push(...s.v); trim(b); }
};
// after a batch of pushes: revision.samples += 1   (or emit on the bus)
```

A chart view reads `revision.samples` in an `onChange` and redraws from
`series.get(name)`. A single counter is the dependency, not a million points.

## 3. Features

A feature is a module that exports a view. It receives what it needs (a
context object and its props) instead of importing app globals. That makes it
testable in isolation and lets the shell mount it anywhere.

```js
// features/devices.js
import { el } from "@nemanjan00/qrp";
import { table } from "@nemanjan00/qrp/table";

export default (ctx, props) => table({
	rows: () => ctx.lab.devices,
	key: (d) => d.id,
	fields: [
		{ key: "id", label: "id" },
		{ key: "driver", label: "driver" },
		{ key: "status", label: "status", render: (d) => el("span", { class: () => `status ${d.status}` }, () => d.status) }
	]
});
```

```js
// app/context.js: what every feature gets
export const ctx = { lab, feeds, latest, series, revision, http, live, ui };
```

**Inside a feature:**

- **UI state is local.** Sort order, the selected row, a draft: keep it in a
  `state()` created in the view. When the view is disposed, its state goes
  with it. For state that must survive a remount (a table's sort when its
  columns change), create it one level up and pass it in. mailab's
  `tableState()` does this.
- **Preferences are `persisted()`.** Theme, the last tab, a display name.
- **Fetch per feature with `resource`.** Data that only one feature needs
  (`/classifier`, `/datasheets/…`) is a `resource()` in that feature, not a
  field on the global store. Add `poll(() => res.reload(), ms)` if it must
  stay fresh. The poll pauses in hidden tabs and stops with the view.
- **Reacting to config is `onChange`.** "Reload when `props.pane.config.device`
  changes" is `onChange(() => props.pane.config.device, reload)`. Don't build
  it from `effect` + `untracked` + a `last` variable.
- **Imperative widgets go through `embed`.** uPlot, xterm, noVNC, a canvas:
  `embed((host) => new uPlot(opts, data, host))`. It creates the widget once
  the host is attached, resizes it and destroys it, all tied to the view's
  lifetime.
- **Every listener, observer or timer you write yourself gets an
  `onDispose` in the same edit.** The helpers above already register theirs.

### Feature registry and lazy loading

mailab imports all 33 pane modules eagerly into one bundle. With a bundler,
load the rarely used ones on demand:

```js
// app/features.js
import devices from "../features/devices.js";      // always needed: static import

export const FEATURES = {
	devices: () => Promise.resolve(devices),
	hex: () => import("../features/hex.js").then((m) => m.default),
	board: () => import("../features/board.js").then((m) => m.default)
};
```

```js
import { resource, asyncView } from "@nemanjan00/qrp/resource";

const feature = (type, ctx, props) => {
	const loaded = resource(() => FEATURES[type]());
	return asyncView(loaded, {
		loading: () => el("div", { class: "muted" }, "loading…"),
		error: (error) => el("div", { class: "error" }, String(error.message || error)),
		data: (view) => view(ctx, props)
	});
};
```

With no bundler, the same dynamic `import()` works natively in the browser.

## 4. The shell

**When qrp owns the page**, the shell is ordinary qrp: `router()` for pages,
`list()` and `when()` for which features show, and `mount()` once at the root.

**When a layout library owns the DOM** (GridStack, golden-layout, a docking
manager), use `reconcile` to keep the library's widgets in step with the
store, and `island` to put a qrp view inside each one:

```js
import { reconcile, island } from "@nemanjan00/qrp/host";

reconcile(() => lab.panes.filter((p) => p.tab === ui.tab), (p) => p.id, {
	create: (pane) => {
		const item = grid.addWidget({ id: pane.id, x: pane.x, y: pane.y, w: pane.w, h: pane.h });
		const body = item.querySelector(".pane-body");
		return { item, panel: island(body, (props) => feature(pane.type, ctx, props), { pane }) };
	},
	update: (widget, pane) => {
		grid.update(widget.item, { x: pane.x, y: pane.y, w: pane.w, h: pane.h });
		widget.panel.update({ pane });
	},
	recreate: (prev, next) => prev.type !== next.type,
	destroy: (widget) => grid.removeWidget(widget.item)
});
```

- `create` runs in a scope per item. Anything it builds (the island, effects,
  `embed`s inside the feature) is disposed when that item's key goes away. You
  only undo what the layout library did.
- `island` props are reactive, so `update({ pane })` re-renders only the
  bindings that read what changed. mailab compared panes with
  `JSON.stringify` and pushed every change; `island` makes that unnecessary.
- When the layout library reports its own changes (a drag ends), send them as
  a command (`http.put("/layout", …)`) and let the server's update come back
  through `assign`. Ignore the echo while applying remote updates. mailab's
  `applyingRemote` flag does this.

## 5. Errors and diagnostics

- Register `onEffectError` once in the shell and route errors to your
  reporting (or a toast). Name important effects (`effect(fn, { name })`,
  `onChange(…, { name })`) so reports say which feature failed.
- Show connection state somewhere permanent: `live.status.connected`.
- Show failed commands as toasts. `createHttp` emits `error` on the bus, so a
  toast stack shows them with no per-call `catch`.

## 6. Testing at scale

Features take `ctx` and `props`, so test them without a server:

```js
import "./setup.js";   // happy-dom globals, as in qrp's own tests
import { state, mount } from "@nemanjan00/qrp";
import devices from "../features/devices.js";

const ctx = { lab: state({ devices: [{ id: "psu", driver: "mdp", status: "ok" }] }) };
const root = document.createElement("div");
const view = mount(root, () => devices(ctx, {}));

ctx.lab.devices[0].status = "error";
// assert on root.textContent / classes, then:
view.dispose();
```

- Writes are synchronous, so assertions run right after the write. Nothing to
  await.
- Test the store wiring separately: feed fake messages into a `socket`
  replaced by a stub (qrp's own `test/socket.test.js` shows one) and assert
  on `lab`.
- For each feature, a mount → dispose test with a counter on `onDispose`
  catches the leaks that only show up after an hour of opening and closing
  panes.

## 7. File layout

```
app/
  transport.js     socket + http (no UI)
  store.js         state objects + transport → store wiring
  context.js       the ctx object features receive
  features.js      type → () => Promise<view>
  shell.js         layout/router, reconcile + island, header, banners
features/
  devices.js       export default (ctx, props) => renderable
  chart.js
  …
sdk/               your design-system helpers on qrp (mailab's GUI SDK: pane(), table(), toolbar(), …)
test/
```

mailab's `public/sdk` is a good example of the last folder. It holds a small
set of styled helpers (`table`, `toolbar`, `iconButton`, `numberField`) so a
feature reads like a declaration of what it shows. Build those helpers on
qrp's modules (`table`, `collection`, `behaviors`). Don't reimplement them.

## 8. Working with coding agents

Large apps are where an agent writes a feature having read one file. Two
lines in the app's own CLAUDE.md / AGENTS.md prevent most duplicate code:

```md
- UI is qrp. Before writing a helper, check node_modules/@nemanjan00/qrp/docs/RECIPES.md;
  for structure (where state lives, how features mount), docs/LARGE-APPS.md.
- If qrp lacks something, propose a qrp change instead of a local copy.
```

Point the agent at a short, real feature as the template for new ones. A
pane that uses `resource`, `table` and `onChange` teaches more than the docs
do.
