// Type-level test: exercises the public .d.ts surface. `tsc --noEmit` on this
// is the "test" for the declarations — it fails if a signature is wrong.

import { state, effect, derive, el, list, when, mount, router, define, navigate, onEffectError, currentRoute } from "../qrp/index.js";
import { html, ref } from "../html/index.js";
import { table } from "../table/index.js";
import { collection } from "../collection/index.js";
import { dataGrid } from "../datagrid/index.js";
import { form, registerInput, inputs, field, parseKV } from "../forms/index.js";
import { createHttp } from "../http/index.js";
import { bus, emitter, fromEvent } from "../events/index.js";
import { notify, createToasts } from "../toasts/index.js";
import { persisted, viewport, media, seen } from "../browser/index.js";
import { portal } from "../behaviors/portal.js";
import { trapFocus } from "../behaviors/trap-focus.js";
import { disclosure } from "../behaviors/disclosure.js";
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

// mount / router / define
const app = mount(document.body, (view) => { view.appendChild(row); });
app.dispose();
const r = router({ "/": (o, ctx) => { void o; void ctx.params.id; }, "/u/:id": (o) => { void o; } }, document.body);
r.dispose();
navigate("/u/1", { replace: true });
define("x-el", (host, attrs) => { void attrs.name; }, { attrs: ["name"] });

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
