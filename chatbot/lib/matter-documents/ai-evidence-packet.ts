export const MAX_SELECTED_DOCUMENTS = 4;
export const MAX_EVIDENCE_UNITS_PER_DOCUMENT = 8;
export const MAX_EVIDENCE_UNITS_TOTAL = 24;
export const MAX_TEXT_CHARS_PER_UNIT_IN_AI_PACKET = 4000;
export const MAX_TEXT_CHARS_PER_DOCUMENT_IN_AI_PACKET = 8000;
export const MAX_TEXT_CHARS_TOTAL_IN_AI_PACKET = 24_000;

export type CustomerDocumentLocator = Record<string, string | number>;
export type CustomerDocumentUnit = {
  ordinal: number;
  locator: CustomerDocumentLocator;
  text: string;
  extractionMethod: string;
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
};
export type CustomerDocumentEvidence = {
  documents: Array<
    CustomerDocumentManifest & { units: CustomerDocumentUnit[] }
  >;
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

export class SelectedMatterDocumentError extends Error {
  readonly kind: "not_found" | "not_ready";

  constructor(kind: "not_found" | "not_ready") {
    super(
      kind === "not_found"
        ? "Selected document not found."
        : "Selected document is not ready for AI use."
    );
    this.kind = kind;
  }
}

export function assertSelectedMatterDocumentAccess(
  document: {
    userId: string;
    chatId: string;
    storageStatus: string;
    deletedAt: Date | null;
  } | null,
  expected: { userId: string; chatId: string }
): asserts document is NonNullable<typeof document> {
  if (
    !document ||
    document.userId !== expected.userId ||
    document.chatId !== expected.chatId ||
    document.storageStatus !== "stored" ||
    document.deletedAt
  ) {
    throw new SelectedMatterDocumentError("not_found");
  }
}

export function assertMatterDocumentEvidenceReady(
  run: { status: string } | null | undefined,
  unitCount: number
): asserts run is { status: "complete" | "partial" | "needs_review" } {
  if (
    !run ||
    !["complete", "partial", "needs_review"].includes(run.status) ||
    unitCount === 0
  ) {
    throw new SelectedMatterDocumentError("not_ready");
  }
}

export function buildBoundedMatterDocumentEvidence(
  input: MatterDocumentEvidenceInput
): {
  evidence: CustomerDocumentEvidence;
  manifest: CustomerDocumentManifest[];
} {
  const evidence: CustomerDocumentEvidence = { documents: [] };
  const selectedCount = input.documents.length;
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
  for (const item of input.documents) {
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
      throw new SelectedMatterDocumentError("not_ready");
    }
    evidence.documents.push({
      documentId: item.document.id,
      runId: item.run.id,
      originalFilename: item.document.originalFilename,
      mimeType: item.document.mimeType,
      runStatus: item.run.status,
      extractionMethod: item.run.extractionMethod ?? "native",
      truncated,
      includedUnitOrdinals: units.map((unit) => unit.ordinal),
      locators: units.map((unit) => unit.locator),
      units,
    });
  }
  return {
    evidence,
    manifest: evidence.documents.map(
      ({ units: _units, ...manifest }) => manifest
    ),
  };
}
