// Build the minified, code-split distribution shipped on npm.
//
// The zero-build promise is for the *consumer* (no bundler on their end) — it
// doesn't stop us from shipping a pre-minified library. esbuild bundles each
// public subpath into dist/ with `splitting` on, so the shared reactivity core
// lands in ONE chunk that every entry imports (importing five modules pulls one
// core, not five). Types stay hand-written next to the source; only the JS is
// built here.
//
// Run: npm run build   (also runs automatically on `npm pack` / `npm publish`)

import esbuild from "esbuild";
import fs from "node:fs";
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

fs.rmSync(OUTDIR, { recursive: true, force: true });

esbuild.build({
	entryPoints: ENTRIES,
	bundle: true,
	splitting: true,
	format: "esm",
	outdir: OUTDIR,
	minify: true,
	target: "es2022",
	legalComments: "none",
	chunkNames: "chunk-[hash]"
}).then(() => {
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
	// honest core figure: what `import "@nemanjan00/qrp"` actually pulls. With
	// splitting the core lives in a shared chunk, so measure a standalone bundle
	// (no splitting) of the core entry rather than the thin re-export stub.
	// GUARD: every public exports subpath must resolve to a file we just built,
	// or npm ships a package whose imports 404 (exactly how 0.4.0's deep
	// utils/* subpaths broke). Fail the build (→ prepack → publish) if not.
	verifyExportsResolve();

	// honest core figure: what `import "@nemanjan00/qrp"` actually pulls. With
	// splitting the core lives in a shared chunk, so measure a standalone bundle
	// (no splitting) of the core entry rather than the thin re-export stub.
	return esbuild.build({
		entryPoints: ["qrp/index.js"],
		bundle: true, format: "esm", minify: true, target: "es2022",
		legalComments: "none", write: false
	}).then((res) => {
		const core = gzip(res.outputFiles[0].contents);
		console.log(`\nbuilt ${files.length} files to ${OUTDIR}/ — core ${kb(core)} min+gzip (standalone), ~${kb(total)} min+gzip for the whole library.`);
	});
}).catch((err) => {
	console.error(err);
	process.exit(1);
});
