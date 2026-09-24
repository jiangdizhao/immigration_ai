import { createRequire } from "node:module";
import { join } from "node:path";
import type { Worker as NodeWorker } from "node:worker_threads";
import type { MatterDocumentFormatId } from "../formats";
import { DOCUMENT_PROCESSING_LIMITS } from "./limits";
import type { PdfParserOutput } from "./pdf";
import type { ProcessingResult } from "./types";

export class ParserWorkerError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export type NativeParserOutput = PdfParserOutput;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateOutput(value: unknown): NativeParserOutput {
  if (!isRecord(value) || !isRecord(value.result)) {
    throw new ParserWorkerError("parser_worker_failed");
  }
  const result = value.result as unknown as ProcessingResult;
  if (
    !["complete", "partial", "needs_review"].includes(result.status) ||
    !["native", "vision_fallback", "mixed"].includes(result.method) ||
    !Array.isArray(result.units) ||
    result.units.length > DOCUMENT_PROCESSING_LIMITS.maxUnits ||
    typeof result.truncated !== "boolean" ||
    !Array.isArray(value.pendingVisionPages) ||
    value.pendingVisionPages.length > DOCUMENT_PROCESSING_LIMITS.pdfPages
  ) {
    throw new ParserWorkerError("parser_worker_failed");
  }
  const safeErrorCodes = new Set([
    "unsupported_processing_format",
    "malformed_document",
    "processing_limit_exceeded",
    "native_extraction_failed",
    "vision_required",
    "vision_unavailable",
  ]);
  if (result.errorCode !== undefined && !safeErrorCodes.has(result.errorCode)) {
    throw new ParserWorkerError("parser_worker_failed");
  }
  let totalTextChars = 0;
  const units = result.units.map((unit) => {
    if (
      !isRecord(unit) ||
      typeof unit.extractedText !== "string" ||
      unit.extractedText.length > DOCUMENT_PROCESSING_LIMITS.unitTextChars ||
      !isRecord(unit.locator) ||
      !isRecord(unit.provenance) ||
      !["native", "vision_fallback"].includes(unit.extractionMethod)
    ) {
      throw new ParserWorkerError("parser_worker_failed");
    }
    totalTextChars += unit.extractedText.length;
    if (
      totalTextChars > DOCUMENT_PROCESSING_LIMITS.totalTextChars ||
      Object.values(unit.provenance).some(
        (item) =>
          item !== null &&
          typeof item !== "string" &&
          typeof item !== "number" &&
          typeof item !== "boolean"
      )
    ) {
      throw new ParserWorkerError("parser_worker_failed");
    }
    return {
      locator: unit.locator,
      extractedText: unit.extractedText,
      extractionMethod: unit.extractionMethod,
      provenance: unit.provenance,
    };
  });
  let totalRasterBytes = 0;
  const pendingVisionPages = value.pendingVisionPages.map((page) => {
    if (
      !isRecord(page) ||
      !Number.isInteger(page.pageNumber) ||
      (page.pageNumber as number) < 1 ||
      (page.pageNumber as number) > DOCUMENT_PROCESSING_LIMITS.pdfPages ||
      !(page.bytes instanceof Uint8Array) ||
      page.bytes.byteLength > 10 * 1024 * 1024 ||
      !["image/jpeg", "image/png"].includes(String(page.mediaType)) ||
      typeof page.pixelCount !== "number" ||
      page.pixelCount < 1 ||
      page.pixelCount > DOCUMENT_PROCESSING_LIMITS.imagePixels
    ) {
      throw new ParserWorkerError("parser_worker_failed");
    }
    totalRasterBytes += page.bytes.byteLength;
    if (
      totalRasterBytes >
      DOCUMENT_PROCESSING_LIMITS.renderedPageMaxAggregateBytes
    ) {
      throw new ParserWorkerError("parser_worker_failed");
    }
    return {
      pageNumber: page.pageNumber as number,
      bytes: page.bytes,
      mediaType: page.mediaType as "image/jpeg" | "image/png",
      pixelCount: page.pixelCount,
    };
  });
  return {
    result: {
      status: result.status,
      method: result.method,
      units,
      truncated: result.truncated,
      errorCode: result.errorCode,
    },
    pendingVisionPages,
  } as NativeParserOutput;
}

export function runParserWorker(input: {
  format: MatterDocumentFormatId;
  bytes: Uint8Array;
  renderScannedPages: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  workerPath?: string;
}): Promise<NativeParserOutput> {
  if (input.signal?.aborted) {
    return Promise.reject(new ParserWorkerError("processing_timeout"));
  }
  const workerPath =
    input.workerPath ??
    join(
      process.cwd(),
      "lib/matter-documents/processing/worker-runtime/parser-worker.mjs"
    );
  const threadWorker = createRequire(import.meta.url)("node:worker_threads")
    .Worker as typeof import("node:worker_threads").Worker;
  const worker = Reflect.construct(threadWorker, [
    workerPath,
    {
      workerData: {
        format: input.format,
        bytes: new Uint8Array(input.bytes),
        limits: {
          ...DOCUMENT_PROCESSING_LIMITS,
          renderScannedPages: input.renderScannedPages,
        },
      },
      env: {},
      execArgv: [],
      resourceLimits: {
        maxOldGenerationSizeMb: DOCUMENT_PROCESSING_LIMITS.parserWorkerMemoryMb,
        maxYoungGenerationSizeMb:
          DOCUMENT_PROCESSING_LIMITS.parserWorkerYoungGenerationMb,
        stackSizeMb: DOCUMENT_PROCESSING_LIMITS.parserWorkerStackMb,
      },
    },
  ]) as NodeWorker;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout>;
    let onAbort = () => undefined;
    const finish = (error?: Error, output?: NativeParserOutput) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      if (error) {
        reject(error);
      } else if (output) {
        resolve(output);
      } else {
        reject(new ParserWorkerError("parser_worker_failed"));
      }
    };
    onAbort = () => {
      timedOut = true;
      worker.terminate().then(
        () => finish(new ParserWorkerError("processing_timeout")),
        () => finish(new ParserWorkerError("processing_timeout"))
      );
    };
    timer = setTimeout(() => {
      onAbort();
    }, input.timeoutMs ?? DOCUMENT_PROCESSING_LIMITS.parserWorkerTimeoutMs);
    timer.unref?.();
    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (input.signal?.aborted) {
      onAbort();
    }
    worker.once("message", (message: unknown) => {
      if (!isRecord(message)) {
        worker.terminate().then(
          () => finish(new ParserWorkerError("parser_worker_failed")),
          () => finish(new ParserWorkerError("parser_worker_failed"))
        );
        return;
      }
      if (
        message.type === "error" &&
        typeof message.code === "string" &&
        [
          "unsupported_processing_format",
          "malformed_document",
          "processing_limit_exceeded",
        ].includes(message.code)
      ) {
        finish(new ParserWorkerError(message.code));
        return;
      }
      if (
        message.type !== "result" ||
        !Number.isInteger(message.threadId) ||
        message.threadId === 0
      ) {
        worker.terminate().then(
          () => finish(new ParserWorkerError("parser_worker_failed")),
          () => finish(new ParserWorkerError("parser_worker_failed"))
        );
        return;
      }
      try {
        const output = validateOutput(message.output);
        finish(undefined, output);
      } catch {
        worker.terminate().then(
          () => finish(new ParserWorkerError("parser_worker_failed")),
          () => finish(new ParserWorkerError("parser_worker_failed"))
        );
      }
    });
    worker.once("error", () => {
      if (!timedOut) {
        finish(new ParserWorkerError("parser_worker_failed"));
      }
    });
    worker.once("exit", (code) => {
      if (!timedOut && (code !== 0 || !settled)) {
        finish(new ParserWorkerError("parser_worker_failed"));
      }
    });
  });
}
