import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { verifyNativeRuntime } from "../lib/production/native-runtime-verifier.mjs";

const require = createRequire(import.meta.url);
const PDF_MARKER = "NATIVE RUNTIME PDF EXTRACTION";
function makePdf() {
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>",
  ];
  const stream = `BT /F1 12 Tf 20 200 Td (${PDF_MARKER}) Tj ET`;
  bodies.push(
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  );
  let output = "%PDF-1.4\n";
  const offsets = [0];
  bodies.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(output));
}
function parsePdfInWorker() {
  const workerPath = resolve(
    "lib/matter-documents/processing/worker-runtime/parser-worker.mjs"
  );
  return new Promise((resolveEvidence, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {
        format: "pdf",
        bytes: makePdf(),
        limits: { renderScannedPages: false },
      },
      env: {},
      execArgv: [],
    });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("parser_pdf_extraction_timeout"));
    }, 15_000);
    worker.on("message", (message) => {
      if (message?.type === "error") {
        clearTimeout(timeout);
        reject(new Error(message.code ?? "parser_pdf_extraction_failed"));
        return;
      }
      if (message?.type !== "result") {
        return;
      }
      clearTimeout(timeout);
      const texts = message.output?.result?.units?.map(
        (unit) => unit.extractedText
      );
      if (Array.isArray(texts)) {
        resolveEvidence(texts);
      } else {
        reject(new Error("parser_pdf_extraction_failed"));
      }
    });
    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
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
    parsePdf: parsePdfInWorker,
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
