/**
 * @module utils
 * Pure data helpers a dashboard needs (one file each, or the whole set via the
 * `@nemanjan00/qrp/utils` barrel): `memoize` (with `ttl`/`invalidate`), `lru`,
 * `cacheForever`/`precache`/`precacheWithRefresh`, `paginate`/`pageCount`,
 * `limit` (concurrency + rate + timeout), `debounce`/`throttle` (scope-aware),
 * `validate` (schema checker), and `loadScript` (reactive UMD loader).
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
