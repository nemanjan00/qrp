/**
 * html/index.js — author DOM as HTML strings, with reactive holes.
 *
 * An alternative to el() for people who think in HTML. Three ways in:
 *
 *   html`<div class="card"><h1>${() => title.value}</h1></div>`   // tagged, ${}
 *   html("<div></div>")                                           // plain string
 *   html.template("<tr><td>#{name}</td></tr>")                    // storable, #{}
 *
 * WHY TWO SIGILS:
 *   - ${}  is JavaScript's own interpolation — evaluated at the call site. Great
 *     for inline authoring; the holes are gone before html() sees them, so a ${}
 *     template can't be stored and reused.
 *   - #{}  is parsed by html.template itself, so it stays literal text in the
 *     source string — you can keep the template in a file/config and fill it
 *     later from a data object. Reactive when the data is qrp state.
 *
 * Hole rules mirror el(), routed through the same effect() primitive:
 *   - string / number  → escaped TEXT (never raw HTML — no injection)
 *   - Node / array     → inserted as-is
 *   - () => value      → reactive text / attribute binding
 *   - onX=${fn}        → event listener
 *   - ref(value)       → a token you can embed in a PLAIN string (see ref)
 *
 * Static template text is trusted (you wrote it); interpolated string holes are
 * data and are escaped as text. If you truly need to inject markup, build it
 * with html()/el() and pass the node, not a string.
 *
 * Parsing uses an inert <template> (scripts don't run, no reflow). Returns the
 * single root node, or a DocumentFragment when there are several.
 *
 * Limitations (v1): one dynamic value per attribute (`class=${x}`, not
 * `class="a ${x} ${y}"`); no attribute-name or spread holes (`<div ${obj}>`).
 */

import { effect } from "../qrp/index.js";

const HOLE = (i) => `__qrp_hole_${i}__`;
const CHILD_MARKER = (i) => `qrp-hole:${i}`;

// --- ref(): inject a live value into a PLAIN string ------------------------
//
// The tagged form doesn't need this — ${x} passes the real object. But when you
// build markup by string concatenation (html("<div>" + x + "</div>")), x is
// stringified and its reference is lost. ref(x) returns an opt-in token you can
// embed; html() swaps it back for the real node/binding. Opt-in (no
// Node.prototype.toString patching) and consumed on use (delete-on-read), so
// there's no global footgun and no leak once the template is built.
//
//   html(`<div>${ref(myNode)} ${ref(() => count.n)}</div>`)

let refSeq = 0;
const refs = new Map(); // token -> value

const REF_TOKEN = (n) => `__qrp_ref_${n}__`;
const REF_RE = /__qrp_ref_(\d+)__/g;

/**
 * Register a value for embedding in a plain html() string; returns its token.
 * @param {*} value node, string, array, or () => renderable
 * @returns {string} token to place in the markup string
 */
export const ref = (value) => {
	const token = REF_TOKEN(refSeq++);

	refs.set(token, value);

	return token;
};

// If value is a ref token (or a bare token string), resolve+consume it.
const resolveRef = (value) => {
	if(typeof value === "string" && refs.has(value)) {
		const resolved = refs.get(value);

		refs.delete(value);

		return resolved;
	}

	return value;
};

// Minimal attribute setter, mirroring el()'s rules.
const setAttr = (node, key, value) => {
	if(key === "class") {
		node.className = value == null ? "" : value;

		return;
	}

	if(key === "style" && value && typeof value === "object") {
		Object.assign(node.style, value);

		return;
	}

	if(key in node) {
		node[key] = value;

		return;
	}

	if(value == null || value === false) {
		node.removeAttribute(key);
	} else {
		node.setAttribute(key, value === true ? "" : value);
	}
};

const toNodes = (value) => {
	if(value == null || value === false) {
		return [];
	}

	if(Array.isArray(value)) {
		return value.flatMap(toNodes);
	}

	if(value instanceof Node) {
		return [value];
	}

	return [document.createTextNode(String(value))];
};

// True when the accumulated markup ends inside an unclosed tag (attribute
// position) rather than in element content (child position).
const insideTag = (markup) => markup.lastIndexOf("<") > markup.lastIndexOf(">");

// Append hole index `i`'s marker to `markup`, choosing attr vs child by where
// the markup currently sits. Returns the new markup.
const appendMarker = (markup, i) => {
	if(insideTag(markup)) {
		// Attribute hole. Ensure the sentinel is a quoted attribute value.
		const last = markup[markup.length - 1];

		if(last === "\"" || last === "'") {
			return markup + HOLE(i);              // opening quote already present
		}

		return markup + "\"" + HOLE(i) + "\"";   // was unquoted (attr=${x})
	}

	return markup + "<!--" + CHILD_MARKER(i) + "-->";
};

// Stitch the static strings and per-hole markers into parseable markup.
const buildMarkup = (strings, values) => {
	let markup = "";

	strings.forEach((chunk, i) => {
		markup += chunk;

		if(i < values.length) {
			markup = appendMarker(markup, i);
		}
	});

	return markup;
};

// Rewrite ref tokens embedded in a raw string into hole markers, collecting the
// registered values (position-aware, so a ref in attr vs child slots correctly).
const extractRefs = (raw) => {
	const values = [];
	let markup = "";
	let last = 0;
	let m;

	REF_RE.lastIndex = 0;

	while((m = REF_RE.exec(raw))) {
		markup += raw.slice(last, m.index);

		const index = values.length;

		values.push(resolveRef(m[0]));
		markup = appendMarker(markup, index);

		last = m.index + m[0].length;
	}

	markup += raw.slice(last);

	return { markup, values };
};

// Replace a child-position comment marker with its value.
const fillChild = (comment, rawValue) => {
	const value = resolveRef(rawValue);

	if(typeof value === "function") {
		// Reactive region anchored at the comment; look up the parent each run
		// so it survives the fragment being appended/moved into the document.
		let nodes = [];

		effect(() => {
			const v = value();

			// Fast path: update the existing text node in place (see qrp core).
			if(nodes.length === 1 && nodes[0].nodeType === 3
				&& (typeof v === "string" || typeof v === "number")) {
				const next = String(v);

				if(nodes[0].data !== next) {
					nodes[0].data = next;
				}

				return;
			}

			const fresh = toNodes(v);
			const parent = comment.parentNode;

			if(!parent) {
				nodes = fresh;

				return;
			}

			nodes.forEach((node) => node.remove());
			fresh.forEach((node) => parent.insertBefore(node, comment));

			nodes = fresh;
		});

		return;
	}

	const parent = comment.parentNode;

	toNodes(value).forEach((node) => parent.insertBefore(node, comment));
	comment.remove();
};

const COMMENT_NODE = 8;

// Collect every comment node under root (recursive; TreeWalker's numeric
// whatToShow is unreliable across DOM implementations).
const collectComments = (node, out) => {
	node.childNodes.forEach((child) => {
		if(child.nodeType === COMMENT_NODE) {
			out.push(child);
		} else if(child.childNodes) {
			collectComments(child, out);
		}
	});

	return out;
};

const fillChildren = (root, values) => {
	const comments = collectComments(root, []);
	const found = [];

	comments.forEach((comment) => {
		const match = comment.nodeValue.match(/^qrp-hole:(\d+)$/);

		if(match) {
			found.push([comment, Number(match[1])]);
		}
	});

	found.forEach(([comment, index]) => fillChild(comment, values[index]));
};

const fillAttributes = (root, values) => {
	root.querySelectorAll("*").forEach((node) => {
		[...node.attributes].forEach((attr) => {
			const match = attr.value.match(/^__qrp_hole_(\d+)__$/);

			if(!match) {
				return;
			}

			const value = resolveRef(values[Number(match[1])]);
			const name = attr.name;

			node.removeAttribute(name);

			if(name.startsWith("on") && typeof value === "function") {
				node.addEventListener(name.slice(2).toLowerCase(), value);
			} else if(typeof value === "function") {
				effect(() => setAttr(node, name, value()));
			} else {
				setAttr(node, name, value);
			}
		});
	});
};

// Build DOM from finished marker-markup + a values array.
const render = (markup, values) => {
	const template = document.createElement("template");
	template.innerHTML = markup.trim();

	const content = template.content;

	fillAttributes(content, values);
	fillChildren(content, values);

	return content.childNodes.length === 1 ? content.firstChild : content;
};

/**
 * Build DOM from an HTML template (tagged) or string (plain).
 *
 * @param {(TemplateStringsArray|string)} strings
 * @param {...*} values interpolated hole values
 * @returns {(Node|DocumentFragment)} single root node, or a fragment
 */
export const html = (strings, ...values) => {
	const tagged = Array.isArray(strings) && strings.raw;

	if(tagged) {
		return render(buildMarkup(strings, values), values);
	}

	// Plain string: it may carry ref() tokens from concatenation — turn those
	// into holes so embedded live nodes/bindings resolve.
	const extracted = extractRefs(String(strings));

	return render(extracted.markup, extracted.values);
};

const TEMPLATE_FIELD_RE = /#\{([\w.]+)\}/g;

const getPath = (obj, path) => path.split(".").reduce((o, key) => (o == null ? o : o[key]), obj);

/**
 * Compile a STORABLE template string with #{field} placeholders into a filler.
 * Because #{} is not JavaScript interpolation, the source survives as literal
 * text — keep it in a file, config, or <template> and fill it later:
 *
 *   const rowTpl = html.template("<tr><td>#{name}</td><td>#{email}</td></tr>");
 *   rowTpl(user);                 // → DOM, bound to user.name / user.email
 *   rowTpl(state({ name: "R2" })); // reactive when the data is qrp state
 *
 * Fields support dotted paths (#{user.name}) and are escaped as text
 * (XSS-safe). The source is parsed ONCE; each call builds fresh DOM.
 *
 * @param {string} source template string with #{field} placeholders
 * @returns {function} (data) => Node | DocumentFragment
 */
html.template = (source) => {
	const fields = [];
	let markup = "";
	let last = 0;
	let m;

	TEMPLATE_FIELD_RE.lastIndex = 0;

	while((m = TEMPLATE_FIELD_RE.exec(source))) {
		markup += source.slice(last, m.index);

		const index = fields.length;

		fields.push(m[1]);
		markup = appendMarker(markup, index);

		last = m.index + m[0].length;
	}

	markup += source.slice(last);

	// Each field becomes a reactive getter bound to the data object, so filling
	// with qrp state tracks; filling with a plain object is a one-shot read.
	return (data) => render(markup, fields.map((field) => () => getPath(data, field)));
};
