# qrp on an ESP32 — a live dashboard that lives in flash

A **live, reactive device dashboard** — served by an **$8 microcontroller off its
own WiFi**, with no internet, no CDN, and no filesystem. The whole app (HTML + CSS
+ qrp's core + behaviors + the logic) is **one ~7 KB gzipped blob** baked into
PROGMEM.

**[▶ Live demo](https://qrp.nemanja.top/examples/esp32/dashboard.html)** —
the *exact* page the chip serves. Offline it runs in demo mode (simulated
telemetry) so you can see it move.

## Why the JS earns its place

A static HTML form can't do any of this — which is the point:

- **Live telemetry.** Temp / humidity / RSSI / free-heap stream from
  `GET /api/state` every 1.5 s and the DOM tracks them with no re-render — plus a
  rolling sparkline. A `Proxy` set fires exactly the bindings that changed.
- **Live control.** An LED toggle + brightness slider `POST` to the device and
  reflect its real state.
- **A form that rewrites itself.** `when()` swaps the config fields as you change
  Mode — SSID + password for Station, channel for Access Point — and a `derive()`
  shows "N samples/day" as you type the interval.
- **A WiFi-scan modal** from `portal` + `trapFocus` + `dismissable`, its results
  rendered with a keyed `list()`. Pick a network → it fills the SSID.

It's all in [`app.js`](app.js), importing only qrp's core + three behaviors.

## Why it fits

| what the browser loads | size |
|---|---|
| app JS (qrp core + behaviors + logic, minified) | ~12.7 KB |
| full HTML page (with inline CSS) | ~17.4 KB |
| **gzipped — the total flashed to the device** | **~7 KB** |

`react-dom` alone is ~45 KB gzipped — **~6× this entire live dashboard**, before a
line of your own UI. On a chip with a few hundred KB of free flash, that gap is
the difference between "fits with room for your firmware" and "doesn't fit."

## Build & flash (PlatformIO)

```sh
node build.js          # bundle the UI -> src/dashboard_html_gz.h (PROGMEM blob)
pio run -t upload      # compile + flash the ESP32
```

`build.js` bundles [`app.js`](app.js) (inlining qrp), minifies it into the HTML
shell, gzips the result, and writes `src/dashboard_html_gz.h`.
[`src/main.cpp`](src/main.cpp) `#include`s that blob and serves it; any ESP32
board works via [`platformio.ini`](platformio.ini) (WiFi / WebServer /
Preferences ship with the Arduino-ESP32 core — no libraries to add).

1. Connect to the **`qrp-node`** WiFi network (password `configure`).
2. Browse to **http://192.168.4.1/**.
3. Watch telemetry stream; drive the LED; scan WiFi; edit config and **Save**
   (persisted to NVS via `Preferences`).

## Endpoints

| route | purpose |
|---|---|
| `GET /` | the gzipped dashboard, from PROGMEM |
| `GET /api/state` | live telemetry the page polls |
| `POST /api/led` | drive the LED |
| `GET /api/scan` | nearby WiFi networks (the modal) |
| `GET` / `POST /api/settings` | load / persist config |

## Files

- [`app.js`](app.js) — the dashboard (core + behaviors).
- [`dashboard.template.html`](dashboard.template.html) — the HTML/CSS shell.
- [`build.js`](build.js) — bundle → minify → inline → gzip → PROGMEM header.
- [`platformio.ini`](platformio.ini) — the ESP32 build config.
- [`src/main.cpp`](src/main.cpp) — the web server (telemetry, LED, scan, config).
- [`api/`](api/) — static JSON so the offline demo runs without a device.
- `dashboard.html` / `src/dashboard_html_gz.h` — generated.
