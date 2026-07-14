// qrp on an ESP32 — a LIVE reactive dashboard served from flash.
//
// The whole UI (HTML + CSS + qrp core + app logic) is one gzipped blob baked
// into PROGMEM by build.js. No SPIFFS/LittleFS, no SD card, no CDN, no internet:
// the chip is its own live web app. Flash it, connect to the "qrp-node" WiFi,
// open http://192.168.4.1/ and watch telemetry stream while you drive the LED
// and edit config — all reactive, all offline.
//
// Endpoints: GET /  GET|POST /api/settings  GET /api/state  POST /api/led
//
// Generate the header first:  node build.js   (writes src/dashboard_html_gz.h)
// Build & flash:              pio run -t upload

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include "dashboard_html_gz.h"   // generated: dashboard_html_gz[] + _len

const int LED_PIN = 2;   // onboard LED on most ESP32 dev boards

WebServer server(80);
Preferences prefs;

// GET / -> the dashboard, straight from flash, gzip-encoded (browser inflates it)
void handleRoot() {
	server.sendHeader("Content-Encoding", "gzip");
	server.sendHeader("Cache-Control", "no-cache");
	server.send_P(200, "text/html", (PGM_P)dashboard_html_gz, dashboard_html_gz_len);
}

// GET /api/state -> live telemetry the dashboard polls and binds reactively
void handleState() {
	char json[192];
	snprintf(json, sizeof(json),
		"{\"temp\":%.1f,\"humidity\":%.0f,\"rssi\":%d,\"heap\":%u,\"uptime\":%lu}",
		temperatureRead(),                 // built-in core temp sensor
		48.0,                              // swap for a real humidity reading
		WiFi.RSSI(),
		ESP.getFreeHeap() / 1024,
		millis() / 1000);
	server.send(200, "application/json", json);
}

// POST /api/led -> drive the LED, reflect the device's real state back
void handleLed() {
	if (server.hasArg("plain") && server.arg("plain").indexOf("\"on\":true") >= 0) {
		digitalWrite(LED_PIN, HIGH);
	} else {
		digitalWrite(LED_PIN, LOW);
	}
	server.send(200, "application/json", "{\"ok\":true}");
}

// GET /api/scan -> nearby networks as JSON [{ssid,rssi}, ...] for the modal
void handleScan() {
	int n = WiFi.scanNetworks();
	String json = "[";
	for (int i = 0; i < n; i++) {
		if (i) { json += ","; }
		json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + WiFi.RSSI(i) + "}";
	}
	json += "]";
	WiFi.scanDelete();
	server.send(200, "application/json", json);
}

void handleGetSettings() {
	prefs.begin("qrp", true);
	String json = prefs.getString("json", "{}");
	prefs.end();
	server.send(200, "application/json", json);
}

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
	pinMode(LED_PIN, OUTPUT);
	WiFi.softAP("qrp-node", "configure");   // its own network — fully offline

	server.on("/", handleRoot);
	server.on("/api/state", HTTP_GET, handleState);
	server.on("/api/led", HTTP_POST, handleLed);
	server.on("/api/scan", HTTP_GET, handleScan);
	server.on("/api/settings", HTTP_GET, handleGetSettings);
	server.on("/api/settings", HTTP_POST, handleSaveSettings);
	server.begin();
}

void loop() {
	server.handleClient();
}
