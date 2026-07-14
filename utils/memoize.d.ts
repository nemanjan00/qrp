import type { LruStore } from "./lru.js";
export interface MemoizeOptions {
	/** args => cache key (default JSON.stringify). */
	key?: (args: any[]) => unknown;
	/** LRU bound (omit for unbounded; 0 = retain nothing). */
	max?: number;
	/** Custom { has, get, set, delete? } store. */
	store?: Partial<LruStore> & { has(k: any): boolean; get(k: any): any; set(k: any, v: any): void };
}
/** Memoize a sync/async function by its args (async calls deduped in flight). */
export function memoize<F extends (...args: any[]) => any>(fn: F, options?: MemoizeOptions): F;
