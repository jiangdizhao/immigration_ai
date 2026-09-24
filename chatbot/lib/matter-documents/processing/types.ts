import type { MatterDocumentFormatId } from "../formats";

export type ExtractionMethod = "native" | "vision_fallback";
export type ProcessingStatus = "complete" | "partial" | "needs_review";
export type ProcessingErrorCode =
  | "unsupported_processing_format"
  | "malformed_document"
  | "processing_limit_exceeded"
  | "native_extraction_failed"
  | "vision_required"
  | "vision_unavailable"
  | "integrity_mismatch"
  | "processing_timeout"
  | "parser_worker_failed";

export type SourceLocator =
  | { kind: "page"; pageNumber: number }
  | { kind: "image"; imageNumber: 1 }
  | { kind: "document_block"; paragraphStart: number; paragraphEnd: number }
  | { kind: "sheet_rows"; sheetName: string; rowStart: number; rowEnd: number }
  | { kind: "rows"; rowStart: number; rowEnd: number }
  | { kind: "lines"; lineStart: number; lineEnd: number }
  | { kind: "json_path"; path: string };

export type NormalizedDocumentEvidence = {
  ordinal: number;
  documentId: string;
  sourceClass: "customer_document";
  locator: SourceLocator;
  extractedText: string;
  extractionMethod: ExtractionMethod;
  provenance: Record<string, string | number | boolean | null>;
};

export type ProcessingResult = {
  status: ProcessingStatus;
  method: ExtractionMethod | "mixed";
  units: Omit<
    NormalizedDocumentEvidence,
    "ordinal" | "documentId" | "sourceClass"
  >[];
  truncated: boolean;
  errorCode?: ProcessingErrorCode;
};

export type DocumentVisionExtractor = {
  extract(input: {
    bytes: Uint8Array;
    mediaType: "image/jpeg" | "image/png";
    pageNumber?: number;
    instructions: string;
    signal?: AbortSignal;
  }): Promise<string>;
};

export type PdfPageRenderer = {
  renderPage(input: { pdfBytes: Uint8Array; pageNumber: number }): Promise<{
    bytes: Uint8Array;
    mediaType: "image/jpeg" | "image/png";
    pixelCount: number;
  }>;
};

export type ProcessorInput = {
  format: MatterDocumentFormatId;
  bytes: Uint8Array;
  documentId: string;
  vision?: DocumentVisionExtractor;
  pdfRenderer?: PdfPageRenderer;
  deadlineAt?: number;
  signal?: AbortSignal;
};
