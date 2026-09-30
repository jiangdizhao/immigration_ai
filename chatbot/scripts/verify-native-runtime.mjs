import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyNativeRuntime } from "../lib/production/native-runtime-verifier.mjs";

const require = createRequire(import.meta.url);
function canvasVersion() {
  let directory = dirname(require.resolve("@napi-rs/canvas"));
  for (let depth = 0; depth < 6; depth += 1) {
    try {
      return JSON.parse(
        readFileSync(resolve(directory, "package.json"), "utf8")
      ).version;
    } catch {
      directory = dirname(directory);
    }
  }
  throw new Error("canvas_package_version_missing");
}

try {
  const result = await verifyNativeRuntime({
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    async loadCanvas() {
      return {
        ...(await import("@napi-rs/canvas")),
        version: canvasVersion(),
      };
    },
    async loadParserRuntime() {
      const workerPath = resolve(
        "lib/matter-documents/processing/worker-runtime/parser-worker.mjs"
      );
      await import(pathToFileURL(workerPath).href);
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      return {
        parserWorkerLoaded: true,
        getDocument: pdfjs.getDocument,
        pdfJsVersion: pdfjs.version,
      };
    },
  });
  console.log(JSON.stringify({ ...result, status: "PASS" }));
} catch {
  console.error(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      status: "FAIL",
    })
  );
  process.exitCode = 1;
}
