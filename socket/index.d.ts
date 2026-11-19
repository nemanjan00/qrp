/**
 * @module socket
 * A reconnecting WebSocket for live dashboards. `socket(url, options)` opens
 * `ws(s)://` on the page's origin for a path, reconnects with exponential
 * backoff, exposes `status` as reactive state (`state`, `connected`,
 * `attempts`), decodes JSON, and routes messages by their `type` field:
 * `on("samples", fn)`. `send()` returns false while disconnected. Created inside
 * a scope, it closes with it.
 */
import type { Handler } from "../events/index.js";

export interface SocketStatus {
	state: "connecting" | "open" | "closed";
	connected: boolean;
	/** Reconnect attempts since the last successful open. */
	attempts: number;
}

export interface ReconnectOptions {
	/** First delay in ms (default 500). */
	min?: number;
	/** Delay cap in ms (default 10000). */
	max?: number;
	/** Growth per attempt (default 2). */
	factor?: number;
}

export interface SocketOptions {
	protocols?: string | string[];
	binaryType?: BinaryType;
	/** Backoff config, or false to never reconnect. */
	reconnect?: ReconnectOptions | false;
	/** Incoming data → message. Default: JSON.parse when it parses, else the raw data. */
	decode?: (data: any) => any;
	/** Outgoing value → data. Default: strings/binary as-is, everything else JSON. */
	encode?: (value: any) => string | ArrayBufferLike | Blob | ArrayBufferView;
	/** Field a decoded object is routed by (default "type"). */
	typeKey?: string;
}

export interface Socket {
	/** Reactive connection state. */
	status: SocketStatus;
	/**
	 * Subscribe; returns an unsubscribe function. Types: "open", "close",
	 * "error", "message" (every message), or a message's `type` value.
	 */
	on<T = any>(type: string, handler: Handler<T>): () => void;
	off(type: string, handler: Handler): void;
	/** Send (encoded); false and dropped while not connected. */
	send(value: any): boolean;
	/** Bytes queued on the socket (bufferedAmount); 0 while disconnected. */
	buffered(): number;
	/** Drop the current connection and connect again now. */
	reconnect(): void;
	/** Close for good (no more reconnects). Also runs on scope dispose. */
	close(code?: number, reason?: string): void;
}

/**
 * Open a reconnecting WebSocket. `url` may be a path ("/ws"), a full ws(s)/http(s)
 * URL, or a function re-read on every reconnect (fresh tokens).
 */
export function socket(url: string | (() => string), options?: SocketOptions): Socket;
