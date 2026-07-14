/** A rate-limited wrapper with an imperative cancel for its pending timer. */
export interface RateLimited<A extends any[]> {
	(...args: A): void;
	/** Drop any pending trailing call. */
	cancel(): void;
}

/** Delay fn until `ms` after the last call. Scope-aware: auto-cancels on dispose. */
export function debounce<A extends any[]>(fn: (...args: A) => any, ms?: number): RateLimited<A>;

/** Call fn at most once per `ms` (leading + trailing). Scope-aware: auto-cancels on dispose. */
export function throttle<A extends any[]>(fn: (...args: A) => any, ms?: number): RateLimited<A>;
