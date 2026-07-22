/**
 * @module resource
 * Reactive async data — `loading`/`data`/`error`/`reload`, transport-agnostic
 * (hand it a fetcher thunk). Optional `refreshOn` wires it to the event bus for
 * global refresh. `asyncView` maps the state to `when` branches.
 */
import type { WhenMarker } from "../qrp/index.js";

export interface ResourceOptions<T> {
	/** Value for `data` before the first load (e.g. SSR-injected). */
	initial?: T | null;
	/** Load on creation (default true). */
	immediate?: boolean;
	/** Emitter for `refreshOn` (default the global bus). */
	bus?: { on(type: string, handler: (...args: any[]) => void): () => void };
	/** Bus event(s) that trigger a reload. */
	refreshOn?: string | string[];
}

export interface Resource<T> {
	/** Reactive: the latest data (or `initial`/null). */
	readonly data: T | null;
	/** Reactive: a fetch is in flight. */
	readonly loading: boolean;
	/** Reactive: the last error, or null. */
	readonly error: unknown;
	/** Trigger a reload; returns the settling promise. */
	reload(): Promise<void>;
}

export function resource<T>(fetcher: () => Promise<T>, options?: ResourceOptions<T>): Resource<T>;

export interface AsyncViews<T> {
	loading?: () => unknown;
	error?: (error: unknown) => unknown;
	empty?: () => unknown;
	data?: (data: T) => unknown;
}

/** Map a resource's state to `when` branches (loading/error/empty/data). */
export function asyncView<T>(res: Resource<T>, views?: AsyncViews<T>): WhenMarker;
