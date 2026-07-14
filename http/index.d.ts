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
