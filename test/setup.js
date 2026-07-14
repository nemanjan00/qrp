import { Window } from "happy-dom";

const window = new Window({ url: "https://example.test/" });

// Expose the DOM globals qrp expects. Anything the framework touches on the
// global scope (document, window, event constructors, observers, matchMedia,
// storage, history, navigator) is proxied straight to the happy-dom window.
const globals = [
	"document", "Node", "Event", "CustomEvent", "EventTarget", "HTMLElement",
	"customElements", "IntersectionObserver", "MutationObserver", "matchMedia",
	"localStorage", "sessionStorage", "history", "location", "navigator",
	"URL", "URLSearchParams", "BroadcastChannel", "getComputedStyle",
	"requestAnimationFrame", "cancelAnimationFrame"
];

globalThis.window = window;

globals.forEach(name => {
	if(window[name] === undefined) {
		return;
	}

	try {
		globalThis[name] = window[name];
	} catch {
		// Some globals (navigator) are getter-only; define instead.
		Object.defineProperty(globalThis, name, {
			value: window[name],
			configurable: true,
			writable: true
		});
	}
});
