/**
 * @module store
 * Plumbing for an app-wide store that mirrors a server (see
 * docs/LARGE-APPS.md). `assign(target, patch)` merges a snapshot in one batch,
 * writing only changed keys. `append(array, items, max)` keeps a capped feed.
 * `coalesce(target, { interval })` turns a high-rate stream into one batched
 * write every `interval` ms (latest value per key wins).
 */

/**
 * Merge `patch` into a reactive object in one batch, writing only keys whose
 * value changed (`Object.is`). `prune` deletes keys the patch lacks. Returns the
 * changed keys.
 * @example
 * live.on("state", (msg) => assign(lab, msg.state));
 */
export function assign<T extends object>(target: T, patch: Partial<T>, options?: { prune?: boolean }): string[];

/**
 * Append item(s) to a reactive array, dropping the oldest past `max`, in one
 * batch.
 * @example
 * live.on("activity", (msg) => append(lab.activity, msg.entry, 500));
 */
export function append<T>(array: T[], items: T | T[], max?: number): T[];

export interface CoalesceOptions {
	/** ms between flushes (default 250), or "frame" for the next animation frame. */
	interval?: number | "frame";
}

export interface Coalesced<T> {
	/** Queue a value; it lands on `target[key]` at the next flush (latest wins). */
	set<K extends keyof T>(key: K, value: T[K]): void;
	/** Apply everything pending now. */
	flush(): void;
	/** Cancel the pending flush and drop queued values (also on scope dispose). */
	dispose(): void;
}

/**
 * Buffer high-rate writes and apply them to `target` in one batch per
 * `interval`, skipping unchanged values.
 * @example
 * const values = coalesce(lab.live, { interval: 250 });
 * live.on("samples", (msg) => values.set(msg.name, msg.last));
 */
export function coalesce<T extends object>(target: T, options?: CoalesceOptions): Coalesced<T>;
