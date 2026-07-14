import type { Renderable } from "../qrp/index.js";

/**
 * Build DOM from an HTML template (tagged, `${}` holes) or a plain string.
 * Text holes are escaped; `${() => …}` holes are reactive; `onX=${fn}` wires
 * a listener. Returns the single root node, or a DocumentFragment.
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
