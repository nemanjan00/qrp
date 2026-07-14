/**
 * @module http
 * A fetch client for a JSON backend: URL shaping, auth headers, a reactive
 * in-flight loader, and centralized errors on the bus. **A non-2xx response
 * rejects with `{ status, data, response }`** (data is the parsed error body) and
 * emits `error`; a 401 (or an `Unauthorized` body) also emits `auth:unauthorized`.
 * Nullish params are skipped, arrays repeat the key, `FormData`/`Blob`/etc. pass
 * through, plain objects are JSON-encoded.
 * @example
 * const http = createHttp({ baseUrl: "/api", token: () => session.token });
 * effect(() => bar.hidden = http.loading.pending === 0);   // spinner in one line
 * http.get("/things", { params: { page: 2, ids: [1, 2, 3] } });
 */
import type { Emitter } from "../events/index.js";

export interface HttpOptions {
	baseUrl?: string;
	/** () => bearer token, attached as Authorization. */
	token?: () => string | null | undefined;
	/** () => value for the x-authorization-client header. */
	client?: () => string | null | undefined;
	/** Headers merged into every request. */
	headers?: Record<string, string>;
	/** Emitter for loader/error/auth events (default the global bus). */
	bus?: Emitter;
}

export interface RequestConfig {
	params?: Record<string, any>;
	body?: unknown;
	headers?: Record<string, string>;
	signal?: AbortSignal;
	/**
	 * How to read a successful response body. Default "json" (parsed). Use
	 * "text" for plain text, "arraybuffer"/"blob" for binary (msgpack, downloads),
	 * or "response" to get the raw Response untouched. Non-2xx always rejects
	 * with { status, data, response } regardless.
	 */
	responseType?: "json" | "text" | "arraybuffer" | "blob" | "response";
	/** Any other fetch init (credentials, mode, cache, …). */
	init?: RequestInit;
}

/** Rejection value for a non-2xx response. */
export interface HttpError {
	status: number;
	data: any;
	response: Response;
}

export interface HttpClient {
	/** Reactive in-flight counter: read loading.pending in an effect. */
	loading: { pending: number };
	request(method: string, path: string, config?: RequestConfig): Promise<any>;
	get(path: string, config?: RequestConfig): Promise<any>;
	delete(path: string, config?: RequestConfig): Promise<any>;
	head(path: string, config?: RequestConfig): Promise<any>;
	post(path: string, body?: unknown, config?: RequestConfig): Promise<any>;
	put(path: string, body?: unknown, config?: RequestConfig): Promise<any>;
	patch(path: string, body?: unknown, config?: RequestConfig): Promise<any>;
}

/** Create a fetch client: URL shaping, auth headers, reactive loader, error bus. */
export function createHttp(options?: HttpOptions): HttpClient;
