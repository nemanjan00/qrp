// Type-level test: exercises the public .d.ts surface. `tsc --noEmit` on this
// is the "test" for the declarations — it fails if a signature is wrong.

import { state, effect, derive, el, list, when, mount, router, navigate, onEffectError, currentRoute, batch } from "../qrp/index.js";
import { html, ref } from "../html/index.js";
import { table, tablePager, tableSummary } from "../table/index.js";
import { collection } from "../collection/index.js";
import { dataGrid } from "../datagrid/index.js";
import { form, registerInput, inputs, field, parseKV } from "../forms/index.js";
import { createHttp } from "../http/index.js";
import { bus, emitter, fromEvent } from "../events/index.js";
import { notify, createToasts } from "../toasts/index.js";
import { persisted, viewport, media, seen, poll } from "../browser/index.js";
import { num, compact, relTime } from "../format/index.js";
import { resource, asyncView } from "../resource/index.js";
import { spark } from "../spark/index.js";
import { linear, ordinal, palette } from "../scale/index.js";
import { rate, downsample } from "../timeseries/index.js";
import { toCSV } from "../export/index.js";
import { portal } from "../behaviors/portal.js";
import { trapFocus } from "../behaviors/trap-focus.js";
import { disclosure } from "../behaviors/disclosure.js";
import { anchored, pointAt } from "../behaviors/anchored.js";
import { dismissable } from "../behaviors/dismissable.js";
import { busyWhile } from "../behaviors/busy-while.js";
import { memoize } from "../utils/memoize.js";
import { validate } from "../utils/validate.js";
import { limit } from "../utils/limit.js";
import { debounce, throttle } from "../utils/debounce.js";
import { paginate } from "../utils/paginate.js";

interface User { id: number; name: string; signups: number; }

// reactivity
const s = state({ n: 0, user: { name: "Ada" } });
s.n = 1;
const full = derive(() => `${s.user.name} ${s.n}`);
const len: number = full.value.length;
const h = effect(() => { void s.n; });
h.dispose();
const guarded = effect(() => { void s.n; }, { name: "n", loopLimit: 50 });
guarded.dispose();

// dom + list + when
const row = el("tr", { class: () => (s.n > 0 ? "on" : ""), onclick: () => s.n++ }, () => `${s.n}`);
const li = list<User>(() => [{ id: 1, name: "x", signups: 3 }], (u) => u.id, (u) => el("li", {}, () => u.name));
const item: User | undefined = li.itemFor(row);
const w = when(() => s.n > 0, () => el("b", {}, "y"), () => el("i", {}, "n"));
el("ul", {}, li, w, row);

// mount / router
const app = mount(document.body, (view) => { view.appendChild(row); });
app.dispose();
const r = router({ "/": (o, ctx) => { void o; void ctx.params.id; }, "/u/:id": (o) => { void o; } }, document.body);
r.dispose();
navigate("/u/1", { replace: true });

// html
const node: Node | DocumentFragment = html`<div>${() => s.n}</div>`;
const tpl = html.template("<span>#{name}</span>");
const filled = tpl({ name: "R2" });
const token: string = ref(node);

// forms
const settings = state<Record<string, any>>({ NICK: "a" });
registerInput("callsign", (st, key) => inputs.text(st, key));
const fEl: HTMLElement = form({ settings, fields: { NICK: { name: "Nick", type: "text" } } });
const fld: HTMLElement = field(settings, "NICK", { type: "text" });
const kv: Record<string, string> = parseKV("A=1\nB=2");

// collection + table
const view = collection<User>(() => [], { filter: state({ q: "" }), filterFn: (u, f) => u.name.includes(f.q) });
const count: number = view.total();
const t = table<User>({ rows: () => [], key: (u) => u.id, fields: [{ key: "name", label: "Name", sortable: true }] });
const pages: number = t.view.pageCount();
const matches: User[] = view.filtered();

// datagrid
const grid = dataGrid<User>(() => [], { key: (u) => u.id, columns: [{ key: "name", label: "Name" }], pageSizes: [10, 25] });
const picked: User[] = grid.selectedItems();
const allOn: boolean = grid.allSelected();
const win: number[] = grid.pageWindow(5);
grid.toggle({ id: 1, name: "x", signups: 0 });
grid.toggleColumn("name");

// http
const api = createHttp({ baseUrl: "/api", token: () => "tok" });
api.get("/me", { params: { page: 2 } }).then((d) => d).catch((e) => e);
const pending: number = api.loading.pending;

// events + toasts
const e = emitter();
const off = e.on<{ msg: string }>("x", (d) => { void d.msg; });
off();
bus.emit("error", { message: "x" });
const last = fromEvent(bus, "user", (u: any) => u.name, "nobody");
void last.value;
notify.success("saved");
const ctl = createToasts({ timeout: 0 });
ctl.error(el("span", {}, "x"));

// browser
const prefs = persisted("k", { likes: 0 });
prefs.likes++;
const vp = viewport();
void (vp.width + vp.height);
const dark = media("(prefers-color-scheme: dark)");
void dark.matches;
seen(document.body, { threshold: 0.1 });

// behaviors
const dispose = portal(node instanceof Node ? node : document.body);
dispose();
const untrap = trapFocus(document.body);
untrap();
const d = disclosure(false);
d.connect(document.body, document.body as HTMLElement);
const b = busyWhile();
b.run(Promise.resolve(1)).then((n) => n);
void b.active;

// utils
const mfn = memoize((a: number, b: number) => a + b, { max: 100 });
const sum: number = mfn(1, 2);
const page: number[] = paginate([1, 2, 3, 4], 0, 2);

// new surface
const offErr: () => void = onEffectError((err: unknown, ctx) => {
	const phase: "create" | "update" | "loop" = ctx.phase;
	void err; void phase;
});
const batched: number = batch(() => 1);
const rp: string = currentRoute.path;
const rid: string | undefined = currentRoute.params.id;
const limited = limit(async (id: number) => id * 2, { max: 3, perSecond: 5, timeout: 1000 });
const limitedP: Promise<number> = limited(1);
const deb = debounce((q: string) => void q, 200);
deb("x"); deb.cancel();
const thr = throttle(() => {}, 100);
thr(); thr.cancel();
createHttp().get("/x", { responseType: "arraybuffer" }).then((b: any) => b);
const vres = validate({ age: { type: "number", min: 0 } }, { age: "5" });
const vErrCount: number = vres.errors.length; const vVal: any = vres.value;

// silence "unused" without changing meaning
void [len, item, node, filled, token, fEl, fld, kv, count, pages, pending, sum, page, offErr, rp, rid, limitedP, deb, thr, vErrCount, vVal];

// optional helper modules
const _fnum: string = num(5);
const _fcompact: string = compact(1000);
const _frel: string = relTime(new Date());
const _res = resource<number[]>(() => Promise.resolve([1]), { refreshOn: "refresh", initial: [] });
const _rdata: number[] | null = _res.data;
const _rloading: boolean = _res.loading;
void _res.reload();
const _av = asyncView(_res, { loading: () => "…", data: (rows) => rows.length, error: (e) => String(e) });
void _av;
const _chart: SVGElement = spark(() => [1, 2, 3], { kind: "area", y: (d: number) => d });
void _chart;
const _lin: number = linear([0, 1], [0, 10], { clamp: true })(0.5);
const _col: string = ordinal(palette)("cpu");
const _pts = [{ x: 0, y: 1 }, { x: 1, y: 3 }];
const _rate = rate(_pts);
const _ds = downsample(_pts, 1);
void _rate; void _ds;
const _csv: string = toCSV([{ a: 1 }], ["a", { key: "a", label: "A" }]);
const _rawCsv: string = toCSV([{ a: "=1" }], undefined, { formulaGuard: false });
const _pl = poll(() => {}, 1000, { immediate: true, whenHidden: false });
_pl.stop();
void _fnum; void _fcompact; void _frel; void _rdata; void _rloading; void _lin; void _col; void _csv; void _rawCsv;

// --- behaviors: disclosure modes, anchored placement, layered dismissable ----

const ui = state({ filters: false });
const bound = disclosure([ui, "filters"], { onChange: (open: boolean) => open });
const driven = disclosure(() => ui.filters);
const boundOpen: boolean = bound.state.open;
driven.connect(el("button"), el("div"), { hide: false, disabled: () => ui.filters });

const pop = el("div");
const stopFollow = anchored(el("button"), pop, { side: "right", align: "center", sideOffset: 8, alignOffset: 2, collisionPadding: 8 });
stopFollow.update();
anchored(pointAt(10, 20), pop, { placement: "top", gap: 2, avoidCollisions: false });

const undoLayer: () => void = dismissable(pop, (event: Event) => event, { inside: [el("button")], modal: true });
undoLayer();

// --- table: per-part classes, custom sort indicator, pager classes ----------

interface Row { id: number; hot: boolean }
const styled = table<Row>({
	rows: () => [] as Row[],
	fields: [{ key: "id", label: "Id", sortable: true }],
	classes: { thead: "x", headRow: "x", th: "x", tbody: "x", tr: (row: Row) => (row.hot ? "hot" : ""), td: "x", expandRow: "x", expandCell: "x" },
	sortIndicator: (dir: 1 | -1 | 0) => (dir === 0 ? null : el("i"))
});
tablePager(styled.view, { window: 2, classes: { nav: "n", button: "b", active: "a", gap: "g" } });
void boundOpen;

// --- context ----------------------------------------------------------------
import { createContext, setOwner, ownerOf } from "../context/index.js";

const Theme = createContext<"light" | "dark">("light");
const themed: HTMLDivElement = Theme.provide(document.createElement("div"), "dark");
const themeName: "light" | "dark" = Theme.read(themed);
const watchedButton: HTMLButtonElement = Theme.watch(document.createElement("button"), (theme, node) => {
	node.dataset.theme = theme;
});
const lookup: { found: boolean; provider: Node | null } = Theme.find(watchedButton);
setOwner(watchedButton, themed);
const owner: Node | null = ownerOf(watchedButton);
// @ts-expect-error — not a value of the context's type
Theme.provide(themed, "blue");
void themeName; void lookup; void owner;

// --- toasts ids/update/pause/exit, table view + attrs -----------------------
{
	const t = createToasts({ timeout: 4000, exitMs: 200, variants: ["loading"] });
	const id = t.push("loading", "Saving…", { id: "save", duration: 0, description: "please wait" });
	const ok: boolean = t.update(id, { variant: "success", content: "Saved", duration: 3000 });
	t.pause(id);
	t.resume();
	t.dismiss(id);
	const firstRemoved: boolean | undefined = t.store.items[0]?.removed;
	const helperId: number | string = t.success("done");
	void ok; void firstRemoved; void helperId;

	interface Row { id: number; name: string; }
	const grid = dataGrid<Row>(() => [], { key: (r) => r.id });
	table<Row>({
		rows: [],
		view: grid,
		fields: [{ key: "name" }],
		attrs: {
			tr: (row) => ({ "data-state": grid.isSelected(row) ? "selected" : null }),
			td: (column, row) => ({ "data-label": column.label, "data-id": row.id }),
			th: (column) => ({ scope: "col", "data-key": column.key })
		}
	});
	// @ts-expect-error attrs.tr must return an attribute record
	table<Row>({ rows: [], fields: [], attrs: { tr: () => 5 } });
}

// --- spark: shared domains, curves, stacking, grouping, project; scale.nice ----
import { project, type SparkPoint } from "../spark/index.js";
import { nice } from "../scale/index.js";

{
	const yAxis = nice([0, 97], 5);
	const sharedY: [number, number] = yAxis.domain;
	const ticksOut: number[] = yAxis.ticks;
	const series = [{ month: 1, desktop: 186, mobile: 80 }, { month: 2, desktop: 305, mobile: 200 }];
	const stacked: SVGElement = spark(() => series, {
		kind: "area", x: "month", y: "mobile", yDomain: () => sharedY, xDomain: [1, 2],
		stack: (d: { desktop: number }) => d.desktop, curve: "monotone", responsive: true
	});
	const grouped: SVGElement = spark(series, { kind: "bar", y: "desktop", group: [0, 2], gap: 0.1, radius: 4, base: 0 });
	const hits: SparkPoint<{ month: number }>[] = project(series, { x: "month", y: "desktop", yDomain: sharedY });
	const nearest: number = hits[0].x + hits[0].y0;
	// @ts-expect-error — not a curve type
	spark([1, 2], { curve: "bezier" });
	void ticksOut; void stacked; void grouped; void nearest;
}

// --- table over a dataGrid view (no rows), pager/summary on a grid; object toast payloads ---
{
	interface Row { id: number; name: string; }
	const grid = dataGrid<Row>(() => [], { key: (r) => r.id });
	const viewTable = table<Row>({ view: grid, fields: [{ key: "name" }] });
	tablePager(grid);
	tableSummary(grid, { label: (from, to, total) => `${from}-${to}/${total}` });
	tablePager(viewTable.view);
	tableSummary(viewTable.view);
	// @ts-expect-error rows (or view) is required
	table<Row>({ fields: [{ key: "name" }] });
	// @ts-expect-error the pager needs page/pageCount
	tablePager({ total: () => 0 });

	notify.error({ message: "Save failed", title: "Network" });
	notify.success({ content: "Saved", duration: 0 });
	notify.info({ body: "FYI", id: "fyi", description: "more" });
	notify.warning("plain");
}

// --- 0.14: lessons from a production dashboard (mailab) ---------------------
import { onChange } from "../qrp/index.js";
import { searchFilter } from "../collection/index.js";
import { si, parseSI } from "../format/index.js";
import { size } from "../browser/index.js";
import { copy } from "../export/index.js";
import { embed } from "../behaviors/embed.js";
import { stickToBottom } from "../behaviors/stick-to-bottom.js";
import { socket } from "../socket/index.js";

{
	type Reading = { id: number; name: string; volts: number };
	const readings = state({ rows: [] as Reading[], q: "" });

	const watcher = onChange(() => readings.q, (next: string, previous: string | undefined) => void [next, previous]);
	watcher.dispose();
	// @ts-expect-error equals must compare the source type
	onChange(() => readings.q, () => {}, { equals: (a: number, b: number) => a === b });

	const view = collection(() => readings.rows, {
		filter: readings,
		filterFn: searchFilter<Reading>(["name", { label: "v", value: (r) => r.volts }]),
		clearSort: true
	});
	const ordered: Reading[] = view.sorted();
	searchFilter<Reading>({ name: (r) => r.name }, { key: "q" });

	const label: string = si(0.0012, "V");
	const value: number = parseSI("2.4G");
	const box: { width: number; height: number } = size(document.body);
	const copied: Promise<void> = copy("text");

	const host: HTMLElement = embed((node) => ({ resize: (w, h) => void [node, w, h], destroy: () => {} }), { props: { class: "chart" } });
	embed(() => () => {});
	const stick = stickToBottom(host, { threshold: 10 });
	const pinned: boolean = stick.pinned.value;

	const live = socket("/ws", { reconnect: { min: 250 }, binaryType: "arraybuffer" });
	const off = live.on<{ type: "samples"; v: number[] }>("samples", (msg) => void msg.v.length);
	const ok: boolean = live.send({ type: "subscribe" });
	const state0: "connecting" | "open" | "closed" = live.status.state;
	socket(() => "/ws?t=1", { reconnect: false });
	// @ts-expect-error reconnect is options or false
	socket("/ws", { reconnect: true });
	off();
	void [ordered, label, value, box, copied, pinned, ok, state0];
}

// --- 0.15: large apps (store, host) -----------------------------------------
import { assign, append, coalesce } from "../store/index.js";
import { island, reconcile } from "../host/index.js";

{
	type Pane = { id: string; type: string; title: string };
	const lab = state({ panes: [] as Pane[], activity: [] as string[], live: {} as Record<string, number> });

	const changed: string[] = assign(lab, { panes: [] });
	// @ts-expect-error unknown key
	assign(lab, { nope: 1 });
	append(lab.activity, "boot", 500);
	append(lab.activity, ["a", "b"]);
	// @ts-expect-error wrong item type
	append(lab.activity, 1);
	const values = coalesce(lab.live, { interval: "frame" });
	values.set("v1", 3.3);
	values.flush();

	const panel = island(document.body, (p: { title: string }) => el("h3", {}, () => p.title), { title: "x" });
	panel.update({ title: "y" });
	// @ts-expect-error props shape is fixed by the view
	panel.update({ title: 1 });

	const r = reconcile(() => lab.panes, (p) => p.id, {
		create: (pane) => ({ el: document.createElement("div"), pane }),
		update: (handle, pane) => void [handle.el, pane.title],
		recreate: (prev, next) => prev.type !== next.type,
		destroy: (handle, id: string) => void [handle.el.remove(), id]
	});
	const handles: Map<string, { el: HTMLDivElement; pane: Pane }> = r.handles();
	void [changed, handles];
}
