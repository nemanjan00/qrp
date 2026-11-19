/**
 * socket/index.js — a live-data WebSocket for dashboards: reconnects with
 * backoff, exposes its connection as reactive state, decodes JSON, and routes
 * messages by their `type` field. The http module's push-side sibling.
 *
 *   const live = socket("/ws");                      // ws:// or wss:// from the page
 *   live.on("samples", (msg) => append(msg.samples));
 *   el("span", { class: () => live.status.connected ? "on" : "off" });
 *   live.send({ type: "subscribe", channel: "v1" });  // false while disconnected
 *
 * Created inside a scope (mount/scoped/a component), it closes with it.
 */

import { onDispose, state } from "../qrp/index.js";
import { emitter } from "../events/index.js";

const RECONNECT_DEFAULTS = { min: 500, max: 10000, factor: 2 };

// A path ("/ws") or http(s) URL becomes ws(s) on the page's origin.
const toSocketUrl = (url) => {
	const resolved = new URL(url, location.href);

	if(resolved.protocol === "http:") {
		resolved.protocol = "ws:";
	} else if(resolved.protocol === "https:") {
		resolved.protocol = "wss:";
	}

	return resolved.href;
};

// Text frames that parse as JSON come out as values; anything else as-is.
const decodeDefault = (data) => {
	if(typeof data !== "string") {
		return data;
	}

	try {
		return JSON.parse(data);
	} catch {
		return data;
	}
};

const isBinary = (data) => typeof data === "string"
	|| data instanceof ArrayBuffer
	|| ArrayBuffer.isView(data)
	|| (typeof Blob !== "undefined" && data instanceof Blob);

const encodeDefault = (data) => (isBinary(data) ? data : JSON.stringify(data));

const backoff = (config, attempt) => Math.min(config.max, config.min * config.factor ** attempt);

/**
 * Open a reconnecting WebSocket.
 *
 * Events (`on(type, handler)` → off): "open", "close" (the CloseEvent),
 * "error", "message" (every decoded message), and — for a decoded object with a
 * string `type` field (`options.typeKey`) — that type, so `on("samples", fn)`
 * gets only `{ type: "samples", … }` messages.
 *
 * @param {string|Function} url "/ws", "wss://host/ws", or () => url (re-read on
 *   every reconnect — e.g. to carry a fresh token)
 * @param {object} [options]
 * @param {string|string[]} [options.protocols] WebSocket subprotocols
 * @param {string} [options.binaryType] "blob" (default) or "arraybuffer"
 * @param {object|boolean} [options.reconnect] { min, max, factor } ms backoff
 *   (default 500 → 10000, ×2), or false to never reconnect
 * @param {Function} [options.decode] incoming data → message (default: JSON when it parses)
 * @param {Function} [options.encode] outgoing value → data (default: JSON unless string/binary)
 * @param {string} [options.typeKey] message field used for routing (default "type")
 * @returns {object} { status, on, off, send, buffered, reconnect, close }
 */
export const socket = (url, options = {}) => {
	const reconnect = options.reconnect === false ? null : { ...RECONNECT_DEFAULTS, ...(options.reconnect || {}) };
	const decode = options.decode || decodeDefault;
	const encode = options.encode || encodeDefault;
	const typeKey = options.typeKey || "type";
	const events = emitter();
	const status = state({ state: "connecting", connected: false, attempts: 0 });
	let ws = null;
	let timer = null;
	let closed = false;

	const setStatus = (next, attempts) => {
		status.state = next;
		status.connected = next === "open";
		status.attempts = attempts;
	};

	const schedule = () => {
		if(closed || !reconnect) {
			setStatus("closed", status.attempts);
			return;
		}

		const attempt = status.attempts;

		setStatus("connecting", attempt + 1);
		timer = setTimeout(() => {
			timer = null;
			open();
		}, backoff(reconnect, attempt));
	};

	const open = () => {
		const target = toSocketUrl(typeof url === "function" ? url() : url);
		const current = options.protocols ? new WebSocket(target, options.protocols) : new WebSocket(target);

		ws = current;

		if(options.binaryType) {
			current.binaryType = options.binaryType;
		}

		current.onopen = () => {
			setStatus("open", 0);
			events.emit("open", {});
		};
		current.onerror = (event) => {
			events.emit("error", event);
		};
		current.onclose = (event) => {
			// a socket replaced by reconnect() must not schedule another one
			if(ws !== current) {
				return;
			}

			ws = null;
			events.emit("close", event);
			schedule();
		};
		current.onmessage = (event) => {
			const message = decode(event.data);

			events.emit("message", message);

			if(message && typeof message === "object" && typeof message[typeKey] === "string") {
				events.emit(message[typeKey], message);
			}
		};
	};

	const stopTimer = () => {
		if(timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const close = (code, reason) => {
		if(closed) {
			return;
		}

		closed = true;
		stopTimer();

		if(ws) {
			const current = ws;

			ws = null;
			current.close(code, reason);
		}

		setStatus("closed", status.attempts);
	};

	onDispose(() => close());
	open();

	return {
		/** Reactive: { state: "connecting"|"open"|"closed", connected, attempts }. */
		status,

		on: events.on,
		off: events.off,

		/**
		 * Send a value (encoded; objects as JSON). Returns false — and drops
		 * it — while not connected, so a caller can queue or retry.
		 */
		send: (data) => {
			if(!ws || ws.readyState !== WebSocket.OPEN) {
				return false;
			}

			ws.send(encode(data));

			return true;
		},

		/** Bytes queued but not yet sent — back off a producer when it grows. */
		buffered: () => (ws ? ws.bufferedAmount : 0),

		/** Drop the current connection (if any) and connect again now. */
		reconnect: () => {
			if(closed) {
				return;
			}

			stopTimer();

			const previous = ws;

			ws = null;

			if(previous) {
				previous.close();
			}

			setStatus("connecting", 0);
			open();
		},

		/** Close for good: no further reconnects. Also runs on scope dispose. */
		close
	};
};
