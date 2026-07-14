export interface LimitOptions {
	/** Max concurrent in-flight calls (default 1). */
	max?: number;
	/** Max calls STARTED per second (default: unlimited). */
	perSecond?: number;
	/** Per-call timeout in ms; rejects with Error("timeout") (default: none). */
	timeout?: number;
}

/**
 * Rate-limit an async function: cap concurrency, throughput, and per-call time.
 * Pass a number for concurrency-only, or an options object for all three.
 * Excess calls queue FIFO; each call returns a Promise.
 */
export function limit<A extends any[], R>(
	fn: (...args: A) => R | Promise<R>,
	options?: number | LimitOptions
): (...args: A) => Promise<R>;
