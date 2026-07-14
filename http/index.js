/**
 * http/index.js — a fetch wrapper for talking to a JSON backend.
 *
 * The fetch equivalent of the classic axios-interceptor stack: every request
 * gets URL shaping, auth headers, a global in-flight loader, and centralized
 * error handling — but auth-agnostic (you pass a token getter; it emits
 * "auth:unauthorized" on the bus instead of knowing about logout).
 *
 *   const http = createHttp({ baseUrl: "/api/v2", token: () => session.token });
 *
 *   http.get("/things", { params: { page: 2 } });   // → parsed JSON
 *   http.post("/things", { name: "x" });
 *
 * The loader is REACTIVE, not just events: `http.loading.pending` is a count
 * you can read in an effect(), so a progress bar is one line —
 *   effect(() => bar.hidden = http.loading.pending === 0);
 * (loader.start / loader.stop are still emitted on the bus for event-style UIs.)
 *
 * Errors: a non-2xx response emits "error" on the bus (so the toast stack shows
 * it) and REJECTS with { status, data, response } — data is the already-parsed
 * error body, so callers can read validation details (the Response body is
 * consumed). An "Unauthorized" body (object or string form) or a 401 also emits
 * "auth:unauthorized". Network failure rejects with the fetch TypeError after a
 * generic "error" emit. In every case the returned promise rejects.
 *
 * Bodies: plain objects/arrays are JSON-stringified (with a JSON content-type);
 * FormData/Blob/ArrayBuffer/URLSearchParams/typed-arrays pass through so fetch
 * sets the right content-type. Params: nullish values are skipped, arrays repeat
 * the key (ids=1&ids=2). Pass config.signal for cancellation, config.init for
 * any other fetch init (credentials, mode, cache, …).
 */

import { state } from "../qrp/index.js";
import { bus } from "../events/index.js";

// --- configuration defaults -------------------------------------------------

const GENERIC_ERROR = "Error contacting server...";
const JSON_CONTENT_TYPE = "application/json";

// --- factory ----------------------------------------------------------------

/**
 * Create an HTTP client bound to a backend.
 *
 * @param {object} [options]
 * @param {string} [options.baseUrl] prefix for relative URLs (absolute URLs
 *   starting with "http" are left untouched)
 * @param {function} [options.token] () => string|null bearer token getter
 * @param {function} [options.client] () => string|null value for the
 *   x-authorization-client header
 * @param {object} [options.headers] headers merged into every request
 * @param {object} [options.bus] emitter for loader/error/auth events
 * @returns {object} http client
 */
export const createHttp = (options = {}) => {
	const baseUrl = options.baseUrl || "";
	const token = options.token || (() => null);
	const client = options.client || (() => null);
	const baseHeaders = options.headers || {};
	const emitter = options.bus || bus;

	// Reactive in-flight counter — bind a loader to loading.pending.
	const loading = state({ pending: 0 });

	const start = () => {
		loading.pending += 1;

		if(loading.pending === 1) {
			emitter.emit("loader.start");
		}
	};

	const stop = () => {
		loading.pending -= 1;

		if(loading.pending === 0) {
			emitter.emit("loader.stop");
		}
	};

	const buildUrl = (path, params) => {
		let url = path;

		if(path.indexOf("http") !== 0) {
			url = baseUrl + path;
		}

		if(params) {
			const search = new URLSearchParams();

			Object.entries(params).forEach(([key, value]) => {
				// Skip nullish so `params: { q: undefined }` doesn't send the
				// literal "q=undefined". Append array values individually
				// (ids=1&ids=2), the repeated-key form most backends expect.
				if(value == null) {
					return;
				}

				if(Array.isArray(value)) {
					value.forEach((v) => { if(v != null) { search.append(key, v); } });
				} else {
					search.append(key, value);
				}
			});

			const query = search.toString();

			if(query) {
				url += (url.indexOf("?") === -1 ? "?" : "&") + query;
			}
		}

		return url;
	};

	// Body types fetch handles natively pass through untouched; only plain
	// objects/arrays are JSON-stringified. Prevents FormData/Blob/etc. from
	// being silently destroyed into "{}" (and lets fetch set FormData's own
	// multipart content-type with its boundary).
	const NATIVE_BODY = (body) => (
		typeof body === "string"
		|| body instanceof FormData
		|| body instanceof Blob
		|| body instanceof ArrayBuffer
		|| body instanceof URLSearchParams
		|| (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
		|| ArrayBuffer.isView(body)
	);

	// Merge headers case-insensitively (last wins) so a caller's "content-type"
	// and our "Content-Type" don't both survive and get combined by Headers.
	// jsonBody = true only when we will JSON.stringify (plain object/array);
	// for native bodies we do NOT set content-type (fetch does it right).
	const buildHeaders = (extra, jsonBody) => {
		const merged = new Map(); // lowercased name -> [originalName, value]
		const put = (name, value) => merged.set(name.toLowerCase(), [name, value]);

		Object.entries(baseHeaders).forEach(([k, v]) => put(k, v));
		Object.entries(extra || {}).forEach(([k, v]) => put(k, v));

		if(jsonBody && !merged.has("content-type")) {
			put("Content-Type", JSON_CONTENT_TYPE);
		}

		const bearer = token();

		if(bearer) {
			put("Authorization", "Bearer " + bearer);
		}

		const clientId = client();

		if(clientId) {
			put("x-authorization-client", clientId);
		}

		const headers = {};

		merged.forEach(([name, value]) => { headers[name] = value; });

		return headers;
	};

	const parseBody = (raw) => {
		if(!raw) {
			return null;
		}

		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	};

	// Base message plus any per-field validation messages, space-joined. Handles
	// both { error: { message } } and { error: "text" }, and errors entries that
	// are strings or { message }.
	const errorMessage = (data) => {
		if(!data) {
			return GENERIC_ERROR;
		}

		const parts = [];
		const base = data.error && (data.error.message || (typeof data.error === "string" ? data.error : null));

		if(base) {
			parts.push(base);
		}

		if(data.errors) {
			Object.values(data.errors).forEach((entry) => {
				const text = typeof entry === "string" ? entry : (entry && entry.message);

				if(text) {
					parts.push(text);
				}
			});
		}

		return parts.length ? parts.join(" ") : GENERIC_ERROR;
	};

	const isUnauthorized = (response, data) => {
		if(response.status === 401) {
			return true;
		}

		// Both { error: { message: "Unauthorized" } } and { error: "Unauthorized" }.
		const errText = data && data.error && (data.error.message || data.error);

		return errText === "Unauthorized";
	};

	/**
	 * Issue a request.
	 * @param {string} method HTTP method
	 * @param {string} path absolute or baseUrl-relative URL
	 * @param {object} [config] { params, body, headers }
	 * @returns {Promise} resolves to parsed JSON, rejects on error/redirect
	 */
	const request = (method, path, config = {}) => {
		const hasBody = config.body !== undefined;

		// Build EVERYTHING that can throw (URL, headers, body) BEFORE start(),
		// so a synchronous error can't leave the loader counter stuck at ≥1.
		let url;
		let init;

		try {
			const jsonBody = hasBody && !NATIVE_BODY(config.body);

			init = { method, headers: buildHeaders(config.headers, jsonBody), ...(config.init || {}) };

			if(config.signal) {
				init.signal = config.signal;
			}

			if(hasBody) {
				init.body = jsonBody ? JSON.stringify(config.body) : config.body;
			}

			url = buildUrl(path, config.params);
		} catch(error) {
			emitter.emit("error", { message: error.message || GENERIC_ERROR });

			return Promise.reject(error);
		}

		start();

		return fetch(url, init).then((response) => {
			return response.text().then((raw) => {
				const data = parseBody(raw);

				if(response.ok) {
					return data;
				}

				emitter.emit("error", { message: errorMessage(data) });

				if(isUnauthorized(response, data)) {
					emitter.emit("auth:unauthorized");
				}

				// Reject with a structured value: status + the already-parsed
				// data (the Response body is consumed, so callers can't re-read
				// it — hand them the parsed error instead of a used Response).
				return Promise.reject({ status: response.status, data, response });
			});
		}, (networkError) => {
			// fetch rejected → no response at all (network failure / abort).
			emitter.emit("error", { message: GENERIC_ERROR });

			return Promise.reject(networkError);
		}).finally(stop);
	};

	return {
		loading,
		request,

		get: (path, config) => request("GET", path, config),
		delete: (path, config) => request("DELETE", path, config),
		head: (path, config) => request("HEAD", path, config),

		post: (path, body, config = {}) => request("POST", path, { ...config, body }),
		put: (path, body, config = {}) => request("PUT", path, { ...config, body }),
		patch: (path, body, config = {}) => request("PATCH", path, { ...config, body })
	};
};
