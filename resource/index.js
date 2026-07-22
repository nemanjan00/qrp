/**
 * resource/index.js — reactive async data: the load / loading / error / refetch
 * dance every data UI rebuilds, as a small headless primitive. Transport-
 * agnostic (you hand it a fetcher thunk — `() => http.get(...)`, or anything
 * returning a promise), so it composes with the http module without coupling to
 * it. `res.data` / `res.loading` / `res.error` are reactive reads.
 *
 *   const hist = resource(() => http.get("/history"), { refreshOn: "refresh" });
 *   // fire bus.emit("refresh") anywhere → every resource listening reloads.
 */

import { state, onDispose } from "../qrp/index.js";
import { when } from "../qrp/index.js";
import { bus as globalBus } from "../events/index.js";

/**
 * @param {Function} fetcher () => Promise<data>
 * @param {object} [options]
 * @param {*} [options.initial] value for `data` before the first load (e.g. SSR)
 * @param {boolean} [options.immediate] load on creation (default true)
 * @param {object} [options.bus] emitter for `refreshOn` (default the global bus)
 * @param {string|string[]} [options.refreshOn] bus event(s) that trigger reload
 * @returns {{ data, loading, error, reload }} reactive resource
 */
export const resource = (fetcher, options = {}) => {
	const { initial = null, immediate = true, bus = globalBus, refreshOn } = options;

	const store = state({ data: initial, loading: false, error: null });
	let token = 0; // guards against a stale response overwriting a newer one

	const reload = () => {
		const mine = (token += 1);
		store.loading = true;
		store.error = null;

		return Promise.resolve()
			.then(() => fetcher())
			.then((data) => { if(mine === token) { store.data = data; } })
			.catch((error) => { if(mine === token) { store.error = error; } })
			.finally(() => { if(mine === token) { store.loading = false; } });
	};

	if(immediate) { reload(); }

	if(refreshOn) {
		const types = Array.isArray(refreshOn) ? refreshOn : [refreshOn];
		// onDispose so a resource built in a scope/component stops listening on
		// teardown (no leaked bus subscription).
		types.forEach((type) => onDispose(bus.on(type, () => reload())));
	}

	return {
		get data() { return store.data; },
		get loading() { return store.loading; },
		get error() { return store.error; },
		reload
	};
};

const isEmpty = (data) => data == null || (Array.isArray(data) && data.length === 0);

/**
 * Sugar mapping a resource's state to `when` branches — kills the
 * loading/error/empty boilerplate. Each view is optional.
 *
 *   asyncView(hist, {
 *     loading: () => el("p", {}, "…"),
 *     error:   (e) => el("p", {}, `Failed: ${e.message}`),
 *     empty:   () => el("p", {}, "No data"),
 *     data:    (rows) => list(() => rows, r => r.id, row),
 *   });
 *
 * @param {object} res a resource() (or anything with reactive data/loading/error)
 * @param {object} [views] { loading?, error?(err), empty?, data?(data) }
 * @returns a `when()` marker (pass as an el child)
 */
export const asyncView = (res, views = {}) => {
	const phase = () => {
		if(res.error) { return "error"; }
		if(res.loading && res.data == null) { return "loading"; }
		if(isEmpty(res.data)) { return "empty"; }

		return "data";
	};

	const nothing = () => null;

	return when(phase, (p) => {
		if(p === "error") { return (views.error || nothing)(res.error); }
		if(p === "loading") { return (views.loading || nothing)(); }
		if(p === "empty") { return (views.empty || nothing)(); }

		return (views.data || nothing)(res.data);
	});
};
