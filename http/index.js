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
 * it) and rejects; an "Unauthorized" body or 401 also emits "auth:unauthorized".
 * A 302 rejects silently (caller handles the redirect). Network failure emits a
 * generic error. In every case the returned promise rejects, so callers can
 * still react.
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
			const query = new URLSearchParams(params).toString();

			if(query) {
				url += (url.indexOf("?") === -1 ? "?" : "&") + query;
			}
		}

		return url;
	};

	const buildHeaders = (extra, hasBody) => {
		const headers = { ...baseHeaders, ...(extra || {}) };

		if(hasBody && headers["Content-Type"] === undefined) {
			headers["Content-Type"] = JSON_CONTENT_TYPE;
		}

		const bearer = token();

		if(bearer) {
			headers["authorization"] = "Bearer " + bearer;
		}

		const clientId = client();

		if(clientId) {
			headers["x-authorization-client"] = clientId;
		}

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

	// Mirror the interceptor's message aggregation: base message plus any
	// per-field validation messages appended.
	const errorMessage = (data) => {
		if(!data || !data.error) {
			return GENERIC_ERROR;
		}

		let message = data.error.message || data.error;

		if(data.errors) {
			Object.values(data.errors).forEach((entry) => {
				message += entry.message;
			});
		}

		return message || GENERIC_ERROR;
	};

	const isUnauthorized = (response, data) => {
		if(response.status === 401) {
			return true;
		}

		return !!(data && data.error && data.error.message === "Unauthorized");
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

		const init = { method, headers: buildHeaders(config.headers, hasBody) };

		if(hasBody) {
			init.body = typeof config.body === "string" ? config.body : JSON.stringify(config.body);
		}

		start();

		return fetch(buildUrl(path, config.params), init).then((response) => {
			return response.text().then((raw) => {
				const data = parseBody(raw);

				if(response.ok) {
					return data;
				}

				if(response.status === 302) {
					// Silent — the caller decides what to do with a redirect.
					return Promise.reject(response);
				}

				emitter.emit("error", { message: errorMessage(data) });

				if(isUnauthorized(response, data)) {
					emitter.emit("auth:unauthorized");
				}

				return Promise.reject(response);
			});
		}, (networkError) => {
			// fetch rejected → no response at all.
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
