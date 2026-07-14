# qrp on an ESP32 — a settings dashboard that lives in flash

A complete, reactive device-configuration UI — served by an **$8 microcontroller
off its own WiFi**, with no internet, no CDN, and no filesystem. The entire app
(HTML + CSS + qrp's core + the `forms` module + the logic) is **one ~4 KB gzipped
blob** baked into PROGMEM.

**[▶ Live demo](https://qrp-xdl4.onrender.com/examples/esp32/dashboard.html)** —
this is the *exact* page the chip serves (offline, it just falls back to default
values).

## Why it fits

A device's configuration *is* data — `{ ssid, password, mqtt, interval, mode }` —
so `form()` renders it as the whole dashboard: native inputs, a select,
validation, all two-way-bound to a `Proxy`. That's the entire UI in
[`app.js`](app.js).

Measured footprint of everything the browser loads:

| piece | size |
|---|---|
| app JS (qrp core + forms + logic, minified) | ~7.3 KB |
| full HTML page (with inline CSS) | ~8.6 KB |
| **gzipped — the total flashed to the device** | **~4 KB** |

For contrast, `react-dom` alone is ~130 KB minified (~45 KB gzipped) — **more than
ten times this entire dashboard**, before a single field. On a chip with a few
hundred KB of free flash, that gap is the difference between "fits with room for
your firmware" and "doesn't fit."

## Build & flash (PlatformIO)

```sh
node build.js          # bundle the UI -> src/dashboard_html_gz.h (PROGMEM blob)
pio run -t upload      # compile + flash the ESP32
```

`build.js` bundles [`app.js`](app.js) (inlining qrp), minifies it into the HTML
shell, gzips the result, and writes `src/dashboard_html_gz.h`. Then
[`src/main.cpp`](src/main.cpp) `#include`s that blob and serves it. Any ESP32
board works out of the box via [`platformio.ini`](platformio.ini); no libraries
to add (WiFi / WebServer / Preferences ship with the Arduino-ESP32 core).

1. Connect to the **`qrp-config`** WiFi network (password `configure`).
2. Browse to **http://192.168.4.1/**.
3. Edit settings, hit **Save** — the reactive object is `POST`ed as JSON and
   written to NVS (`Preferences`). On next boot the page loads those values from
   `GET /api/settings`.

## Files

- [`app.js`](app.js) — the dashboard (imports `state`, `el`, `form`).
- [`dashboard.template.html`](dashboard.template.html) — the HTML/CSS shell.
- [`build.js`](build.js) — bundle → minify → inline → gzip → PROGMEM header.
- [`platformio.ini`](platformio.ini) — the ESP32 build config.
- [`src/main.cpp`](src/main.cpp) — the web server (serves the blob, persists
  config to flash).
- `dashboard.html` / `dashboard.html.gz` / `src/dashboard_html_gz.h` — generated.
