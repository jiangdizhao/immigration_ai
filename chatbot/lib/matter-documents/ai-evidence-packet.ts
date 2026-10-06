import { createHash } from "node:crypto";

export const MAX_CONVERSATION_DOCUMENTS = 8;
export const MAX_EVIDENCE_UNITS_PER_DOCUMENT = 16;
export const MAX_EVIDENCE_UNITS_TOTAL = 64;
export const MAX_TEXT_CHARS_PER_UNIT_IN_AI_PACKET = 6000;
export const MAX_TEXT_CHARS_PER_DOCUMENT_IN_AI_PACKET = 20_000;
export const MAX_TEXT_CHARS_TOTAL_IN_AI_PACKET = 64_000;

export type CustomerDocumentLocator = Record<string, string | number>;
export type CustomerDocumentUnit = {
  ordinal: number;
  locator: CustomerDocumentLocator;
  text: string;
  extractionMethod: string;
};
export type CustomerDocumentIncludedUnit = {
  ordinal: number;
  locator: CustomerDocumentLocator;
  extractionMethod: string;
  includedTextChars: number;
  textSha256: string;
};
export type CustomerDocumentManifest = {
  documentId: string;
  runId: string;
  originalFilename: string;
  mimeType: string;
  runStatus: "complete" | "partial" | "needs_review";
  extractionMethod: string;
  truncated: boolean;
  includedUnitOrdinals: number[];
  locators: CustomerDocumentLocator[];
  includedUnits: CustomerDocumentIncludedUnit[];
};
export type CustomerDocumentEvidenceDocument = Omit<
  CustomerDocumentManifest,
  "includedUnits"
> & { units: CustomerDocumentUnit[] };
export type CustomerDocumentEvidence = {
  documents: CustomerDocumentEvidenceDocument[];
};
export type MatterDocumentEvidenceInput = {
  documents: Array<{
    document: { id: string; originalFilename: string; mimeType: string };
    run: {
      id: string;
      status: "complete" | "partial" | "needs_review";
      extractionMethod: string | null;
      truncated: boolean;
    };
    units: Array<{
      ordinal: number;
      locator: CustomerDocumentLocator;
      extractedText: string;
      extractionMethod: string;
    }>;
  }>;
};

type ConversationDocumentCandidate = {
  id: string;
  userId: string;
  chatId: string;
  storageStatus: string;
  securityStatus: string;
  deletedAt: Date | null;
  createdAt: Date;
  originalFilename: string;
  mimeType: string;
};

type ConversationDocumentRun = {
  id: string;
  status: string;
  extractionMethod: string | null;
  truncated: boolean;
};

export async function resolveConversationMatterDocumentEvidence(input: {
  userId: string;
  chatId: string;
  documents: ConversationDocumentCandidate[];
  getLatestAttempt: (
    documentId: string
  ) => Promise<ConversationDocumentRun | null>;
  getEvidence: (
    documentId: string,
    runId: string
  ) => Promise<Array<{
    ordinal: number;
    locator: CustomerDocumentLocator;
    extractedText: string;
    extractionMethod: string;
  }> | null>;
}): Promise<{
  evidence: CustomerDocumentEvidence;
  manifest: CustomerDocumentManifest[];
}> {
  const documents = [...input.documents]
    .filter(
      (document) =>
        document.userId === input.userId &&
        document.chatId === input.chatId &&
        document.storageStatus === "stored" &&
        document.securityStatus === "clean" &&
        document.deletedAt === null
    )
    .sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() ||
        left.id.localeCompare(right.id)
    );
  const usable: MatterDocumentEvidenceInput["documents"] = [];

  for (const document of documents) {
    if (usable.length >= MAX_CONVERSATION_DOCUMENTS) {
      break;
    }
    const run = await input.getLatestAttempt(document.id);
    if (!run || !["complete", "partial", "needs_review"].includes(run.status)) {
      continue;
    }
    const units = await input.getEvidence(document.id, run.id);
    if (!units?.length) {
      continue;
    }
    usable.push({
      document: {
        id: document.id,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
      },
      run: {
        id: run.id,
        status: run.status as "complete" | "partial" | "needs_review",
        extractionMethod: run.extractionMethod,
        truncated: run.truncated,
      },
      units,
    });
  }

  return buildBoundedMatterDocumentEvidence({ documents: usable });
}

export function buildBoundedMatterDocumentEvidence(
  input: MatterDocumentEvidenceInput
): {
  evidence: CustomerDocumentEvidence;
  manifest: CustomerDocumentManifest[];
} {
  const evidence: CustomerDocumentEvidence = { documents: [] };
  const manifest: CustomerDocumentManifest[] = [];
  const selectedCount = Math.min(
    input.documents.length,
    MAX_CONVERSATION_DOCUMENTS
  );
  const perDocumentUnitLimit = selectedCount
    ? Math.min(
        MAX_EVIDENCE_UNITS_PER_DOCUMENT,
        Math.ceil(MAX_EVIDENCE_UNITS_TOTAL / selectedCount)
      )
    : MAX_EVIDENCE_UNITS_PER_DOCUMENT;
  const perDocumentCharLimit = selectedCount
    ? Math.min(
        MAX_TEXT_CHARS_PER_DOCUMENT_IN_AI_PACKET,
        Math.floor(MAX_TEXT_CHARS_TOTAL_IN_AI_PACKET / selectedCount)
      )
    : MAX_TEXT_CHARS_PER_DOCUMENT_IN_AI_PACKET;
  let totalUnits = 0;
  let totalChars = 0;
  for (const item of input.documents.slice(0, MAX_CONVERSATION_DOCUMENTS)) {
    const units: CustomerDocumentUnit[] = [];
    let documentChars = 0;
    const orderedUnits = [...item.units].sort((a, b) => a.ordinal - b.ordinal);
    let truncated =
      Boolean(item.run.truncated) ||
      orderedUnits.length > perDocumentUnitLimit ||
      item.run.status !== "complete";
    for (const unit of orderedUnits) {
      if (
        units.length >= perDocumentUnitLimit ||
        totalUnits >= MAX_EVIDENCE_UNITS_TOTAL ||
        totalChars >= MAX_TEXT_CHARS_TOTAL_IN_AI_PACKET ||
        documentChars >= perDocumentCharLimit
      ) {
        truncated = true;
        break;
      }
      const charBudget = Math.min(
        MAX_TEXT_CHARS_PER_UNIT_IN_AI_PACKET,
        perDocumentCharLimit - documentChars,
        MAX_TEXT_CHARS_TOTAL_IN_AI_PACKET - totalChars
      );
      const text = unit.extractedText.slice(0, charBudget);
      if (text.length < unit.extractedText.length) {
        truncated = true;
      }
      if (!text.trim()) {
        truncated = true;
        continue;
      }
      units.push({
        ordinal: unit.ordinal,
        locator: unit.locator,
        text,
        extractionMethod: unit.extractionMethod,
      });
      documentChars += text.length;
      totalChars += text.length;
      totalUnits += 1;
    }
    if (!units.length) {
      continue;
    }
    const includedUnits = units.map((unit) => ({
      ordinal: unit.ordinal,
      locator: unit.locator,
      extractionMethod: unit.extractionMethod,
      includedTextChars: unit.text.length,
      textSha256: createHash("sha256").update(unit.text, "utf8").digest("hex"),
    }));
    const baseManifest = {
      documentId: item.document.id,
      runId: item.run.id,
      originalFilename: item.document.originalFilename,
      mimeType: item.document.mimeType,
      runStatus: item.run.status,
      extractionMethod: item.run.extractionMethod ?? "native",
      truncated,
      includedUnitOrdinals: units.map((unit) => unit.ordinal),
      locators: units.map((unit) => unit.locator),
    };
    evidence.documents.push({ ...baseManifest, units });
    manifest.push({ ...baseManifest, includedUnits });
  }
  return { evidence, manifest };
}
