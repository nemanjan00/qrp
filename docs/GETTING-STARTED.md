# Getting started with qrp

This is a hands-on tour from an empty file to a small working dashboard. It takes
about ten minutes and assumes only that you know JavaScript and the DOM. There is
**no build step required** — you write an HTML file and open it. (For a real project you'd normally use npm + a bundler; qrp works identically either way — see Install below.)

- [1. Hello, reactive world](#1-hello-reactive-world)
- [2. State and effects](#2-state-and-effects)
- [3. Building DOM with `el`](#3-building-dom-with-el)
- [4. Derived values](#4-derived-values)
- [5. Conditional UI with `when`](#5-conditional-ui-with-when)
- [6. Keyed lists with `list`](#6-keyed-lists-with-list)
- [7. A small dashboard, end to end](#7-a-small-dashboard-end-to-end)
- [8. Reusable components (the factory pattern)](#8-reusable-components-the-factory-pattern)
- [9. Where to go next](#9-where-to-go-next)

---

## 0. Install (pick one)

**A. npm + a bundler** — the normal path once you have tooling:

```sh
npm i @nemanjan00/qrp
```

```js
import { state, el, mount } from "@nemanjan00/qrp";
```

**B. No bundler, straight in the browser** — a CDN that serves npm as ES modules:

```html
<script type="module">
  import { state, el, mount } from "https://esm.sh/@nemanjan00/qrp";
</script>
```

Every example below is a complete HTML file you can save and open. They use
option B so there is nothing to install. Serve over HTTP once you reach routing
(`python -m http.server`); until then `file://` is fine.

---

## 1. Hello, reactive world

The smallest possible qrp app — a counter:

```html
<!DOCTYPE html>
<div id="app"></div>
<script type="module">
  import { state, el, mount } from "https://esm.sh/@nemanjan00/qrp";

  const counter = state({ n: 0 });

  mount(document.querySelector("#app"), () =>
    el("button", { onclick: () => counter.n++ }, () => `clicked ${counter.n}×`));
</script>
```

Click it. That is the whole loop: you **mutate data** (`counter.n++`) and the DOM
**follows**. No `setState`, no re-render call, no virtual DOM. Two ideas are doing
all the work — let's name them.

---

## 2. State and effects

`state()` wraps a plain object in a `Proxy`. Reading a key inside a reactive
context **tracks** it; writing that key **re-runs** whatever read it — and nothing
else.

```js
import { state, effect } from "https://esm.sh/@nemanjan00/qrp";

const user = state({ name: "Ada", age: 36 });

effect(() => console.log("name is", user.name));  // logs immediately: "name is Ada"

user.age = 37;   // nothing logs — the effect never read `age`
user.name = "Grace";  // logs: "name is Grace"
```

`effect(fn)` runs `fn` once immediately, notes which state keys it read, and
re-runs it whenever one of those changes. That is the entire reactivity model.
Nested objects and arrays are reactive too:

```js
const store = state({ todos: [] });
effect(() => console.log(store.todos.length));
store.todos.push({ text: "learn qrp" });   // logs: 1
```

> **Tip:** `state()` only wraps plain objects and arrays. DOM nodes, `Map`/`Set`,
> and class instances are stored as-is (safe to stash in state). Freeze static
> data with `Object.freeze()` to opt out of reactivity entirely.

---

## 3. Building DOM with `el`

`el(tag, props, ...children)` returns a **real DOM element**. Props and children
that are **functions** become live bindings — an `effect` under the hood — so they
update when the state they read changes.

```js
import { state, el, mount } from "https://esm.sh/@nemanjan00/qrp";

const form = state({ first: "Ada", last: "Lovelace" });

mount(document.body, () =>
  el("div", {},
    // an event handler
    el("input", {
      value: form.first,
      oninput: (e) => form.first = e.target.value
    }),
    // a reactive text child: re-runs when form.first / form.last change
    el("p", {}, () => `Hello, ${form.first} ${form.last}`)
  ));
```

The prop rules, in one glance:

| you write | qrp does |
|---|---|
| `{ id: "x" }` | sets it once (static) |
| `{ class: () => cls }` | reactive — re-applies when `cls`'s state changes |
| `{ onclick: fn }` | adds an event listener |
| `{ value: v, oninput: … }` | sets the property; you wire the write-back |
| a child `"text"` | a text node |
| a child `() => …` | a reactive text node |
| a child `el(...)` | a nested element |

`mount(target, component)` runs a component function, appends what it returns to
`target`, and remembers every effect it created so they can be cleaned up together
later (`mount` returns a handle with `.dispose()`).

---

## 4. Derived values

When a value is *computed* from state, don't recompute it by hand — `derive()` it
once and read `.value`:

```js
import { state, derive, el, mount } from "https://esm.sh/@nemanjan00/qrp";

const cart = state({ price: 20, qty: 3 });
const total = derive(() => cart.price * cart.qty);

mount(document.body, () =>
  el("p", {}, () => `Total: $${total.value}`));   // updates when price or qty change
```

`derive` is a cached effect: it recomputes only when its inputs change, and
readers of `.value` re-run only when the result actually changes.

---

## 5. Conditional UI with `when`

To show one of two subtrees based on a condition — and tear down the one that
leaves — use `when(condition, thenBranch, elseBranch)`:

```js
import { state, el, when, mount } from "https://esm.sh/@nemanjan00/qrp";

const ui = state({ editing: false, name: "Katherine" });

mount(document.body, () =>
  el("div", {}, when(
    () => ui.editing,
    () => el("input", {
      value: ui.name,
      onblur: () => ui.editing = false,
      oninput: (e) => ui.name = e.target.value
    }),
    () => el("strong", { ondblclick: () => ui.editing = true }, () => ui.name)
  )));
```

Double-click to edit. `when` swaps the branch **and disposes the old branch's
effects** — no leaks, no manual DOM surgery. It's the tool for edit-vs-display,
loading-vs-loaded, and permission-gated panels.

---

## 6. Keyed lists with `list`

`list(source, keyFn, render)` turns an array into DOM and **reuses elements** as
the array changes — the primitive under every table.

```js
import { state, el, list, mount } from "https://esm.sh/@nemanjan00/qrp";

const store = state({ todos: [
  { id: 1, text: "learn state" },
  { id: 2, text: "learn list" }
] });
let nextId = 3;

mount(document.body, () =>
  el("div", {},
    el("button", { onclick: () => store.todos.push({ id: nextId++, text: "new" }) }, "Add"),
    el("ul", {}, list(
      () => store.todos,        // source: a THUNK returning the array (note the parens)
      (todo) => todo.id,        // key: a stable, unique id per item
      (todo) => el("li", {}, () => todo.text)   // render: built once per key
    ))
  ));
```

Three things to remember:

- **The source is a thunk** — `() => store.todos`, not `store.todos`. It's read
  reactively so the list re-runs when the data changes. (If the data comes from a
  `collection`, that's `() => view.items()` — `items()` is a method.)
- **Keys must be unique.** Reorder, insert, or remove and qrp *moves* the existing
  elements instead of rebuilding them (a 2-row swap is 1 DOM move, not a redraw).
- **`render` runs once per key.** A surviving row updates in place through its own
  reactive bindings.

---

## 7. A small dashboard, end to end

Putting it together — a live, filterable list with a derived count, an add form,
and conditional empty-state. This is a real dashboard in ~30 lines:

```html
<!DOCTYPE html>
<div id="app"></div>
<script type="module">
  import { state, el, list, when, derive, mount } from "https://esm.sh/@nemanjan00/qrp";

  const store = state({
    items: [
      { id: 1, name: "Sensor A", online: true },
      { id: 2, name: "Sensor B", online: false },
      { id: 3, name: "Sensor C", online: true }
    ],
    query: ""
  });
  let nextId = 4;

  const visible = derive(() =>
    store.items.filter((i) => i.name.toLowerCase().includes(store.query.toLowerCase())));
  const onlineCount = derive(() => store.items.filter((i) => i.online).length);

  const addItem = () => store.items.push({ id: nextId++, name: `Sensor ${nextId}`, online: true });

  mount(document.querySelector("#app"), () =>
    el("div", {},
      el("h1", {}, () => `Devices — ${onlineCount.value} online`),

      el("div", {},
        el("input", {
          placeholder: "Filter…",
          value: store.query,
          oninput: (e) => store.query = e.target.value
        }),
        el("button", { onclick: addItem }, "Add device")),

      when(
        () => visible.value.length > 0,
        () => el("ul", {}, list(
          () => visible.value,
          (i) => i.id,
          (i) => el("li", {},
            el("strong", {}, () => i.name),
            el("button", {
              onclick: () => i.online = !i.online
            }, () => i.online ? " ● online" : " ○ offline"))
        )),
        () => el("p", {}, "No devices match."))
    ));
</script>
```

Everything here is the five concepts from above: `state` holds the truth,
`derive` computes the filtered view and the count, `list` renders rows and reuses
them as you filter, `when` handles the empty state, and toggling `i.online`
updates one button through its own binding. No re-render, no reconcile pass.

---

## 8. Reusable components (the factory pattern)

qrp has no `Component` class and no registration step — **a component is just a
function that returns DOM.** To make one reusable, write a factory that takes its
inputs and returns an `el()` tree. That's the whole pattern.

```js
// a component = a function returning a node
const Card = ({ title, body }) =>
  el("div", { class: "card" },
    el("h3", {}, title),
    el("p", {}, body));

// use it — and reuse it — like any function
el("div", { class: "grid" },
  Card({ title: "Reach",   body: "12,481" }),
  Card({ title: "Follows", body: "312" }));
```

**Props are just arguments.** Pass plain values for static content, or a
**thunk / reactive state** for content that should update:

```js
const Stat = ({ label, value }) =>          // value can be a value OR a () => …
  el("div", { class: "stat" },
    el("strong", {}, value),                // el renders a function child reactively
    el("span", { class: "dim" }, label));

const m = state({ reach: 0 });
Stat({ label: "Reach", value: () => m.reach.toLocaleString() });  // live
m.reach = 12481;                             // the strong updates in place
```

**Composition is just calling factories from factories** — no special API:

```js
const Field = ({ label, input }) =>
  el("label", { class: "field" }, el("span", {}, label), input);

const SearchBox = ({ filter }) =>
  Field({ label: "Search", input:
    el("input", { oninput: (e) => filter.q = e.target.value }) });
```

**One gotcha, and it's why factories matter:** a DOM node lives in exactly one
place, so you can't reuse the *same* node twice — you call the factory again to
get a fresh one. That's also why `list()` and repeated slots take a **thunk**:

```js
const Divider = () => el("hr");
el("div", {}, Divider(), Divider());        // ✓ two calls → two nodes
// el("div", {}, theSameNode, theSameNode);  // ✗ the second move steals the first
```

**Lifecycle & cleanup come for free.** Effects a factory creates (via a reactive
prop, `derive`, or `effect`) are owned by the enclosing `mount`/`scope` and
disposed with it — no `unmounted` hook to remember. If a component sets up
something external (a timer, a subscription), register cleanup with `onDispose`:

```js
const Clock = () => {
  const t = state({ now: Date.now() });
  const id = setInterval(() => t.now = Date.now(), 1000);
  onDispose(() => clearInterval(id));        // runs when the owner unmounts
  return el("time", {}, () => new Date(t.now).toLocaleTimeString());
};
```

Want a component with its *own* lifecycle boundary (opened from an event handler,
or reused as a real HTML tag)? Reach for [`scoped()`](./API.md#qrp--core) (owns a
detached subtree's effects → `{ value, dispose }`) or
[`define()`](./API.md#qrp--core) (registers a real Custom Element). But for the
common case, a plain factory function is all you need — that's the point.

---

## 9. Where to go next

You now know the core. The rest of qrp is optional modules you import only when a
dashboard needs them:

- **[Forms](./API.md#forms)** — declarative forms from a field spec, with an open
  input-type registry. `form({ settings, fields })` is often the whole settings UI.
- **[Tables](./API.md#table)** — `table()` = `collection` (sort/filter/paginate) +
  `list` (keyed reuse), configured by columns.
- **[HTML templates](./API.md#html--html-templates)** — write markup as HTML
  strings with `` html`` `` if you prefer that to `el()`.
- **[HTTP](./API.md#http)** — a `fetch` client with a reactive in-flight loader
  and centralized errors.
- **[Routing](./API.md#qrp--core)** — `router()` with `:param` patterns over the
  History API.
- **[Behaviors](./API.md#behaviors)** — headless `portal` / `trapFocus` /
  `dismissable` / `anchored` / `disclosure` to build modals, dropdowns, tooltips.
- **[Events](./API.md#events)**, **[toasts](./API.md#toasts)**,
  **[browser wrappers](./API.md#browser)** (reactive `localStorage`, `matchMedia`,
  the URL, …), and **[utils](./API.md#utils)** (memoize/lru/cache/paginate).

**Keep going:**

- **[Full API reference](./API.md)** — every export, signature, and example.
- **[Sharp edges](./SHARP-EDGES.md)** — the handful of behaviors worth knowing once.
- **[Styling](./STYLING.md)** — bring your own CSS, the qrp.css baseline, or a framework.
- **[Live demo](https://qrp.nemanja.top/)** — every feature running.
- **[Runnable examples](../examples/)** — `table.html`, `todomvc.html`, and an
  [ESP32 dashboard](../examples/esp32/) that fits in a microcontroller's flash.

Happy hacking. *Beep boop.*
