import {
  MATTER_DOCUMENT_FORMATS,
  type MatterDocumentFormatId,
} from "../formats";
import {
  DOCUMENT_PROCESSING_LIMITS,
  VISION_EXTRACTION_INSTRUCTIONS,
} from "./limits";
import { ParserWorkerError, runParserWorker } from "./parser-worker";
import type { ProcessingResult, ProcessorInput } from "./types";
import { extractImage } from "./vision";

export const DOCUMENT_EXTRACTOR_VERSION = "p11-005-stage-2.2";
const byFormat = new Map(
  MATTER_DOCUMENT_FORMATS.map((format) => [format.id, format])
);

export function formatIdForDocument(input: {
  mimeType: string;
  originalFilename: string;
}): MatterDocumentFormatId {
  const extension = input.originalFilename
    .slice(input.originalFilename.lastIndexOf("."))
    .toLowerCase();
  const format = MATTER_DOCUMENT_FORMATS.find(
    (candidate) =>
      candidate.canonicalMimeType === input.mimeType &&
      candidate.extensions.includes(extension)
  );
  if (!format) {
    throw new Error("unsupported_processing_format");
  }
  return format.id;
}

async function transcribeVisionPages(input: {
  base: ProcessingResult;
  pages: Awaited<ReturnType<typeof runParserWorker>>["pendingVisionPages"];
  vision?: ProcessorInput["vision"];
}): Promise<ProcessingResult> {
  if (input.pages.length === 0) {
    return input.base;
  }
  if (!input.vision) {
    return {
      ...input.base,
      status: "needs_review",
      errorCode: "vision_unavailable",
    };
  }
  const units = [...input.base.units];
  let truncated = input.base.truncated;
  let unresolved = false;
  let aggregateText = units.reduce(
    (sum, unit) => sum + unit.extractedText.length,
    0
  );
  for (const page of input.pages) {
    try {
      const text = await input.vision.extract({
        bytes: page.bytes,
        mediaType: page.mediaType,
        pageNumber: page.pageNumber,
        instructions: VISION_EXTRACTION_INSTRUCTIONS,
      });
      const bounded = text.slice(0, DOCUMENT_PROCESSING_LIMITS.pageTextChars);
      if (text.length > bounded.length) {
        truncated = true;
      }
      const normalized = bounded.trim();
      if (!normalized) {
        unresolved = true;
        continue;
      }
      if (
        units.length >= DOCUMENT_PROCESSING_LIMITS.maxUnits ||
        aggregateText + normalized.length >
          DOCUMENT_PROCESSING_LIMITS.totalTextChars
      ) {
        truncated = true;
        break;
      }
      aggregateText += normalized.length;
      units.push({
        locator: { kind: "page", pageNumber: page.pageNumber },
        extractedText: normalized,
        extractionMethod: "vision_fallback",
        provenance: { source: "vision_fallback" },
      });
    } catch {
      unresolved = true;
    }
  }
  units.sort((left, right) => {
    const leftPage =
      left.locator.kind === "page"
        ? left.locator.pageNumber
        : Number.MAX_SAFE_INTEGER;
    const rightPage =
      right.locator.kind === "page"
        ? right.locator.pageNumber
        : Number.MAX_SAFE_INTEGER;
    return leftPage - rightPage;
  });
  const hasNative = units.some((unit) => unit.extractionMethod === "native");
  const hasVision = units.some(
    (unit) => unit.extractionMethod === "vision_fallback"
  );
  return {
    ...input.base,
    status: unresolved
      ? "needs_review"
      : truncated
        ? "partial"
        : input.base.status,
    method:
      hasNative && hasVision
        ? "mixed"
        : hasVision
          ? "vision_fallback"
          : "native",
    units,
    truncated,
    errorCode: unresolved ? "vision_unavailable" : undefined,
  };
}

export async function processMatterDocument(
  input: ProcessorInput
): Promise<ProcessingResult> {
  if (!byFormat.has(input.format)) {
    throw new Error("unsupported_processing_format");
  }
  const startedAt = Date.now();
  if (input.format === "jpeg" || input.format === "png") {
    return extractImage({
      bytes: input.bytes,
      mediaType: input.format === "jpeg" ? "image/jpeg" : "image/png",
      vision: input.vision,
    });
  }
  if (input.format === "pdf") {
    await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  if (input.format === "pdf" && input.vision) {
    await import("@napi-rs/canvas");
  }
  const parsed = await runParserWorker({
    format: input.format,
    bytes: input.bytes,
    renderScannedPages: Boolean(input.vision),
  });
  const result = await transcribeVisionPages({
    base: parsed.result,
    pages: parsed.pendingVisionPages,
    vision: input.vision,
  });
  if (Date.now() - startedAt > DOCUMENT_PROCESSING_LIMITS.runtimeMs) {
    throw new ParserWorkerError("processing_timeout");
  }
  return result;
}
