import { persistedCustomerDocumentManifestForReload } from "@/lib/matter-documents/customer-document-provenance";

/**
 * Shared message-part contracts for durable conversation history.
 *
 * Assistant answers are stored as a text part plus a bounded metadata part so
 * citations, evidence references, document manifests, research status and
 * Matter links survive a reload on any device. These helpers are the single
 * source of truth for reading and writing that shape.
 */

import {
  type CustomerDocumentUsageState,
  customerDocumentUsageState,
} from "@/lib/matter-documents/customer-document-provenance";

export type StoredTextPart = { type: "text"; text: string };
export type StoredMetadataPart = {
  type: "metadata";
  compactSources: string[];
  citations: unknown[];
  customerDocumentEvidenceUsed: boolean;
  customerDocumentUsage?: unknown;
  customerDocumentManifest?: unknown;
  /** R2: bounded acknowledged document ids (this request's authorized subset). */
  customerDocumentUsedIds?: unknown;
  confidence: string | null;
  researchStatus: "not_required" | "complete" | "incomplete" | null;
  followUpQuestions: string[];
  matterId: string | null;
  retrievalDebug: unknown;
};

export type StoredAssistantMetadata = {
  compactSources: string[];
  citations: unknown[];
  customerDocumentEvidenceUsed: boolean;
  /** R1: verified use vs supplied-but-unconfirmed, preserved across reload. */
  customerDocumentUsage: CustomerDocumentUsageState;
  customerDocumentSources: BoundedCustomerDocumentSource[];
  confidence: string | null;
  researchStatus: "not_required" | "complete" | "incomplete" | null;
  followUpQuestions: string[];
  matterId: string | null;
  retrievalDebug: unknown;
};

export type BoundedCustomerDocumentSource = {
  documentId: string;
  runId: string;
  originalFilename: string;
  runStatus: "complete" | "partial" | "needs_review";
  extractionMethod: string;
  truncated: boolean;
  locators: Record<string, string | number>[];
};

export const MAX_PERSISTED_LOCATORS = 8;
export const MAX_PERSISTED_MANIFEST_SOURCES = 4;

export function buildAssistantMessageParts(input: {
  text: string;
  metadata: Record<string, unknown>;
}): unknown[] {
  return [
    { type: "text", text: input.text },
    { type: "metadata", ...input.metadata },
  ];
}

export function isMetadataPart(part: unknown): part is Record<string, unknown> {
  return (
    typeof part === "object" &&
    part !== null &&
    !Array.isArray(part) &&
    (part as { type?: unknown }).type === "metadata"
  );
}

export function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        (part as { type?: unknown }).type === "text" &&
        "text" in part
      ) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function stableStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function sanitizeCustomerDocumentSources(
  value: unknown
): BoundedCustomerDocumentSource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, MAX_PERSISTED_MANIFEST_SOURCES)
    .flatMap((item): BoundedCustomerDocumentSource[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }
      const source = item as Record<string, unknown>;
      if (
        typeof source.documentId !== "string" ||
        typeof source.runId !== "string" ||
        typeof source.originalFilename !== "string"
      ) {
        return [];
      }
      const locators = Array.isArray(source.locators)
        ? source.locators
            .slice(0, MAX_PERSISTED_LOCATORS)
            .flatMap((locator): Record<string, string | number>[] => {
              if (
                !locator ||
                typeof locator !== "object" ||
                Array.isArray(locator)
              ) {
                return [];
              }
              return [
                Object.fromEntries(
                  Object.entries(locator as Record<string, unknown>)
                    .filter(
                      ([key, entry]) =>
                        key.length <= 64 &&
                        ((typeof entry === "string" && entry.length <= 256) ||
                          (typeof entry === "number" && Number.isFinite(entry)))
                    )
                    .slice(0, 16)
                ) as Record<string, string | number>,
              ];
            })
        : [];
      return [
        {
          documentId: source.documentId,
          runId: source.runId,
          originalFilename: source.originalFilename.slice(0, 255),
          runStatus:
            source.runStatus === "partial" ||
            source.runStatus === "needs_review"
              ? source.runStatus
              : "complete",
          extractionMethod:
            typeof source.extractionMethod === "string"
              ? source.extractionMethod.slice(0, 32)
              : "native",
          truncated: source.truncated === true,
          locators,
        },
      ];
    });
}

export function extractAssistantMetadata(
  parts: unknown
): StoredAssistantMetadata {
  const metadata = Array.isArray(parts) ? parts.find(isMetadataPart) : null;
  if (!metadata) {
    return {
      compactSources: [],
      citations: [],
      customerDocumentEvidenceUsed: false,
      customerDocumentUsage: "not_supplied",
      customerDocumentSources: [],
      confidence: null,
      researchStatus: null,
      followUpQuestions: [],
      matterId: null,
      retrievalDebug: null,
    };
  }
  return {
    compactSources: stableStringArray(metadata.compactSources),
    citations: Array.isArray(metadata.citations) ? metadata.citations : [],
    customerDocumentEvidenceUsed:
      metadata.customerDocumentEvidenceUsed === true,
    customerDocumentUsage: customerDocumentUsageState(
      metadata.customerDocumentUsage,
      metadata.customerDocumentEvidenceUsed
    ),
    customerDocumentSources: sanitizeCustomerDocumentSources(
      persistedCustomerDocumentManifestForReload(
        metadata.customerDocumentManifest,
        metadata.customerDocumentEvidenceUsed,
        metadata.customerDocumentUsedIds
      )
    ),
    confidence:
      typeof metadata.confidence === "string" ? metadata.confidence : null,
    researchStatus:
      metadata.researchStatus === "not_required" ||
      metadata.researchStatus === "complete" ||
      metadata.researchStatus === "incomplete"
        ? metadata.researchStatus
        : null,
    followUpQuestions: stableStringArray(metadata.followUpQuestions),
    matterId: typeof metadata.matterId === "string" ? metadata.matterId : null,
    retrievalDebug:
      metadata.retrievalDebug && typeof metadata.retrievalDebug === "object"
        ? metadata.retrievalDebug
        : null,
  };
}
