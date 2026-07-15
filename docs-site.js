/**
 * docs-site.js — the shared engine behind the rendered doc pages (start / api /
 * styling / sharp). Each page is a thin shell that links docs-site.css and calls
 * renderDocPage() with its own markdown source; this fetches that single-source
 * `.md` and renders it to DOM with a compact Markdown renderer — dogfooding qrp,
 * no markdown library. One source instead of four copy-pasted renderers.
 */

import { state, el, list } from "@nemanjan00/qrp";

// Cross-doc `.md` links -> their rendered pages (the `.md` is authored for
// GitHub); other relative paths are kept / rebased for the site context.
const DOC_PAGES = { "API.md": "api.html", "GETTING-STARTED.md": "start.html", "STYLING.md": "styling.html", "SHARP-EDGES.md": "sharp.html" };

const resolveHref = (href) => {
	if(/^(https?:|#)/.test(href)) { return href; }

	const m = href.match(/^\.\/([A-Z0-9-]+\.md)(#.*)?$/);

	if(m && DOC_PAGES[m[1]]) { return DOC_PAGES[m[1]] + (m[2] || ""); }

	return href.replace(/^\.\.\/examples/, "examples").replace(/^\.\.\//, "./");
};

// inline: `code`, **bold**, *italic*, [text](url)
const inline = (text) => {
	const out = [];
	const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
	let last = 0, m;

	while((m = re.exec(text))) {
		if(m.index > last) { out.push(text.slice(last, m.index)); }
		if(m[1] !== undefined) { out.push(el("code", {}, m[1])); }
		else if(m[2] !== undefined) { out.push(el("strong", {}, ...inline(m[2]))); }
		else if(m[3] !== undefined) { out.push(el("em", {}, ...inline(m[3]))); }
		else { out.push(el("a", { href: resolveHref(m[5]) }, ...inline(m[4]))); }
		last = m.index + m[0].length;
	}

	if(last < text.length) { out.push(text.slice(last)); }

	return out;
};

// GitHub-compatible slug: strip punctuation, spaces -> hyphens.
const slug = (s) => s.toLowerCase().replace(/`/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s/g, "-");

// block-level parse → array of DOM nodes; also collects headings for the TOC
const renderMarkdown = (md) => {
	const lines = md.replace(/\r/g, "").split("\n");
	const nodes = [];
	const toc = [];
	let i = 0;
	const tocText = (t) => t.replace(/`/g, "").replace(/\*\*/g, "");

	while(i < lines.length) {
		const line = lines[i];

		// fenced code
		if(/^```/.test(line)) {
			const buf = [];
			i++;
			while(i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i++]); }
			i++;
			nodes.push(el("pre", {}, el("code", {}, buf.join("\n"))));
			continue;
		}
		// headings
		const hm = line.match(/^(#{1,4})\s+(.*)$/);
		if(hm) {
			const level = hm[1].length;
			const id = slug(hm[2]);
			nodes.push(el("h" + level, { id }, ...inline(hm[2])));
			if(level === 2 || level === 3) { toc.push({ level, id, text: tocText(hm[2]) }); }
			i++;
			continue;
		}
		// hr
		if(/^---+\s*$/.test(line)) { nodes.push(el("hr")); i++; continue; }
		// blockquote
		if(/^>\s?/.test(line)) {
			const buf = [];
			while(i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i++].replace(/^>\s?/, "")); }
			nodes.push(el("blockquote", {}, ...inline(buf.join(" "))));
			continue;
		}
		// table
		if(/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
			const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
			const head = cells(line);
			i += 2;
			const body = [];
			while(i < lines.length && /^\|/.test(lines[i])) { body.push(cells(lines[i++])); }
			nodes.push(el("div", { class: "tablewrap" },
				el("table", {},
					el("thead", {}, el("tr", {}, head.map((h) => el("th", {}, ...inline(h))))),
					el("tbody", {}, body.map((r) => el("tr", {}, r.map((c) => el("td", {}, ...inline(c)))))))));
			continue;
		}
		// lists
		if(/^\s*([-*]|\d+\.)\s+/.test(line)) {
			const ordered = /^\s*\d+\.\s+/.test(line);
			const items = [];
			while(i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
				items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
			}
			nodes.push(el(ordered ? "ol" : "ul", {}, items.map((it) => el("li", {}, ...inline(it)))));
			continue;
		}
		// blank
		if(/^\s*$/.test(line)) { i++; continue; }
		// paragraph (gather until blank / block start)
		const buf = [line];
		i++;
		while(i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|```|\||>|---+\s*$|\s*([-*]|\d+\.)\s)/.test(lines[i])) {
			buf.push(lines[i++]);
		}
		nodes.push(el("p", {}, ...inline(buf.join(" "))));
	}

	return { nodes, toc };
};

/**
 * Fetch a single-source `.md` and render it into `#doc`, wiring the `#toc` list
 * and the `#search` filter. All page-specific wording derives from the config.
 *
 * @param {object} config
 * @param {string} config.md URL of the markdown to fetch (e.g. "./docs/API.md")
 * @param {string} config.noun what this doc is, for prose ("the guide", "styling")
 * @param {string} config.sections label stem for the TOC's aria-label ("Guide")
 */
export const renderDocPage = ({ md, noun, sections }) => {
	const searchEl = document.getElementById("search");
	const tocEl = document.getElementById("toc");
	const docEl = document.getElementById("doc");

	// Wording is derived, not duplicated per page.
	if(searchEl) { searchEl.setAttribute("aria-label", `Filter ${noun}`); }
	if(tocEl) { tocEl.setAttribute("aria-label", `${sections} sections`); }
	docEl.replaceChildren(el("div", { class: "loading" }, `Loading ${noun}…`));

	fetch(md).then((r) => {
		if(!r.ok) { throw new Error("HTTP " + r.status); }

		return r.text();
	}).then((markdown) => {
		const { nodes, toc } = renderMarkdown(markdown);
		docEl.replaceChildren(...nodes);

		const q = state({ term: "" });
		const entries = toc.map((t) => ({ ...t, hay: t.text.toLowerCase() }));

		tocEl.replaceChildren(el("ul", { class: "toc", style: "padding:0" },
			list(
				() => entries.filter((e) => !q.term || e.hay.includes(q.term)),
				(e) => e.id,
				(e) => el("li", {}, el("a", { href: "#" + e.id, class: e.level === 3 ? "sub" : "" }, e.text)))));

		if(searchEl) { searchEl.addEventListener("input", (ev) => { q.term = ev.target.value.toLowerCase(); }); }
	}).catch((err) => {
		docEl.replaceChildren(
			el("p", {}, `Could not load ${noun} (`, el("code", {}, String(err.message || err)), ")."),
			el("p", { class: "note" }, `Serve this over HTTP (e.g. python -m http.server) so ${md} is fetchable, or read it directly: `,
				el("a", { href: md }, md), "."));
	});
};
