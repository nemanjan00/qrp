// qrp on an ESP32 — a full reactive settings dashboard served from flash.
//
// The whole UI (HTML + CSS + qrp core + forms + app logic) is one ~4 KB gzipped
// blob baked into PROGMEM by build.js. No SPIFFS/LittleFS, no SD card, no CDN,
// no internet: the chip is its own web app. Flash it, connect to the "qrp-config"
// WiFi network, open http://192.168.4.1/ and edit the device's settings.
//
// Generate the header first:  node build.js   (writes src/dashboard_html_gz.h)
// Build & flash:              pio run -t upload

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include "dashboard_html_gz.h"   // generated: dashboard_html_gz[] + _len

WebServer server(80);
Preferences prefs;

// GET / -> the dashboard, straight from flash, gzip-encoded (browser inflates it)
void handleRoot() {
	server.sendHeader("Content-Encoding", "gzip");
	server.sendHeader("Cache-Control", "no-cache");
	server.send_P(200, "text/html", (PGM_P)dashboard_html_gz, dashboard_html_gz_len);
}

// GET /api/settings -> current config as JSON (the page boots from this)
void handleGetSettings() {
	prefs.begin("qrp", true);
	String json = prefs.getString("json", "{}");
	prefs.end();
	server.send(200, "application/json", json);
}

// POST /api/settings -> persist the reactive settings object to NVS
void handleSaveSettings() {
	if (!server.hasArg("plain")) {
		server.send(400, "application/json", "{\"ok\":false}");
		return;
	}
	prefs.begin("qrp", false);
	prefs.putString("json", server.arg("plain"));
	prefs.end();
	server.send(200, "application/json", "{\"ok\":true}");
}

void setup() {
	// the device hosts its own network — no router, fully offline
	WiFi.softAP("qrp-config", "configure");   // SSID / password

	server.on("/", handleRoot);
	server.on("/api/settings", HTTP_GET, handleGetSettings);
	server.on("/api/settings", HTTP_POST, handleSaveSettings);
	server.begin();
}

void loop() {
	server.handleClient();
}
