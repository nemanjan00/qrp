import type { Props } from "../qrp/index.js";

/** What `create` may return: an instance with optional hooks, a teardown, or nothing. */
export type Embedded = { resize?(width: number, height: number): void; destroy?(): void } | (() => void) | void | null | undefined;

export interface EmbedOptions {
	/** Host tag (default "div"). */
	tag?: string;
	/** el() props for the host element. */
	props?: Props;
}

/**
 * Host an imperative widget (uPlot, a canvas, a map, xterm) in qrp DOM. Returns
 * the host; `create(host)` runs once the host is connected (so it can measure),
 * its `resize(width, height)` runs when the host resizes, and `destroy()` (or
 * the returned teardown) runs when the enclosing scope disposes.
 */
export function embed(create: (host: HTMLElement) => Embedded, options?: EmbedOptions): HTMLElement;
