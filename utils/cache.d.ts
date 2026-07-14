/** Run a zero-arg function at most once; later calls return the first result. */
export function cacheForever<T>(method: () => T): () => T;
/** Start an async producer immediately; returns a getter for its promise. */
export function precache<T>(method: () => Promise<T>): () => Promise<T>;
export interface RefreshingGetter<T> {
	(): Promise<T>;
	refresh(): Promise<T>;
	stop(): void;
}
/** Keep an async producer's result fresh on an interval. */
export function precacheWithRefresh<T>(method: () => Promise<T>, refreshTime?: number, callback?: (promise: Promise<T>) => void): RefreshingGetter<T>;
