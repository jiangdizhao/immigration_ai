import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const outfile = resolve(
  "lib/matter-documents/processing/worker-runtime/parser-worker.mjs"
);
await mkdir(dirname(outfile), { recursive: true });
const require = createRequire(import.meta.url);
const pdfJsEntry = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
await cp(
  resolve(dirname(pdfJsEntry), "../../standard_fonts"),
  resolve(dirname(outfile), "standard_fonts"),
  { recursive: true, force: true }
);
await build({
  entryPoints: ["lib/matter-documents/processing/parser-worker-entry.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "bundle",
  sourcemap: false,
  external: ["@napi-rs/canvas", "pdfjs-dist"],
  banner: {
    js: 'import { createRequire as makeWorkerRequire } from "node:module"; const require = makeWorkerRequire(import.meta.url);',
  },
});
