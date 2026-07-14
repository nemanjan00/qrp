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

// output-name -> source entry. The name becomes dist/<name>.js and must match
// the `exports` map / import-map subpaths in package.json.
const ENTRIES = {
	"qrp": "qrp/index.js",
	"html": "html/index.js",
	"forms": "forms/index.js",
	"table": "table/index.js",
	"collection": "collection/index.js",
	"http": "http/index.js",
	"events": "events/index.js",
	"toasts": "toasts/index.js",
	"browser": "browser/index.js",
	"proto": "proto/index.js",
	"behaviors": "behaviors/index.js",
	"behaviors/portal": "behaviors/portal.js",
	"behaviors/dismissable": "behaviors/dismissable.js",
	"behaviors/trap-focus": "behaviors/trap-focus.js",
	"behaviors/anchored": "behaviors/anchored.js",
	"behaviors/disclosure": "behaviors/disclosure.js",
	"behaviors/busy-while": "behaviors/busy-while.js",
	"utils": "utils/index.js",
	"utils/memoize": "utils/memoize.js",
	"utils/lru": "utils/lru.js",
	"utils/cache": "utils/cache.js",
	"utils/paginate": "utils/paginate.js"
};

const OUTDIR = "dist";

const kb = (bytes) => (bytes / 1024).toFixed(1) + " KB";
const gzip = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

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
