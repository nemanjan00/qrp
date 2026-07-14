/**
 * @module utils
 * Pure data helpers a dashboard needs (one file each): `memoize`, `lru`,
 * `cacheForever`/`precache`/`precacheWithRefresh`, `paginate`/`pageCount`.
 */
export interface LruStore<K = any, V = any> {
	has(key: K): boolean;
	get(key: K): V | undefined;
	set(key: K, value: V): void;
	delete(key: K): boolean;
	clear(): void;
	readonly size: number;
}
/** A bounded key/value store with least-recently-used eviction. */
export function lru<K = any, V = any>(max: number): LruStore<K, V>;
