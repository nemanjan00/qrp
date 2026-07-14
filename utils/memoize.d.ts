import type { LruStore } from "./lru.js";
export interface MemoizeOptions {
	/** args => cache key (default JSON.stringify). */
	key?: (args: any[]) => unknown;
	/** LRU bound (omit for unbounded; 0 = retain nothing). */
	max?: number;
	/** ms an entry stays fresh; for a promise the clock starts when it resolves. */
	ttl?: number;
	/** Custom { has, get, set, delete?, clear? } store. */
	store?: Partial<LruStore> & { has(k: any): boolean; get(k: any): any; set(k: any, v: any): void };
}
/** A memoized function with imperative cache invalidation. */
export type Memoized<F extends (...args: any[]) => any> = F & {
	/** Clear one entry (by the same args) or the whole cache (no args). */
	invalidate(...args: Parameters<F>): void;
};
/** Memoize a sync/async function by its args (async calls deduped in flight). */
export function memoize<F extends (...args: any[]) => any>(fn: F, options?: MemoizeOptions): Memoized<F>;
