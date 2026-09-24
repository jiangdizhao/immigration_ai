import { parentPort, threadId, workerData } from "node:worker_threads";
import type { MatterDocumentFormatId } from "../formats";
import type { DOCUMENT_PROCESSING_LIMITS } from "./limits";
import { extractDoc, extractDocx, extractSpreadsheet } from "./office";
import { extractPdfForWorker } from "./pdf";
import { pdfJsPageRenderer } from "./pdf-renderer";
import { extractCsv, extractJson, extractTextDocument } from "./text";
import type { ProcessingResult } from "./types";

const SAFE_ERRORS = new Set([
  "unsupported_processing_format",
  "malformed_document",
  "processing_limit_exceeded",
]);
type WorkerInput = {
  format: MatterDocumentFormatId;
  bytes: Uint8Array;
  limits: typeof DOCUMENT_PROCESSING_LIMITS & { renderScannedPages: boolean };
};

async function parse(input: WorkerInput): Promise<{
  result: ProcessingResult;
  pendingVisionPages: Awaited<
    ReturnType<typeof extractPdfForWorker>
  >["pendingVisionPages"];
}> {
  switch (input.format) {
    case "pdf":
      return extractPdfForWorker({
        bytes: input.bytes,
        renderer: input.limits.renderScannedPages
          ? pdfJsPageRenderer
          : undefined,
      });
    case "docx":
      return { result: await extractDocx(input.bytes), pendingVisionPages: [] };
    case "doc":
      return { result: await extractDoc(input.bytes), pendingVisionPages: [] };
    case "xlsx":
    case "xls":
      return {
        result: await extractSpreadsheet(input.bytes, input.format),
        pendingVisionPages: [],
      };
    case "csv":
      return { result: extractCsv(input.bytes), pendingVisionPages: [] };
    case "json":
      return { result: extractJson(input.bytes), pendingVisionPages: [] };
    case "txt":
    case "markdown":
      return {
        result: extractTextDocument(input.bytes),
        pendingVisionPages: [],
      };
    default:
      throw new Error("unsupported_processing_format");
  }
}

async function run() {
  if (!parentPort) {
    return;
  }
  try {
    const input = workerData as WorkerInput;
    if (
      !input ||
      !(input.bytes instanceof Uint8Array) ||
      input.bytes.byteLength > 25 * 1024 * 1024 ||
      !input.limits ||
      typeof input.limits.renderScannedPages !== "boolean"
    ) {
      throw new Error("processing_limit_exceeded");
    }
    const output = await parse(input);
    parentPort.postMessage({ type: "result", threadId, output });
  } catch (error) {
    const code =
      error instanceof Error && SAFE_ERRORS.has(error.message)
        ? error.message
        : "parser_worker_failed";
    parentPort.postMessage({ type: "error", code });
  }
}

run().then(undefined, () => undefined);
