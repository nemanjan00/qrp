import "./setup.js";

import test from "node:test";
import assert from "node:assert/strict";

import { compilePath, matchPath, router, navigate, el } from "../qrp/index.js";

test("compilePath matches a literal route", () => {
	const c = compilePath("/settings");

	assert.deepEqual(matchPath(c, "/settings"), {});
	assert.equal(matchPath(c, "/other"), null);
});

test("compilePath extracts a named param", () => {
	const c = compilePath("/user/:id");

	assert.deepEqual(matchPath(c, "/user/42"), { id: "42" });
	assert.equal(matchPath(c, "/user"), null);
});

test("compilePath supports wildcard params", () => {
	const c = compilePath("/files/:path*");

	assert.deepEqual(matchPath(c, "/files/a/b/c.txt"), { path: "a/b/c.txt" });
});

test("compilePath decodes param values", () => {
	const c = compilePath("/q/:term");

	assert.deepEqual(matchPath(c, "/q/hello%20world"), { term: "hello world" });
});

test("compilePath tolerates a trailing slash", () => {
	const c = compilePath("/about");

	assert.deepEqual(matchPath(c, "/about/"), {});
});

test("compilePath keeps params aligned when a bare * precedes a :param", () => {
	const c = compilePath("/a/*/b/:id");
	const params = matchPath(c, "/a/xxx/b/42");

	// :id must get 42, not the wildcard's xxx (positional key 0 gets xxx)
	assert.equal(params.id, "42");
	assert.equal(params[0], "xxx");
});

test("router renders the matching route with params and query", () => {
	history.replaceState(null, "", "/user/7?tab=info");

	const outlet = document.createElement("div");
	document.body.appendChild(outlet);

	let captured;

	const app = router({
		"/": (view) => view.appendChild(el("h1", {}, "home")),
		"/user/:id": (view, ctx) => {
			captured = ctx;
			view.appendChild(el("h1", {}, `user ${ctx.params.id}`));
		}
	}, outlet);

	assert.equal(outlet.querySelector("h1").textContent, "user 7");
	assert.deepEqual(captured.params, { id: "7" });
	assert.deepEqual(captured.query, { tab: "info" });

	app.dispose();
});

test("router falls back to notFound", () => {
	history.replaceState(null, "", "/nope");

	const outlet = document.createElement("div");

	const app = router({
		"/": (view) => view.appendChild(el("h1", {}, "home"))
	}, outlet, {
		notFound: (view) => view.appendChild(el("h1", {}, "404"))
	});

	assert.equal(outlet.querySelector("h1").textContent, "404");

	app.dispose();
});

test("navigate re-renders the router", () => {
	history.replaceState(null, "", "/");

	const outlet = document.createElement("div");

	const app = router({
		"/": (view) => view.appendChild(el("h1", {}, "home")),
		"/about": (view) => view.appendChild(el("h1", {}, "about"))
	}, outlet);

	assert.equal(outlet.querySelector("h1").textContent, "home");

	navigate("/about");

	assert.equal(outlet.querySelector("h1").textContent, "about");
	assert.equal(location.pathname, "/about");

	app.dispose();
});
