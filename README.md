# qrp

**A data-first, declarative, low-overhead framework for dashboards.** Zero
dependencies, zero build step, one mental model. Named after QRP — the ham-radio
practice of getting the job done with the least possible power.

qrp does one thing and does it well: turn **data** into a **dashboard** — the
settings panels, forms, tables, and views that make up an admin/control UI —
with the least machinery possible. It is not trying to be a general-purpose
application framework that competes with React; it is trying to be the right
tool for the large class of apps that are, at heart, "render this data, let me
edit it, reflect the changes."

Its four commitments:

- **Data first.** Reactive state (a `Proxy`) is the single source of truth; the
  DOM is just a reflection of it. You mutate data, the view follows.
- **Declarative first.** Forms are described as data, routes as patterns,
  elements through a helper — you say *what*, not *how*.
- **Low overhead.** ~9 KB gzipped, ~12 ms to first paint, no runtime to boot,
  no hydration, no virtual DOM (measured — see below).
- **Do one thing well.** Small, sharp, composable modules; include only what a
  given dashboard needs.

qrp is also a reaction to modern frontend: the split into "frontend app" +
"backend app" that duplicates state, validation, types, and auth, then papers
over the duplication with more machinery than it removed. qrp keeps the good
ideas the platform already gives you — the DOM, `URL`, `EventTarget`, custom
elements, the History API, `Proxy` — and adds only the thin reactive layer that
ties them together.

It's a `<script type="module">` and a handful of files. No compiler, no JSX, no
virtual DOM, no `node_modules` to render a form. The `package.json` here exists
only to run the tests.

## The one idea: Proxy-based reactive state

`state()` wraps a plain object in a `Proxy`. Reads inside an `effect()` are
tracked *per key*; a write re-runs only the effects that read that key. State is
per-component by construction — call `state()` inside a component function and it
lives in that closure.

```js
import { state, effect, el } from "./qrp/index.js";

const counter = state({ n: 0 });

effect(() => console.log("n is", counter.n)); // logs immediately, and on change

counter.n++; // → "n is 1"
```

Nested objects are wrapped lazily. Adding or deleting keys is reactive too
(iteration is tracked), so a form can grow and shrink rows live.

## Building DOM

`el(tag, props, ...children)` is a plain-DOM helper — it returns a real element,
never a virtual one. Function-valued props and children are reactive:

```js
el("button", { onclick: () => counter.n++ }, "+1");
el("span", {}, () => `count: ${counter.n}`);          // reactive text
el("ul", {}, () => items.map(i => el("li", {}, i.name))); // reactive list
```

### Two ways to bind

**Declarative** — `bind: [state, key]` is two-way for inputs, selects, textareas
(with number/checkbox coercion):

```js
el("input", { type: "number", bind: [settings, "ID"] });
```

**Novel: reactive node proxies** — wrap a real node in a `Proxy` and *assign* to
its properties. Function assignments become live bindings; it reads like
imperative DOM but is fully reactive:

```js
import { reactive } from "./qrp/index.js";

const span = reactive(document.createElement("span"));
span.textContent = () => `count: ${counter.n}`; // fn → reactive effect
span.className   = "big";                         // value → set once
span.onclick     = () => counter.n++;             // on* fn → listener
parent.appendChild(span); // qrp unwraps the proxy to the real node for you
```

## Components, scopes, cleanup

A component is just `(parent) => { ...appendChild... }`. `mount()` runs it inside
an ownership **scope**: every effect created during the render belongs to the
component and is disposed when it unmounts. No manual unsubscribe bookkeeping,
no leaks.

```js
import { mount } from "./qrp/index.js";

const app = mount(document.getElementById("view"), (view) => {
	view.appendChild(el("h1", {}, () => `Hello ${name.value}`));
});

app.dispose(); // tears down effects + DOM
```

## Real custom elements, no classes

`define()` registers a genuine Custom Element — the browser's own component
model — but builds the constructor and prototype chain by hand (`__proto__`,
`Object.create`), no `class`/`extends`. Observed attributes arrive as reactive
state:

```js
import { define } from "./qrp/index.js";

define("qrp-greeting", (host, attrs) => {
	host.appendChild(el("p", {}, () => `Hello, ${attrs.name || "world"}`));
}, { attrs: ["name"] });
```

```html
<qrp-greeting name="Nemanja"></qrp-greeting>
```

Effects created in setup are scoped to the element and disposed on disconnect;
a `qrp:disconnect` event fires first so you can release timers/sockets.

## Declarative forms with an open type registry

Describe fields as data; values live in one reactive state object; inputs are
two-way bound. A field names its input **type** as a string, resolved from a
registry you can extend at runtime:

```js
import { form, registerInput, inputs } from "./forms/index.js";

const settings = state({ NICK: "", VOL: 5, MODE: "dmr" });

// Register your own input type once, use it declaratively anywhere.
registerInput("callsign", (settings, key, field) => {
	const input = inputs.text(settings, key, field);
	input.addEventListener("input", () => { settings[key] = input.value.toUpperCase(); });
	return input;
});

view.appendChild(form({
	settings,
	fields: {
		NICK: { name: "Nick",   type: "text" },
		CS:   { name: "Call",   type: "callsign" },              // custom type
		VOL:  { name: "Volume", type: "range", min: 0, max: 10 },
		MODE: { name: "Mode",   type: "select", options: { dmr: "DMR", ysf: "YSF" } }
	},
	sections: [{ name: "Radio", filter: () => true }]
}));
```

Built-in types: every native `<input>` variant (`text`, `number`, `email`,
`password`, `url`, `tel`, `search`, `date`, `time`, `datetime-local`, `month`,
`week`, `color`, `range`, `checkbox`), plus `textarea`, `select`, and `radio`.
A live `textual()` textarea can edit the same state as the form, both
directions at once.

## HTML5 History routing

`router()` matches `location.pathname` against Express-style patterns
(`:param`, `:rest*`), extracts params and the query, intercepts same-origin link
clicks, and re-renders on back/forward — and on *any* `pushState`, even from
third-party code (it wraps `pushState` and emits an event, the trick from the
tracker syncer). Uses native `URL`/`URLSearchParams` throughout. The previous
route's scope is disposed on navigation.

```js
import { router, navigate } from "./qrp/index.js";

router({
	"/": home,
	"/settings/:section": settings,
	"/files/:path*": fileBrowser
}, document.getElementById("view"));

navigate("/settings/user"); // programmatic
```

Route strings are the same convention as a path-to-regexp backend router, so
front and back can share them verbatim.

## The modules

| File | What it gives you |
|------|-------------------|
| `qrp/index.js` | Core: `state`, `effect`, `derive`, `raw`, `el`, `reactive`, `bind`, `mount`, `scope`, `define`, `router`, `navigate`, `compilePath`, `matchPath` |
| `forms/index.js` | Declarative settings forms over reactive state; an open input-type registry (`registerInput`); `parseKV`/`serializeKV`; live "textual mode" editing the same state |
| `browser/index.js` | Reactive facades over browser APIs everyone forgot: `persisted` (localStorage + cross-tab sync), `query` (URL as state), `hashState`, `media`, `viewport`, `online`, `visible`, `seen` (IntersectionObserver), `cookies`, `watch` |
| `events/index.js` | Global event bus on native `EventTarget`: `emitter`, `bus`, `request`/`respond`, `fromEvent`, `channel` (cross-tab via BroadcastChannel), `broadcast` |
| `toasts/index.js` | Notifications driven by the event bus: `notify.success/error/info/warning`, `toasts` (mountable stack), `createToasts`; content is any renderable |
| `proto/index.js` | Prototype-level enhancement: `findProto`, `wrapMethod` (idempotent), `onceOnly`, `delegate` |

Include only what you use — each is an independent ES module.

## Forgotten browser tricks, made reactive

The platform already ships most of what frameworks reinvent. qrp-browser wraps
the good parts as qrp state, so they compose with `effect()`/`el()`:

```js
import { persisted, query, media } from "./browser/index.js";

const prefs = persisted("app", { theme: "dark" }); // survives reload + syncs across tabs
const params = query();                              // the URL *is* your store
const dark = media("(prefers-color-scheme: dark)");  // reactive dark mode

effect(() => document.body.classList.toggle("dark", dark.matches));
```

## Notifications, off the event pipe

A dashboard needs toasts. In qrp they ride the global bus, so any code — a
service call, a keyboard handler, a validation — can raise one without importing
the toast UI:

```js
import { toasts, notify } from "./toasts/index.js";

mount(document.body, toasts.component); // once, near the root

notify.success("Settings saved");
notify.error("Could not reach the hotspot");

// content is a RENDERABLE, not just a string:
notify.error(el("span", {}, "Save failed — ", el("a", { href: "/logs" }, "see logs")));
```

Variants: `success`, `error`, `info`, `warning`. Identical string messages
inside a short window are deduped (retry storms don't bury the screen); toasts
auto-dismiss. Because a DOM node can only live in one place (see below), reuse
the same content across toasts by passing a thunk `() => el(...)`, not a shared
node.

> **Aside — can the same element be in two places?** No. A DOM node has exactly
> one parent; inserting it elsewhere *moves* it. Relatedly, you cannot hand a
> `Proxy`-wrapped node to the DOM at all — `appendChild` brand-checks its
> argument and throws `parameter 1 is not of type 'Node'` (verified in
> Chromium). That's why `reactive()` unwraps to the raw node on insert, and why
> `state()` never wraps DOM nodes/Maps/class instances stored inside it.

## A global event bus

Propagate changes everywhere over the platform's own `EventTarget`:

```js
import { bus, fromEvent } from "./events/index.js";

bus.on("user:login", user => console.log("hi", user.name));
bus.emit("user:login", { name: "Nemanja" });

const lastLogin = fromEvent(bus, "user:login", u => u.name); // event → state

// request/response over the bus (like the tracker syncer's sendCommand):
bus.respond("add", ({ a, b }) => a + b);
await bus.request("add", { a: 2, b: 3 }); // → 5
```

## Measured, in a real browser

Driven headless in Chromium (served over `http.server`, `examples/todomvc.html`):

| Metric | qrp TodoMVC |
|---|---|
| First contentful paint | **12 ms** |
| DOMContentLoaded | 12 ms |
| Fully loaded | 15 ms |
| JS heap used | 1.45 MB |
| DOM nodes | 26 |
| Bytes over the wire (core + browser module, uncompressed) | ~26 KB (~9 KB gzipped) |

There is no framework runtime to boot, no hydration pass, no bundle to parse
before the app is interactive — the page paints as fast as the browser can read
three small modules. For contrast, a React runtime alone is ~45 KB gzipped
*before* any application code, and ships a hydration step qrp simply doesn't
have. (Those framework figures are from published bundle sizes, not measured
here; the qrp numbers above are measured.)

## Running the demo

The demo uses real History routing, so serve it over HTTP:

```sh
python -m http.server
# open http://localhost:8000/examples/index.html
```

## Tests & tooling

```sh
npm install   # dev-only: happy-dom (tests), eslint (lint), husky (git hooks)
npm test      # node --test — 80 tests across core / forms / browser / events / toasts / proto
npm run lint  # eslint (eslint:recommended + house style)
```

The framework itself has **zero runtime dependencies**; everything in
`devDependencies` is for tests, lint, and the pre-commit hook (lint-staged +
`npm test`). Nothing is required to *use* qrp — just load the modules.

## Philosophy, in one line

Data first, declarative first, low overhead — do one thing (dashboards) and do
it well. Use the platform, add a `Proxy` for reactivity and a scope for
cleanup, ship no build step. That's the whole framework.
