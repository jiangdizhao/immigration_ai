import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  DOCUMENT_PROCESSING_LIMITS,
  ProcessingLimitError,
  VISION_EXTRACTION_INSTRUCTIONS,
} from "./limits";
import { pdfJsSafeOptions } from "./pdfjs-options";
import { createUnitCollector, finishCollected } from "./text";
import type {
  DocumentVisionExtractor,
  PdfPageRenderer,
  ProcessingResult,
} from "./types";

export type PendingVisionPage = {
  pageNumber: number;
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png";
  pixelCount: number;
};
export type PdfParserOutput = {
  result: ProcessingResult;
  pendingVisionPages: PendingVisionPage[];
};

async function extractPdfInternal(input: {
  bytes: Uint8Array;
  vision?: DocumentVisionExtractor;
  renderer?: PdfPageRenderer;
  deferVision?: boolean;
}): Promise<PdfParserOutput> {
  let task: ReturnType<typeof getDocument> | undefined;
  const collector = createUnitCollector();
  const pendingVisionPages: PendingVisionPage[] = [];
  let unresolvedScannedPage = false;
  let usedVision = false;
  let aggregateRasterBytes = 0;
  try {
    task = getDocument({
      data: new Uint8Array(input.bytes),
      ...pdfJsSafeOptions,
    } as Parameters<typeof getDocument>[0]);
    const pdf = await task.promise;
    if (
      pdf.numPages < 1 ||
      pdf.numPages > DOCUMENT_PROCESSING_LIMITS.pdfPages
    ) {
      throw new ProcessingLimitError();
    }
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({
        includeMarkedContent: false,
      });
      const nativeText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (nativeText) {
        if (nativeText.length > DOCUMENT_PROCESSING_LIMITS.pageTextChars) {
          throw new ProcessingLimitError();
        }
        collector.add({ kind: "page", pageNumber }, nativeText);
      } else if (input.renderer) {
        const rendered = await input.renderer.renderPage({
          pdfBytes: input.bytes,
          pageNumber,
        });
        if (
          rendered.pixelCount < 1 ||
          rendered.pixelCount > DOCUMENT_PROCESSING_LIMITS.imagePixels ||
          rendered.bytes.byteLength > 10 * 1024 * 1024
        ) {
          throw new ProcessingLimitError();
        }
        aggregateRasterBytes += rendered.bytes.byteLength;
        if (
          aggregateRasterBytes >
          DOCUMENT_PROCESSING_LIMITS.renderedPageMaxAggregateBytes
        ) {
          unresolvedScannedPage = true;
        } else if (input.deferVision) {
          pendingVisionPages.push({ pageNumber, ...rendered });
          usedVision = true;
        } else if (input.vision) {
          try {
            const transcription = await input.vision.extract({
              bytes: rendered.bytes,
              mediaType: rendered.mediaType,
              pageNumber,
              instructions: VISION_EXTRACTION_INSTRUCTIONS,
            });
            if (
              transcription.length > DOCUMENT_PROCESSING_LIMITS.pageTextChars
            ) {
              throw new ProcessingLimitError();
            }
            if (transcription.trim()) {
              collector.add(
                { kind: "page", pageNumber },
                transcription.trim(),
                { source: "vision_fallback" },
                "vision_fallback"
              );
            } else {
              unresolvedScannedPage = true;
            }
            usedVision = true;
          } catch (error) {
            if (error instanceof ProcessingLimitError) {
              throw error;
            }
            unresolvedScannedPage = true;
          }
        } else {
          unresolvedScannedPage = true;
        }
      } else {
        unresolvedScannedPage = true;
      }
      page.cleanup();
    }
    const result = finishCollected(collector, unresolvedScannedPage);
    return {
      pendingVisionPages,
      result: {
        ...result,
        status: unresolvedScannedPage ? "needs_review" : result.status,
        method:
          usedVision &&
          result.units.some((unit) => unit.extractionMethod === "native")
            ? "mixed"
            : usedVision
              ? "vision_fallback"
              : "native",
        errorCode: unresolvedScannedPage
          ? input.vision || input.deferVision
            ? "vision_required"
            : "vision_unavailable"
          : undefined,
      },
    };
  } catch (error) {
    if (error instanceof ProcessingLimitError) {
      throw error;
    }
    throw new Error("malformed_document");
  } finally {
    await task?.destroy().catch(() => undefined);
  }
}

export async function extractPdf(input: {
  bytes: Uint8Array;
  vision?: DocumentVisionExtractor;
  renderer?: PdfPageRenderer;
}): Promise<ProcessingResult> {
  return (await extractPdfInternal(input)).result;
}

export function extractPdfForWorker(input: {
  bytes: Uint8Array;
  renderer?: PdfPageRenderer;
}): Promise<PdfParserOutput> {
  return extractPdfInternal({ ...input, deferVision: true });
}
