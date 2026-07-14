import type { Renderable } from "../qrp/index.js";

/**
 * @module html
 * Author DOM as HTML strings. Three forms: `` html`…` `` / `html("…")` (inline,
 * `${}` holes), `html.template("…#{field}…")` (storable, filled from data), and
 * `ref()` (inject a live node into a plain string).
 *
 * **Escaping — the precise guarantee.** A value interpolated in **text** position
 * (a child hole, `${}` or `#{}`) is rendered as a text node — it never touches
 * `innerHTML`, so it can't inject an element, `<script>`, or event handler,
 * whatever string it holds. Attribute values are set verbatim (via
 * `setAttribute`/property — never re-parsed as HTML, so no breakout into a new
 * attribute or tag), **but URL schemes are NOT sanitized**: a `javascript:` value
 * in an `href` passes through, same as Lit. Don't put untrusted data in
 * `href`/`src`/`style` without your own check. Attack vectors are in
 * `test/html-xss.test.js`, verified in real Chromium.
 */

/**
 * Build DOM from an HTML template (tagged, `${}` holes) or a plain string.
 * Text holes are escaped; `${() => …}` holes are reactive; `onX=${fn}` wires
 * a listener. Returns the single root node, or a DocumentFragment.
 * @example
 * html`<button onclick=${() => count.n++}>${() => count.n}</button>`;
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Node | DocumentFragment;
export function html(markup: string): Node | DocumentFragment;

export namespace html {
	/**
	 * Compile a storable template with `#{field}` placeholders into a filler.
	 * The source is literal text (not JS interpolation), so it can be stored and
	 * filled later; fields are escaped as text and reactive when data is state.
	 * Supports dotted paths (`#{user.name}`).
	 */
	function template(source: string): (data: Record<string, any>) => Node | DocumentFragment;
}

/**
 * Register a value for embedding in a plain html() string; returns an opt-in
 * token. html() swaps it for the real node/binding (consumed on use).
 */
export function ref(value: Renderable): string;
