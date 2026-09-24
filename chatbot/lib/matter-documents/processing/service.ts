import { createHash, randomUUID } from "node:crypto";
import type { MatterDocument } from "@/lib/db/schema";
import type { MatterDocumentStorage } from "../types";
import { ProcessingLimitError } from "./limits";
import {
  DOCUMENT_EXTRACTOR_VERSION,
  formatIdForDocument,
  processMatterDocument,
} from "./registry";
import type { DocumentVisionExtractor, PdfPageRenderer } from "./types";

export class ProcessingNotFoundError extends Error {
  constructor() {
    super("Document not found.");
    this.name = "ProcessingNotFoundError";
  }
}
export class ProcessingConflictError extends Error {
  constructor() {
    super("Document processing state conflict.");
    this.name = "ProcessingConflictError";
  }
}
export class ProcessingIntegrityError extends Error {
  constructor() {
    super("Document integrity check failed.");
    this.name = "ProcessingIntegrityError";
  }
}

export type FinalizeProcessingInput = {
  runId: string;
  documentId: string;
  completedAt: Date;
  status: "complete" | "partial" | "needs_review";
  extractionMethod: "native" | "vision_fallback" | "mixed";
  units: Array<{
    ordinal: number;
    sourceClass: "customer_document";
    locator: Record<string, string | number>;
    provenance: Record<string, string | number | boolean | null>;
    extractionMethod: "native" | "vision_fallback";
    extractedText: string;
  }>;
  totalTextChars: number;
  truncated: boolean;
  errorCode: string | null;
};
export type ProcessingRepository = {
  getForOwner(input: {
    documentId: string;
    userId: string;
  }): Promise<MatterDocument | null>;
  latest(input: {
    documentId: string;
    userId: string;
  }): Promise<{ id: string; status: string } | null>;
  begin(input: {
    documentId: string;
    userId: string;
    runId: string;
    extractorVersion: string;
    retryFailed: boolean;
    startedAt: Date;
  }): Promise<{ record: MatterDocument; run: { id: string } } | null>;
  finalize(input: FinalizeProcessingInput): Promise<unknown>;
  fail(input: {
    runId: string;
    documentId: string;
    failedAt: Date;
    errorCode: string;
  }): Promise<void>;
  getEvidence(input: {
    documentId: string;
    userId: string;
    runId?: string;
  }): Promise<unknown | null>;
};

const SAFE_ERROR_CODES = new Set([
  "unsupported_processing_format",
  "malformed_document",
  "processing_limit_exceeded",
  "native_extraction_failed",
  "vision_required",
  "vision_unavailable",
  "integrity_mismatch",
  "processing_timeout",
  "parser_worker_failed",
  "vision_timeout",
]);
function safeErrorCode(error: unknown): string {
  if (error instanceof ProcessingLimitError) {
    return "processing_limit_exceeded";
  }
  if (error instanceof Error && SAFE_ERROR_CODES.has(error.message)) {
    return error.message;
  }
  return "native_extraction_failed";
}

export function createMatterDocumentProcessingService(deps: {
  repository: ProcessingRepository;
  storage: MatterDocumentStorage;
  vision?: DocumentVisionExtractor;
  pdfRenderer?: PdfPageRenderer;
  processor?: typeof processMatterDocument;
  now?: () => Date;
  createId?: () => string;
}) {
  const now = deps.now ?? (() => new Date());
  const createId = deps.createId ?? randomUUID;
  return {
    async process(input: {
      documentId: string;
      userId: string;
      retryFailed?: boolean;
    }) {
      const existing = await deps.repository.getForOwner(input);
      if (existing?.storageStatus !== "stored" || existing.deletedAt !== null) {
        throw new ProcessingNotFoundError();
      }
      if (existing.processingStatus === "complete") {
        const prior = await deps.repository.latest(input);
        if (prior) {
          return { runId: prior.id, status: prior.status, idempotent: true };
        }
        throw new ProcessingConflictError();
      }
      if (existing.processingStatus === "processing") {
        throw new ProcessingConflictError();
      }
      const retryFailed = input.retryFailed === true;
      if (existing.processingStatus === "failed" && !retryFailed) {
        throw new ProcessingConflictError();
      }
      if (existing.processingStatus === "not_started" && retryFailed) {
        throw new ProcessingConflictError();
      }

      const startedAt = now();
      const runId = createId();
      const claimed = await deps.repository.begin({
        documentId: input.documentId,
        userId: input.userId,
        runId,
        extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
        retryFailed,
        startedAt,
      });
      if (!claimed) {
        throw new ProcessingConflictError();
      }
      try {
        const bytes = await deps.storage.get({
          key: claimed.record.storageKey,
        });
        if (
          bytes.byteLength !== claimed.record.byteSize ||
          createHash("sha256").update(bytes).digest("hex") !==
            claimed.record.sha256
        ) {
          throw new ProcessingIntegrityError();
        }
        if (Date.now() - startedAt.getTime() > 30_000) {
          throw new ProcessingLimitError();
        }
        const format = formatIdForDocument(claimed.record);
        const extracted = await (deps.processor ?? processMatterDocument)({
          format,
          bytes,
          documentId: claimed.record.id,
          vision: deps.vision,
          pdfRenderer: deps.pdfRenderer,
        });
        const completedAt = now();
        const units = extracted.units.map((unit, index) => ({
          ...unit,
          ordinal: index + 1,
          sourceClass: "customer_document" as const,
        }));
        await deps.repository.finalize({
          runId,
          documentId: claimed.record.id,
          completedAt,
          status: extracted.status,
          extractionMethod: extracted.method,
          units,
          totalTextChars: units.reduce(
            (total, unit) => total + unit.extractedText.length,
            0
          ),
          truncated: extracted.truncated,
          errorCode: extracted.errorCode ?? null,
        });
        return { runId, status: extracted.status, idempotent: false };
      } catch (error) {
        const code =
          error instanceof ProcessingIntegrityError
            ? "integrity_mismatch"
            : safeErrorCode(error);
        await deps.repository
          .fail({
            runId,
            documentId: claimed.record.id,
            failedAt: now(),
            errorCode: code,
          })
          .catch(() => undefined);
        if (error instanceof ProcessingIntegrityError) {
          throw error;
        }
        throw new ProcessingConflictError();
      }
    },
    getEvidence(input: { documentId: string; userId: string; runId?: string }) {
      return deps.repository.getEvidence(input);
    },
  };
}

export type MatterDocumentProcessingService = ReturnType<
  typeof createMatterDocumentProcessingService
>;
