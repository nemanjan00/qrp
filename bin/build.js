// Build the minified distribution shipped on npm.
//
// The build is optional for the *consumer* (no bundler required on their end) —
// that doesn't stop us shipping a pre-minified library. We MINIFY EACH MODULE IN
// PLACE: dist/ is a clean, flat mirror of the source — same filenames, no hashes,
// no `chunk-*.js`. Each module keeps its own file and its cross-module imports as
// plain relative ESM (`import … from "./qrp.js"`), so the core is still shared
// (imported once, not inlined into every module) and bundlers still tree-shake —
// while self-hosting is dead simple: copy dist/, the names are the module names.
// (No code-splitting: the opaque shared chunks it produced made vendoring on a
// plain static server confusing.) Types stay hand-written next to the source.
//
// Run: npm run build   (also runs automatically on `npm pack` / `npm publish`)

import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import process from "node:process";

// Single-index modules: dist/<name>.js <- <name>/index.js
const INDEX_MODULES = [
	"qrp", "html", "forms", "table", "collection", "datagrid", "http",
	"events", "toasts", "browser", "proto"
];

// Directories whose EVERY *.js file (a .d.ts sibling excluded) is a public deep
// subpath. Derived from the filesystem so a new util/behavior file can't be
// added to exports without also being built — the drift that shipped 0.4.0's
// dist/utils missing debounce/limit/validate/load-script.
const GLOB_DIRS = ["behaviors", "utils"];

// output-name -> source entry. The name becomes dist/<name>.js and MUST match
// the `exports` map subpaths in package.json.
const ENTRIES = {};

INDEX_MODULES.forEach((name) => { ENTRIES[name] = `${name}/index.js`; });

GLOB_DIRS.forEach((dir) => {
	fs.readdirSync(dir)
		.filter((file) => file.endsWith(".js"))
		.forEach((file) => {
			const base = file.slice(0, -3);   // strip .js
			const name = base === "index" ? dir : `${dir}/${base}`;
			ENTRIES[name] = `${dir}/${file}`;
		});
});

const OUTDIR = "dist";

const kb = (bytes) => (bytes / 1024).toFixed(1) + " KB";
const gzip = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

// Assert every package.json `exports` subpath points at a file that now exists
// in dist/. Globs (./utils/*, ./behaviors/*) are checked per source .js file.
const verifyExportsResolve = () => {
	const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
	const missing = [];

	Object.entries(pkg.exports).forEach(([sub, val]) => {
		if(sub.includes("*")) {
			const dir = sub.replace("./", "").replace("/*", "");

			fs.readdirSync(dir)
				.filter((file) => file.endsWith(".js") && file !== "index.js")
				.forEach((file) => {
					const out = `${OUTDIR}/${dir}/${file}`;

					if(!fs.existsSync(out)) { missing.push(`${sub} → ${out}`); }
				});

			return;
		}

		const target = typeof val === "string" ? val : val.default;

		if(target && target.startsWith("./dist/") && !fs.existsSync(target.slice(2))) {
			missing.push(`${sub} → ${target}`);
		}
	});

	if(missing.length) {
		console.error("BUILD GUARD: exports subpaths with no built file:\n  " + missing.join("\n  "));
		process.exit(1);
	}
};

const ROOT = process.cwd();

// Map a project-relative SOURCE path to its dist output path (relative to dist/):
// a module's index.js flattens to <mod>.js; a leaf (behaviors/x.js, utils/x.js)
// keeps its subpath. dist/ mirrors src, minified.
const srcToDistRel = (rel) => rel.endsWith("/index.js") ? rel.slice(0, -"/index.js".length) + ".js" : rel;

// Keep every cross-module import as an EXTERNAL relative path, rewritten to point
// at the sibling's dist location — so nothing is inlined (core stays shared) and
// dist is a flat mirror. Without this, `bundle: true` would inline dependencies
// into every entry (duplicating core) and `bundle: false` would leave imports
// pointing at ../<mod>/index.js (the source tree, absent from dist/).
const flatExternals = {
	name: "qrp-flat-externals",
	setup(build) {
		build.onResolve({ filter: /^\.\.?\// }, (args) => {
			// entry points are also resolved here — leave them to esbuild (they
			// can't be external), only rewrite in-module import statements.
			if(args.kind === "entry-point") { return undefined; }

			const targetSrc = path.relative(ROOT, path.resolve(path.dirname(args.importer), args.path));
			const importerSrc = path.relative(ROOT, args.importer);
			const targetDist = path.resolve(ROOT, OUTDIR, srcToDistRel(targetSrc));
			const importerDist = path.resolve(ROOT, OUTDIR, srcToDistRel(importerSrc));

			let spec = path.relative(path.dirname(importerDist), targetDist);

			if(!spec.startsWith(".")) { spec = "./" + spec; }

			return { path: spec, external: true };
		});
	}
};

fs.rmSync(OUTDIR, { recursive: true, force: true });

esbuild.build({
	entryPoints: ENTRIES,
	bundle: true,          // needed for onResolve to fire; all cross-imports are external
	splitting: false,      // no shared chunks — each module is its own flat file
	format: "esm",
	outdir: OUTDIR,
	minify: true,
	target: "es2022",
	legalComments: "none",
	plugins: [flatExternals]
}).then(() => {
	// GUARD: every public exports subpath must resolve to a file we just built,
	// or npm ships a package whose imports 404 (exactly how 0.4.0's deep utils/*
	// subpaths broke). Fail the build (→ prepack → publish) if not.
	verifyExportsResolve();

	// report min+gzip per built file — the numbers we publish must be measured
	const files = fs.readdirSync(OUTDIR, { recursive: true })
		.filter((f) => f.endsWith(".js"))
		.sort();
	let total = 0;
	files.forEach((f) => {
		const buf = fs.readFileSync(`${OUTDIR}/${f}`);
		const g = gzip(buf);
		total += g;
		const tag = f === "qrp.js" ? "  <- core" : "";
		console.log(`  ${f.padEnd(28)} ${kb(buf.length).padStart(9)}  |  ${kb(g).padStart(9)} gz${tag}`);
	});
	// Core is now a standalone file (it has no imports), so dist/qrp.js IS the
	// honest `import "@nemanjan00/qrp"` cost — no separate measuring build needed.
	const core = gzip(fs.readFileSync(`${OUTDIR}/qrp.js`));
	console.log(`\nbuilt ${files.length} files to ${OUTDIR}/ — core ${kb(core)} min+gzip, ~${kb(total)} min+gzip for the whole library.`);
}).catch((err) => {
	console.error(err);
	process.exit(1);
});
