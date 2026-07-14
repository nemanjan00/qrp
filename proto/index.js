/**
 * proto/index.js — prototype-level enhancement of native objects.
 *
 * The philosophy: don't wrap objects in your own classes — reach into the
 * platform's own prototypes and enhance them in place, via __proto__, with
 * an idempotency guard so a double-load is harmless. This is how you make
 * "every element", "every history navigation", "every fetch" reactive or
 * intercepted without touching a single call site.
 *
 *   findProto(node, "EventTarget")     walk the __proto__ chain by name
 *   wrapMethod(proto, "addEventListener", original => function(...) {...})
 *   onceOnly(fn)                        run a patch at most once per process
 */

/**
 * Walk obj's prototype chain and return the prototype whose constructor is
 * named protoName, or undefined. (The findProto from your userscripts.)
 */
export const findProto = (obj, protoName) => {
	let proto = Object.getPrototypeOf(obj);

	while(proto) {
		if(proto.constructor && proto.constructor.name === protoName) {
			return proto;
		}

		proto = Object.getPrototypeOf(proto);
	}

	return undefined;
};

/**
 * Replace proto[method] with make(original). Idempotent: the replacement is
 * tagged, and a second wrapMethod with the same tag is a no-op — so loading
 * your script twice won't double-wrap (the `.replaced` guard, generalized).
 *
 *   wrapMethod(History.prototype, "pushState", original => function(...args) {
 *     const result = original.apply(this, args);
 *     window.dispatchEvent(new CustomEvent("qrp:navigate"));
 *     return result;
 *   });
 *
 * Returns a restore() that puts the original back.
 */
export const wrapMethod = (proto, method, make, tag = "qrp") => {
	const original = proto[method];

	if(original && original.__qrpTag === tag) {
		return () => {}; // already wrapped with this tag
	}

	const replacement = make(original);

	replacement.__qrpTag = tag;
	replacement.__qrpOriginal = original;

	proto[method] = replacement;

	return () => {
		if(proto[method] === replacement) {
			proto[method] = original;
		}
	};
};

/** Wrap a fn so it only ever executes once; later calls are no-ops. */
export const onceOnly = (fn) => {
	let done = false;

	return (...args) => {
		if(done) {
			return;
		}

		done = true;

		return fn(...args);
	};
};

/**
 * Global click delegation on the EventTarget prototype found from a live
 * node. Registers ONE listener that dispatches to matchers by CSS selector —
 * the "one listener for the whole document" trick, prototype-discovered the
 * way your logout userscript finds EventTarget.
 *
 *   const stop = delegate(document, "a.external", (event, link) => { ... });
 */
export const delegate = (root, selector, handler, type = "click") => {
	const listener = (event) => {
		const match = event.target.closest && event.target.closest(selector);

		if(match && root.contains(match)) {
			handler(event, match);
		}
	};

	root.addEventListener(type, listener);

	return () => root.removeEventListener(type, listener);
};
