# Styling qrp

qrp ships **helpers to build styled components, not styled components** — so the
look is yours. It never injects a stylesheet; `qrp.css` is opt-in. You have three
ways to style, and they mix freely.

## 1. Bring your own CSS

`el()` and `html` pass `class`/`style` straight through, so style however you
like — plain CSS, CSS modules, whatever:

```js
el("button", { class: "my-btn", style: "padding:.5rem 1rem" }, "Save");
el("div", { class: () => `card ${active ? "card--on" : ""}` }, …);   // reactive
```

The batteries (`table`, `toasts`, forms) emit **stable semantic class names** you
can target from your own CSS — no need to link `qrp.css` at all (see the
[reference](#emitted-class-reference) below).

## 2. Use the `qrp.css` baseline

`qrp.css` is a tiny, optional baseline — design tokens + a light/dark theme +
styles for the semantic classes. Link it yourself (qrp never does):

```html
<link rel="stylesheet" href="@nemanjan00/qrp/qrp.css">
<!-- or, no bundler: https://esm.sh/@nemanjan00/qrp/qrp.css -->
```

Everything is driven by **CSS custom properties**, so you re-skin the whole thing
by overriding a few tokens — no need to fork the file:

```css
:root {
  --qrp-accent: #ff6a00;      /* brand color */
  --qrp-radius: 4px;
  --qrp-font: "Inter", system-ui, sans-serif;
}
```

(The marketing site does exactly this — it links `qrp.css` and retints the tokens
to match its palette.)

### Design tokens

| Token | Role |
|---|---|
| `--qrp-bg` | page / control background |
| `--qrp-surface` | raised surface (cards, header rows) |
| `--qrp-fg` | body text |
| `--qrp-muted` | secondary text |
| `--qrp-border` | borders / dividers |
| `--qrp-accent` / `--qrp-accent-fg` | primary color / its foreground |
| `--qrp-success` / `--qrp-warning` / `--qrp-danger` / `--qrp-info` | status colors |
| `--qrp-radius` | corner radius |
| `--qrp-gap` / `--qrp-pad` | spacing |
| `--qrp-shadow` | elevation |
| `--qrp-font` | base font stack |

### Dark mode

`qrp.css` ships a light theme by default, switches on `prefers-color-scheme:
dark`, and lets an explicit attribute win — set `data-theme="dark"` (or
`"light"`) on `<html>` for a manual toggle:

```js
document.documentElement.dataset.theme = dark ? "dark" : "light";
```

## 3. Use a CSS framework (Bootstrap, Tailwind, …)

Because `class` passes through everywhere — including into form controls (a field
spec's `class`/any non-meta key reaches the input) — you can drop qrp into an
existing design system without `qrp.css`:

```js
// Bootstrap-styled form field, no qrp.css
field(settings, "email", { name: "Email", type: "email", class: "form-control" });
el("button", { class: "btn btn-primary" }, "Save");
```

## Emitted class reference

Classes qrp puts on the elements it builds, so you can style them from any CSS.
`qrp.css` styles all of these; if you skip it, they're yours to define.

**Table** (`table`, `tablePager`, `tableSummary`)

| Class | Element |
|---|---|
| `qrp-table` | the `<table>` |
| `qrp-th` | header cells |
| `qrp-sortable` | a sortable header cell |
| `qrp-sort` | the sort-direction indicator |
| `qrp-rowgroup` | a `<tbody>` row-group (expandable tables) |
| `qrp-expand` | a detail `<tr>` (expandable rows) |
| `qrp-pager` / `qrp-pager-btn` / `qrp-pager-gap` | pagination control |
| `qrp-summary` | the "Showing X–Y of Z" text |

**Toasts** (`toasts` / `notify`)

| Class | Element |
|---|---|
| `qrp-toasts` | the stack container |
| `qrp-toast` | one toast |
| `qrp-toast-success` / `-error` / `-info` / `-warning` | per variant |
| `qrp-toast-title` / `qrp-toast-body` / `qrp-toast-close` | parts |

**Forms** (`form` / `field`) — note these are **not** `qrp-`prefixed:

| Class | Element |
|---|---|
| `settings-container` | the form wrapper |
| `settings-section` | a section group |
| `setting-item` | a labelled field row |
| `radio-group` / `radio-option` | radio inputs |
| `textarea-input` | the `textual()` editor |
| `description` | a field's help text |

**Baseline components in `qrp.css`** (not emitted — apply them yourself when
hand-building modals, cards, buttons, badges, spinners): `qrp-btn`
(`qrp-btn-primary`), `qrp-card` (`qrp-card-header`), `qrp-badge`
(`qrp-badge-success`/`-warning`/`-danger`/`-info`), `qrp-modal`
(`qrp-modal-backdrop`), `qrp-overlay`, `qrp-spinner`.

---

See the **[Getting Started guide](./GETTING-STARTED.md)** for building components
and the **[API reference](./API.md)** for the modules that emit these classes.
