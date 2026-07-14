// A LIVE device dashboard — the thing a static HTML form can't be.
//
// This is why the JS earns its ~KBs: telemetry streams in and the DOM tracks it
// with no re-render, controls talk to the device and reflect its real state,
// the config form rewrites itself (when()) as you change modes, and a derived
// value updates as you type. All from qrp's Proxy reactivity.
//
// build.js bundles + minifies + gzips this into a PROGMEM blob the ESP32 serves.

import { state, el, when, derive, list } from "../../qrp/index.js";
import { portal } from "../../behaviors/portal.js";
import { dismissable } from "../../behaviors/dismissable.js";
import { trapFocus } from "../../behaviors/trap-focus.js";

const POLL_MS = 1500;
const BARS = 40;

// ---- reactive state: the single source of truth the DOM mirrors ----
const telemetry = state({ temp: 0, humidity: 0, rssi: 0, heap: 0, uptime: 0, history: [] });
const device = state({ online: false, demo: false, led: false, level: 128 });
const config = state({ mode: "sta", ssid: "home-wifi", password: "", apChannel: 6, interval: 30 });
const log = state({ entries: [] });

let logId = 0;
const note = (msg) => { log.entries = [{ id: ++logId, msg }, ...log.entries].slice(0, 6); };

const applyState = (s) => {
	telemetry.temp = s.temp; telemetry.humidity = s.humidity; telemetry.rssi = s.rssi;
	telemetry.heap = s.heap; telemetry.uptime = s.uptime;
	telemetry.history = [...telemetry.history, s.temp].slice(-BARS);
};

// ---- data source: real device, or a simulation for the offline demo ----
const startSim = () => {
	device.demo = true;
	let temp = 22.4, hum = 47, up = 0;
	note("running in demo mode (no device)");
	setInterval(() => {
		temp += (Math.random() - 0.5) * 0.7;
		hum += (Math.random() - 0.5) * 1.4;
		up += POLL_MS / 1000;
		applyState({
			temp, humidity: Math.max(20, Math.min(80, hum)),
			rssi: -52 - Math.round(Math.random() * 22),
			heap: 198 + Math.round(Math.random() * 44), uptime: Math.round(up)
		});
		if (Math.random() < 0.15) note(`temp ${temp.toFixed(1)}°C · heap ${telemetry.heap} KB`);
	}, POLL_MS);
};

const startPolling = () => {
	device.online = true;
	setInterval(() => {
		fetch("api/state").then((r) => r.json()).then(applyState).catch(() => { device.online = false; });
	}, POLL_MS);
};

// probe once; a device answers with live data, the static demo answers {demo:true}
fetch("api/state")
	.then((r) => r.json())
	.then((s) => { if (s.demo) { startSim(); } else { applyState(s); startPolling(); } })
	.catch(startSim);

// load saved config (device serves real values; the demo serves defaults)
fetch("api/settings").then((r) => r.json()).then((s) => Object.assign(config, s)).catch(() => {});

// ---- controls: write to the device, reflect its state ----
const setLed = (on, level) => {
	device.led = on; if (level != null) { device.level = level; }
	note(on ? `LED on @ ${device.level}` : "LED off");
	fetch("api/led", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify({ on: device.led, level: device.level })
	}).catch(() => {});   // demo has no device; state already updated locally
};

// ---- WiFi scan modal: portal + trapFocus + dismissable, results via list() ----
const SIM_NETS = [
	{ ssid: "greenhouse-wifi", rssi: -46 }, { ssid: "barn-2.4", rssi: -58 },
	{ ssid: "NETGEAR-guest", rssi: -67 }, { ssid: "Pixel_hotspot", rssi: -72 },
	{ ssid: "farmhouse", rssi: -81 }
];
const scan = state({ nets: [], scanning: false });
let closeModal = () => {};

const pickNetwork = (ssid) => { config.ssid = ssid; config.mode = "sta"; note(`selected "${ssid}"`); closeModal(); };

const openScan = () => {
	scan.nets = []; scan.scanning = true;
	const dialog = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Nearby WiFi networks" },
		el("h3", {}, "Nearby networks"),
		when(() => scan.scanning,
			() => el("p", { class: "dim" }, "scanning…"),
			() => el("ul", { class: "netlist" }, list(
				() => scan.nets,
				(n) => n.ssid,
				(n) => el("li", { tabindex: "0", role: "button",
					onclick: () => pickNetwork(n.ssid),
					onkeydown: (e) => { if (e.key === "Enter") { pickNetwork(n.ssid); } } },
				el("span", {}, () => n.ssid),
				el("span", { class: "sig" }, () => `${n.rssi} dBm`))))),
		el("button", { class: "modal-close", onclick: () => closeModal() }, "Close"));
	const backdrop = el("div", { class: "modal-backdrop" }, dialog);

	const remove = portal(backdrop);             // -> document.body
	const untrap = trapFocus(dialog);            // focus trap + restore
	const undismiss = dismissable(dialog, () => closeModal());   // Esc / outside click
	let closed = false;
	closeModal = () => { if (closed) { return; } closed = true; undismiss(); untrap(); remove(); };

	// device scans real networks; the offline demo serves a canned list
	fetch("api/scan").then((r) => r.json())
		.then((nets) => { scan.nets = nets; scan.scanning = false; })
		.catch(() => { scan.nets = SIM_NETS; scan.scanning = false; });
};

const saveConfig = () => {
	note("config saved");
	fetch("api/settings", {
		method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify(config)
	}).catch(() => {});
};

// ---- view ----
const stat = (label, value) => el("div", { class: "stat" },
	el("div", { class: "stat-v" }, value),
	el("div", { class: "stat-k" }, label));

// live "sparkline": fixed bars, each height bound to the rolling temp history
const sparkline = el("div", { class: "spark", "aria-hidden": "true" },
	Array.from({ length: BARS }, (_unused, i) => el("span", { class: "bar", style: () => {
		const h = telemetry.history;
		const v = h[h.length - BARS + i];
		if (v == null) { return "height:2%"; }
		const min = Math.min(...h), max = Math.max(...h), span = (max - min) || 1;
		return `height:${Math.max(6, Math.round(((v - min) / span) * 100))}%`;
	} }))
);

const samplesPerDay = derive(() => Math.round(86400 / Math.max(1, config.interval)));

// build the whole tree with qrp's el() — it renders when()/list() markers;
// native append() would stringify them to "[object Object]".
const root = el("div", {},
	// live status
	el("div", { class: "bar-status" },
		el("span", { class: () => `dot ${device.online ? "on" : "sim"}` }),
		el("span", {}, () => (device.online ? "device online" : "demo mode")),
		el("span", { class: "spacer" }),
		el("span", { class: "dim" }, () => `up ${telemetry.uptime}s`)),

	// live telemetry — updates every tick, no form could do this
	el("div", { class: "grid" },
		stat("Temp °C", () => telemetry.temp.toFixed(1)),
		stat("Humidity %", () => Math.round(telemetry.humidity)),
		stat("WiFi dBm", () => telemetry.rssi),
		stat("Heap KB", () => telemetry.heap)),
	sparkline,

	// live control — writes to the device, reflects real state
	el("div", { class: "control" },
		el("button", { class: () => `toggle ${device.led ? "led-on" : ""}`, onclick: () => setLed(!device.led) },
			() => (device.led ? "◉ LED ON" : "○ LED OFF")),
		el("input", {
			type: "range", min: "0", max: "255", "aria-label": "LED brightness",
			value: () => String(device.level),
			oninput: (e) => setLed(true, Number(e.target.value))
		})),

	// reactive config — the form rewrites ITSELF as the mode changes (when())
	el("h2", { class: "sec" }, "Configuration"),
	el("label", { class: "fld" }, el("span", {}, "Mode"),
		el("select", { value: () => config.mode, onchange: (e) => config.mode = e.target.value },
			el("option", { value: "sta" }, "Station (join WiFi)"),
			el("option", { value: "ap" }, "Access Point"))),

	when(() => config.mode === "sta",
		() => el("div", {},
			el("label", { class: "fld" }, el("span", {}, "WiFi SSID"),
				el("div", { class: "ssid-row" },
					el("input", { "aria-label": "WiFi SSID", value: () => config.ssid, oninput: (e) => config.ssid = e.target.value }),
					el("button", { type: "button", class: "scan-btn", onclick: openScan }, "Scan"))),
			el("label", { class: "fld" }, el("span", {}, "WiFi Password"),
				el("input", { type: "password", "aria-label": "WiFi Password", value: () => config.password, oninput: (e) => config.password = e.target.value }))),
		() => el("label", { class: "fld" }, el("span", {}, "AP Channel"),
			el("input", { type: "number", min: "1", max: "13", "aria-label": "AP Channel", value: () => String(config.apChannel), oninput: (e) => config.apChannel = Number(e.target.value) }))),

	el("label", { class: "fld" }, el("span", {}, "Report every (seconds)"),
		el("input", { type: "number", min: "1", max: "3600", "aria-label": "Report interval seconds", value: () => String(config.interval), oninput: (e) => config.interval = Number(e.target.value) })),
	el("div", { class: "derived" }, () => `→ ${samplesPerDay.value.toLocaleString()} samples/day`),

	el("div", { class: "actions" },
		el("button", { class: "save", onclick: saveConfig }, "Save to device")),

	// live event log
	el("h2", { class: "sec" }, "Activity"),
	el("ul", { class: "log" }, list(
		() => log.entries,
		(e) => e.id,
		(e) => el("li", {}, () => e.msg)
	))
);

document.getElementById("app").append(root);
