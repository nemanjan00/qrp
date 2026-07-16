#!/usr/bin/env node
/**
 * Generate docs/API.md from the TypeScript declarations (*.d.ts).
 *
 * The .d.ts are the single source of API truth (rich types, guarded by
 * `npm run typecheck`). This walks each declaration's doc comment + signature
 * and emits the reference, so the markdown — and the website that renders it —
 * never has to be hand-kept in sync. Run: `npm run docs`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Module order + display + import path + the .d.ts file(s) it aggregates.
const MODULES = [
	{ title: "qrp — core", imp: "@nemanjan00/qrp", files: ["qrp/index.d.ts"] },
	{ title: "html — HTML templates", imp: "@nemanjan00/qrp/html", files: ["html/index.d.ts"] },
	{ title: "forms", imp: "@nemanjan00/qrp/forms", files: ["forms/index.d.ts"] },
	{ title: "collection", imp: "@nemanjan00/qrp/collection", files: ["collection/index.d.ts"] },
	{ title: "table", imp: "@nemanjan00/qrp/table", files: ["table/index.d.ts"] },
	{ title: "datagrid", imp: "@nemanjan00/qrp/datagrid", files: ["datagrid/index.d.ts"] },
	{ title: "http", imp: "@nemanjan00/qrp/http", files: ["http/index.d.ts"] },
	{ title: "events", imp: "@nemanjan00/qrp/events", files: ["events/index.d.ts"] },
	{ title: "toasts", imp: "@nemanjan00/qrp/toasts", files: ["toasts/index.d.ts"] },
	{ title: "browser", imp: "@nemanjan00/qrp/browser", files: ["browser/index.d.ts"] },
	{ title: "behaviors", imp: "@nemanjan00/qrp/behaviors/<name>", files: [
		"behaviors/portal.d.ts", "behaviors/dismissable.d.ts", "behaviors/trap-focus.d.ts",
		"behaviors/anchored.d.ts", "behaviors/disclosure.d.ts", "behaviors/busy-while.d.ts"] },
	{ title: "utils", imp: "@nemanjan00/qrp/utils/<name>", files: [
		"utils/lru.d.ts", "utils/memoize.d.ts", "utils/cache.d.ts", "utils/paginate.d.ts",
		"utils/limit.d.ts", "utils/debounce.d.ts", "utils/load-script.d.ts", "utils/validate.d.ts"] },
	{ title: "proto", imp: "@nemanjan00/qrp/proto", files: ["proto/index.d.ts"] }
];

// --- parse one .d.ts into { overview, entries[], types[] } -----------------

// Find the end of a declaration (first `;` at bracket depth 0) from `start`.
const declEnd = (text, start) => {
	let depth = 0;
	for(let i = start; i < text.length; i++) {
		const c = text[i];
		if("([{<".includes(c)) { depth++; }
		else if(")]}>".includes(c)) { depth--; }
		else if(c === ";" && depth <= 0) { return i; }
	}
	return text.length;
};

// Capture a full `interface Name { … }` declaration (brace-matched) from start.
const captureBraceBlock = (text, start) => {
	const open = text.indexOf("{", start);
	if(open < 0) { return text.slice(start, declEnd(text, start) + 1); }

	let depth = 0;
	for(let i = open; i < text.length; i++) {
		if(text[i] === "{") { depth++; }
		else if(text[i] === "}") {
			depth--;
			if(depth === 0) { return text.slice(start, i + 1); }
		}
	}

	return text.slice(start);
};

// Strip a /** */ block to { description, examples[] }.
const parseDoc = (block) => {
	const body = block
		.replace(/^\/\*\*/, "").replace(/\*\/$/, "")
		.split("\n").map((l) => l.replace(/^\s*\*?\s?/, "")).join("\n").trim();

	const examples = [];
	// pull @example … up to the next @tag or end
	const parts = body.split(/\n@/);
	let description = parts[0].trim();
	// a leading @module tag on the file comment isn't part of the prose
	description = description.replace(/^@module\s+\S+\s*/, "").trim();
	parts.slice(1).forEach((p) => {
		if(p.startsWith("example")) { examples.push(p.replace(/^example\s*/, "").trim()); }
		// @module etc. dropped from prose
	});
	return { description, examples, isModule: /@module\b/.test(body) };
};

const parseFile = (file) => {
	const text = fs.readFileSync(path.join(ROOT, file), "utf8");
	const entries = [];
	const types = [];
	let overview = "";

	const docRe = /\/\*\*[\s\S]*?\*\//g;
	let m;
	while((m = docRe.exec(text))) {
		const doc = parseDoc(m[0]);
		// what follows the doc comment?
		let after = docRe.lastIndex;
		while(after < text.length && /\s/.test(text[after])) { after++; }
		const rest = text.slice(after);

		if(doc.isModule) { overview = doc.description; continue; }

		const decl = rest.match(/^export\s+(function|const|interface|type)\s+([A-Za-z0-9_]+)/);
		if(!decl) { continue; }
		const kind = decl[1];
		const name = decl[2];

		if(kind === "interface" || kind === "type") {
			// Capture the FULL definition so the docs SHOW the shape, not just the
			// name (a named-but-undefined type is how the disclosure bug shipped).
			const src = kind === "interface"
				? captureBraceBlock(text, after)
				: text.slice(after, declEnd(text, after) + 1);
			const def = src.replace(/^export\s+/, "").trim();

			if(!types.find((t) => t.name === name)) {
				types.push({ name, def, description: doc.description });
			}

			continue;
		}

		// function/const: collect the signature (handles overloads — same name in a row)
		let sig = "";
		let scan = after;
		let more = true;
		while(more) {
			const chunk = text.slice(scan);
			const dm = chunk.match(/^export\s+(?:declare\s+)?(?:function|const)\s+([A-Za-z0-9_]+)/);
			if(!dm || dm[1] !== name) { more = false; break; }
			const end = declEnd(text, scan);
			const one = text.slice(scan, end)
				.replace(/^export\s+(declare\s+)?(function|const)\s+/, "")
				.replace(/\s+/g, " ")
				.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\s+,/g, ",")
				.trim();
			sig += (sig ? "\n" : "") + one;
			scan = end + 1;
			while(scan < text.length && /\s/.test(text[scan])) { scan++; }
		}

		if(!entries.find((e) => e.name === name)) {
			entries.push({ name, sig, description: doc.description, examples: doc.examples });
		}
	}

	// Second pass: capture EVERY exported interface/type, including ones with no
	// doc comment (the doc-comment loop above only sees documented ones). Without
	// this an undocumented supporting type is named-but-never-shown — the class of
	// gap that shipped the disclosure() bug.
	const typeRe = /export\s+(interface|type)\s+([A-Za-z0-9_]+)/g;
	let tm;
	while((tm = typeRe.exec(text))) {
		const kind = tm[1];
		const name = tm[2];

		if(types.find((t) => t.name === name)) { continue; }

		const src = kind === "interface"
			? captureBraceBlock(text, tm.index)
			: text.slice(tm.index, declEnd(text, tm.index) + 1);

		types.push({ name, def: src.replace(/^export\s+/, "").trim(), description: "" });
	}

	return { overview, entries, types };
};

// --- emit markdown ---------------------------------------------------------

const slug = (s) => s.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");

let out = "";
out += "# qrp — API reference\n\n";
out += "> **Generated from the TypeScript declarations (`*.d.ts`) — do not edit by hand.**\n";
out += "> Run `npm run docs` to regenerate. The `.d.ts` are the single source of API\n";
out += "> truth (rich types, verified by `npm run typecheck` against a usage suite),\n";
out += "> and `api.html` renders this file live.\n\n";
out += "Every module is an independent ESM file — import only what you use. Types ship\n";
out += "next to each module, so editors resolve them with no build step.\n\n";
out += "> **⚠️ Read [`SHARP-EDGES.md`](./SHARP-EDGES.md) before implementing anything.**\n";
out += "> qrp uses the platform directly, so a handful of behaviors follow from how the\n";
out += "> DOM and `Proxy` actually work (thunk-vs-value, `list()` keys, the runaway\n";
out += "> guard, …). None are bugs; all bite exactly once. Five minutes there saves an\n";
out += "> afternoon of \"why doesn't this update / where did my rows go\".\n\n";

// TOC
MODULES.forEach((mod) => { out += `- [${mod.title}](#${slug(mod.title)})\n`; });
out += "\n---\n";

MODULES.forEach((mod) => {
	const merged = { overview: "", entries: [], types: [] };
	mod.files.forEach((f) => {
		const p = parseFile(f);
		if(p.overview && !merged.overview) { merged.overview = p.overview; }
		merged.entries.push(...p.entries);
		p.types.forEach((t) => { if(!merged.types.find((x) => x.name === t.name)) { merged.types.push(t); } });
	});

	out += `\n## ${mod.title}\n\n`;
	out += "```js\n" + `import { … } from "${mod.imp}"` + "\n```\n\n";
	if(merged.overview) { out += merged.overview + "\n\n"; }

	merged.entries.forEach((e) => {
		out += `### \`${e.name}\`\n\n`;
		out += "```ts\n" + e.sig + "\n```\n\n";
		if(e.description) { out += e.description + "\n\n"; }
		e.examples.forEach((ex) => { out += "```js\n" + ex + "\n```\n\n"; });
	});

	if(merged.types.length) {
		out += "#### Supporting types\n\n";
		merged.types.forEach((t) => {
			out += "```ts\n" + t.def + "\n```\n\n";
			if(t.description) { out += t.description + "\n\n"; }
		});
	}
});

out += "---\n\n## TypeScript\n\n";
out += "Declarations ship as `*.d.ts` next to each module, so importing `./qrp/index.js`\n";
out += "resolves types automatically — no `@types` package, no build step. Generics flow\n";
out += "through (`state<T>`, `list<T>`, `collection<T>`, `table<T>`). `npm run typecheck`\n";
out += "runs `tsc --noEmit` over the declarations and a usage suite in strict mode.\n";

fs.writeFileSync(path.join(ROOT, "docs/API.md"), out);
const n = MODULES.reduce((a, mod) => a + mod.files.reduce((b, f) => b + parseFile(f).entries.length, 0), 0);
console.log(`docs/API.md generated — ${MODULES.length} modules, ${n} exports.`);
