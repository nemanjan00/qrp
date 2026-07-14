// The entire dashboard: a device settings panel, built from just qrp's core
// + forms module. `build.js` bundles + minifies this, inlines it into one
// self-contained HTML file, gzips it, and emits a PROGMEM byte array the ESP32
// serves straight from flash. No CDN, no runtime deps, works fully offline.

import { state, el } from "../../qrp/index.js";
import { form } from "../../forms/index.js";

// the device's configuration IS the data — form() turns it into the UI
const DEFAULTS = { ssid: "", password: "", mqtt: "", interval: 30, mode: "sta" };

const boot = (initial) => {
	const settings = state({ ...DEFAULTS, ...initial });
	const status = state({ msg: "" });

	const save = () => {
		status.msg = "saving…";
		fetch("/api/settings", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(settings)
		})
			.then((res) => { status.msg = res.ok ? "saved to device ✓" : "error"; })
			.catch(() => { status.msg = "device offline"; });
	};

	document.getElementById("app").append(
		form({ settings, fields: {
			ssid:     { name: "WiFi SSID", type: "text" },
			password: { name: "WiFi Password", type: "password" },
			mqtt:     { name: "MQTT Broker", type: "text", placeholder: "192.168.1.10" },
			interval: { name: "Report every (seconds)", type: "number", min: 1, max: 3600 },
			mode:     { name: "Mode", type: "select", options: {
				sta: "Station (join WiFi)", ap: "Access Point"
			} }
		} }),
		el("div", { class: "actions" },
			el("button", { class: "save", onclick: save }, "Save to device"),
			el("span", { class: "status" }, () => status.msg))
	);
};

// the chip serves current config at /api/settings; fall back to defaults offline
fetch("/api/settings")
	.then((res) => (res.ok ? res.json() : {}))
	.then(boot)
	.catch(() => boot({}));
