/**
 * html/index.js — author DOM as HTML strings, with reactive holes.
 *
 * An alternative to el() for people who think in HTML. Works as a tagged
 * template (with ${} holes) or a plain string call:
 *
 *   html`<div class="card"><h1>${() => title.value}</h1></div>`
 *   html("<div></div>")            // same idea, no holes
 *
 * Hole rules mirror el(), routed through the same effect() primitive:
 *   - string / number  → escaped TEXT (never raw HTML — no injection)
 *   - Node / array     → inserted as-is
 *   - () => value      → reactive text / attribute binding
 *   - onX=${fn}        → event listener
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

// Stitch the static strings and per-hole markers into parseable markup.
const buildMarkup = (strings, values) => {
	let markup = "";

	strings.forEach((chunk, i) => {
		markup += chunk;

		if(i >= values.length) {
			return;
		}

		if(insideTag(markup)) {
			// Attribute hole. Ensure the sentinel is a quoted attribute value.
			const last = markup[markup.length - 1];

			if(last === "\"" || last === "'") {
				markup += HOLE(i);              // opening quote already present
			} else {
				markup += "\"" + HOLE(i) + "\""; // was unquoted (attr=${x})
			}
		} else {
			markup += "<!--" + CHILD_MARKER(i) + "-->";
		}
	});

	return markup;
};

// Replace a child-position comment marker with its value.
const fillChild = (comment, value) => {
	if(typeof value === "function") {
		// Reactive region anchored at the comment; look up the parent each run
		// so it survives the fragment being appended/moved into the document.
		let nodes = [];

		effect(() => {
			// Read value() first so deps are always tracked, then bail if the
			// anchor was detached (parent cleared) instead of crashing on null.
			const fresh = toNodes(value());
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

			const value = values[Number(match[1])];
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

/**
 * Build DOM from an HTML template (tagged) or string (plain).
 *
 * @param {(TemplateStringsArray|string)} strings
 * @param {...*} values interpolated hole values
 * @returns {(Node|DocumentFragment)} single root node, or a fragment
 */
export const html = (strings, ...values) => {
	const tagged = Array.isArray(strings) && strings.raw;
	const markup = tagged ? buildMarkup(strings, values) : String(strings);

	const template = document.createElement("template");
	template.innerHTML = markup.trim();

	const content = template.content;

	fillAttributes(content, values);
	fillChildren(content, values);

	return content.childNodes.length === 1 ? content.firstChild : content;
};
