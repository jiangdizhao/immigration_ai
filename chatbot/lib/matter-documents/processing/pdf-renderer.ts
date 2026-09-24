import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DOCUMENT_PROCESSING_LIMITS, ProcessingLimitError } from "./limits";
import { pdfJsSafeOptions } from "./pdfjs-options";
import type { PdfPageRenderer } from "./types";

export const pdfJsPageRenderer: PdfPageRenderer = {
  async renderPage({ pdfBytes, pageNumber }) {
    let task: ReturnType<typeof getDocument> | undefined;
    try {
      task = getDocument({
        data: new Uint8Array(pdfBytes),
        ...pdfJsSafeOptions,
      } as Parameters<typeof getDocument>[0]);
      const document = await task.promise;
      if (
        pageNumber < 1 ||
        pageNumber > document.numPages ||
        document.numPages > DOCUMENT_PROCESSING_LIMITS.pdfPages
      ) {
        throw new ProcessingLimitError();
      }
      const page = await document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        2,
        DOCUMENT_PROCESSING_LIMITS.renderedPageMaxDimension / base.width,
        DOCUMENT_PROCESSING_LIMITS.renderedPageMaxDimension / base.height,
        Math.sqrt(
          DOCUMENT_PROCESSING_LIMITS.imagePixels / (base.width * base.height)
        )
      );
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const pixelCount = width * height;
      if (
        pixelCount > DOCUMENT_PROCESSING_LIMITS.imagePixels ||
        width > DOCUMENT_PROCESSING_LIMITS.renderedPageMaxDimension ||
        height > DOCUMENT_PROCESSING_LIMITS.renderedPageMaxDimension
      ) {
        throw new ProcessingLimitError();
      }
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      await page.render({
        canvas: null,
        canvasContext: context as never,
        viewport,
        intent: "display",
        annotationMode: 0,
      }).promise;
      page.cleanup();
      const bytes = canvas.toBuffer("image/jpeg", 82);
      if (bytes.byteLength > 10 * 1024 * 1024) {
        throw new ProcessingLimitError();
      }
      canvas.width = 0;
      canvas.height = 0;
      return {
        bytes: new Uint8Array(bytes),
        mediaType: "image/jpeg",
        pixelCount,
      };
    } catch (error) {
      if (error instanceof ProcessingLimitError) {
        throw error;
      }
      throw new Error("malformed_document");
    } finally {
      await task?.destroy().catch(() => undefined);
    }
  },
};
