/**
 * @module events
 * A global event bus on native `EventTarget`. `Emitter`: `on(type, handler) → off`,
 * `off`, `once(type) → Promise`, `emit(type, detail)`, `request(type, payload,
 * { timeout? }) → Promise`, `respond(type, handler) → off`.
 */
export type Handler<T = any> = (detail: T, event?: Event) => void;

export interface RequestOptions {
	timeout?: number;
}

export interface Emitter {
	target: EventTarget;
	/** Subscribe; returns an unsubscribe function. */
	on<T = any>(type: string, handler: Handler<T>): () => void;
	off(type: string, handler: Handler): void;
	/** Promise for the next event of this type. */
	once<T = any>(type: string): Promise<T>;
	emit(type: string, detail?: any): Emitter;
	/** Fire a request and await a matching response (see respond). */
	request<T = any>(type: string, payload?: any, options?: RequestOptions): Promise<T>;
	/** Answer request()s of a given type. */
	respond(type: string, handler: (payload: any) => any): () => void;
}

/** Create an emitter backed by a native EventTarget. */
export function emitter(): Emitter;

/** The global event bus. */
export const bus: Emitter;

/** Turn an event source into reactive state holding the latest mapped detail. */
export function fromEvent<T = any, R = T>(
	source: Emitter | EventTarget,
	type: string,
	map?: (detail: T) => R,
	initial?: R
): { value: R };

export interface Channel {
	on<T = any>(type: string, handler: Handler<T>): () => void;
	off(type: string, handler: Handler): void;
	once<T = any>(type: string): Promise<T>;
	emit(type: string, detail?: any): unknown;
	close(): void;
}

/** A cross-tab bus over BroadcastChannel (falls back to a local emitter). */
export function channel(name: string): Channel;

/** Mirror a piece of reactive state onto an emitter on every change. */
export function broadcast(
	emitter: Emitter,
	type: string,
	store: Record<string, any>,
	key?: string
): { dispose(): void };
