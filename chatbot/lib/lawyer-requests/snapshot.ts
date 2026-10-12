import type { DBMessage } from "@/lib/db/schema";

export const LAWYER_REQUEST_SNAPSHOT_VERSION = "phase12.s2.consent.v1";

export type LawyerRequestContextItem = {
  role: "user" | "assistant";
  text: string;
  messageId: string;
};

export type LawyerRequestEvidenceItem = {
  kind:
    | "compact_source"
    | "citation"
    | "customer_document"
    | "customer_document_selection";
  document_id?: string | null;
  run_id?: string | null;
  filename?: string | null;
  run_status?: string | null;
  extraction_method?: string | null;
  locator?: Record<string, string | number> | null;
  truncated?: boolean | null;
  /**
   * R2: `true` only when the answer acknowledged relying on this document.
   * `false` means the customer explicitly selected this authorized attachment.
   * Distinct from `kind: "customer_document"` (which is the category, not use).
   */
  used_by_answer?: boolean | null;
  /**
   * Bounded, filename-free record of the customer's explicit attachment decision
   * for this request (present once per request, on the
   * `customer_document_selection` item).
   */
  selection_version?: string | null;
  selection_mode?:
    | "explicit_selection"
    | "no_selection"
    | "no_documents"
    | null;
  eligible_document_count?: number | null;
  acknowledged_document_count?: number | null;
  selected_document_count?: number | null;
  acknowledged_shared_count?: number | null;
  acknowledged_withheld_count?: number | null;
  max_selectable?: number | null;
  title?: string | null;
  source_id?: string | null;
  quote?: string | null;
  used_for?: string | null;
  url?: string | null;
  source_type?: string | null;
  authority?: string | null;
};

/**
 * Phase 12 Stage 2 closure: bounded, explicitly consented lawyer attachments.
 *
 * The persisted manifest holds the documents the answered turn's request
 * actually carried (server-built, conversation-scoped and owner-authorized when
 * it was stored). The acknowledged ids name the subset the answer said it used.
 * The customer then chooses, per document, what to share — nothing is shared by
 * default and nothing is inferred from the button press.
 *
 * These functions are pure: the route supplies the persisted manifest, the
 * acknowledged ids and the authoritative document details it read from the
 * owner's own rows. Selection is never truncated: asking for more than
 * LAWYER_DOCUMENT_ATTACHMENT_LIMIT documents is an explicit error, so what the
 * lawyer receives is exactly what the customer chose.
 *
 * Answers stored before per-document acknowledgements existed carry no ids;
 * they keep their stored (pre-R2) meaning and are marked as used, because
 * nothing can be made precise retroactively without inventing data. The new
 * explicit selection rule still applies to any new request for them.
 */
export const LAWYER_DOCUMENT_ATTACHMENT_LIMIT = 4;

export type LawyerDocumentAttachment = {
  documentId: string;
  runId: string;
  includedUnitOrdinals: number[];
  usedByAnswer: boolean;
  /**
   * The original bounded manifest entry, so exact reconstruction can verify the
   * unit ordinals, locators and text hashes it was built from. Never mutated.
   */
  manifestEntry: Record<string, unknown>;
};

export type EligibleLawyerDocument = {
  documentId: string;
  filename: string;
  runStatus: string | null;
  usedByAnswer: boolean;
};

export type LawyerDocumentAvailability = {
  filename: string;
  runStatus: string | null;
  available: boolean;
};

type ParsedManifest = {
  entries: LawyerDocumentAttachment[];
  acknowledged: Set<string>;
  legacy: boolean;
};

function acknowledgedIdSet(acknowledgedDocumentIds: unknown): {
  acknowledged: Set<string>;
  legacy: boolean;
} {
  const legacy =
    acknowledgedDocumentIds === undefined || acknowledgedDocumentIds === null;
  return {
    acknowledged: new Set(
      legacy || !Array.isArray(acknowledgedDocumentIds)
        ? []
        : acknowledgedDocumentIds.filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0
          )
    ),
    legacy,
  };
}

/**
 * Parse the persisted manifest into reconstructible entries. Entries that cannot
 * be reconstructed at all are dropped (they can never be shared); an
 * acknowledged id with no usable entry is reported as an error by the callers.
 */
function parseManifest(manifest: unknown): ParsedManifest | { error: string } {
  if (manifest === undefined || manifest === null) {
    return { entries: [], acknowledged: new Set(), legacy: false };
  }
  if (!Array.isArray(manifest)) {
    return { error: "The answer's customer document manifest is invalid." };
  }
  const entries: LawyerDocumentAttachment[] = [];
  for (const entry of manifest) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.documentId !== "string" ||
      typeof record.runId !== "string" ||
      !Array.isArray(record.includedUnitOrdinals)
    ) {
      continue;
    }
    const ordinals = record.includedUnitOrdinals.filter(
      (value): value is number => Number.isInteger(value)
    );
    if (
      ordinals.length !== record.includedUnitOrdinals.length ||
      ordinals.length === 0
    ) {
      continue;
    }
    entries.push({
      documentId: record.documentId,
      runId: record.runId,
      includedUnitOrdinals: ordinals,
      usedByAnswer: false,
      manifestEntry: record,
    });
  }
  return { entries, acknowledged: new Set(), legacy: false };
}

/**
 * The documents the customer may choose to share for one answered turn.
 *
 * `details` carries what the server knows about each document from the owner's
 * own rows (authoritative filename, latest run status, retained status). A
 * document the owner can no longer share (deleted, unstored or non-clean) is
 * reported as unavailable and is never offered or accepted.
 */
export function listEligibleLawyerDocumentAttachments({
  manifest,
  acknowledgedDocumentIds,
  details,
}: {
  manifest: unknown;
  acknowledgedDocumentIds?: unknown;
  details?: ReadonlyMap<string, LawyerDocumentAvailability>;
}): {
  documents: EligibleLawyerDocument[];
  acknowledgedCount: number;
  acknowledgedWithheldCount: number;
  unavailableCount: number;
} {
  const parsed = parseManifest(manifest);
  const { acknowledged, legacy } = acknowledgedIdSet(acknowledgedDocumentIds);
  if ("error" in parsed) {
    return {
      documents: [],
      acknowledgedCount: 0,
      acknowledgedWithheldCount: 0,
      unavailableCount: 0,
    };
  }

  const documents: EligibleLawyerDocument[] = [];
  let acknowledgedCount = 0;
  let unavailableCount = 0;
  for (const entry of parsed.entries) {
    const usedByAnswer = legacy ? true : acknowledged.has(entry.documentId);
    if (usedByAnswer) {
      acknowledgedCount += 1;
    }
    const detail = details?.get(entry.documentId);
    if (detail && !detail.available) {
      unavailableCount += 1;
      continue;
    }
    documents.push({
      documentId: entry.documentId,
      filename:
        detail?.filename ??
        (typeof entry.manifestEntry.originalFilename === "string"
          ? entry.manifestEntry.originalFilename
          : "Customer document"),
      runStatus:
        detail?.runStatus ??
        (typeof entry.manifestEntry.runStatus === "string"
          ? entry.manifestEntry.runStatus
          : null),
      usedByAnswer,
    });
  }

  return {
    documents,
    acknowledgedCount,
    acknowledgedWithheldCount:
      acknowledgedCount -
      documents.filter((document) => document.usedByAnswer).length,
    unavailableCount,
  };
}

/**
 * The exact attachments one lawyer request may carry.
 *
 * Only the customer's explicitly selected documents are returned — the
 * acknowledged subset is never added automatically, and a selection larger than
 * the limit is an error instead of a silent truncation. Unknown ids (forged,
 * cross-conversation or stale) are errors too, so nothing can be shared that the
 * customer did not choose and that this answered turn did not authorize.
 */
export function selectLawyerDocumentAttachments({
  manifest,
  acknowledgedDocumentIds,
  selectedDocumentIds,
  limit = LAWYER_DOCUMENT_ATTACHMENT_LIMIT,
}: {
  manifest: unknown;
  acknowledgedDocumentIds?: unknown;
  selectedDocumentIds?: unknown;
  limit?: number;
}):
  | {
      attachments: LawyerDocumentAttachment[];
      selectedCount: number;
      acknowledgedSharedCount: number;
      acknowledgedWithheldCount: number;
    }
  | { error: string } {
  const parsed = parseManifest(manifest);
  const { acknowledged, legacy } = acknowledgedIdSet(acknowledgedDocumentIds);
  const requested = Array.isArray(selectedDocumentIds)
    ? selectedDocumentIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : selectedDocumentIds === undefined || selectedDocumentIds === null
      ? []
      : null;
  if (requested === null) {
    return { error: "The selected documents are invalid." };
  }
  if (
    requested.length !==
    (Array.isArray(selectedDocumentIds) ? selectedDocumentIds.length : 0)
  ) {
    return { error: "The selected documents are invalid." };
  }
  if (requested.length > Math.max(0, limit)) {
    return {
      error: `You can share at most ${Math.max(0, limit)} documents with the lawyer.`,
    };
  }
  if (new Set(requested).size !== requested.length) {
    return { error: "The selected documents are invalid." };
  }
  const empty = {
    attachments: [] as LawyerDocumentAttachment[],
    selectedCount: 0,
    acknowledgedSharedCount: 0,
    acknowledgedWithheldCount: 0,
  };
  if ("error" in parsed) {
    return requested.length > 0
      ? { error: "The selected documents are no longer available." }
      : empty;
  }

  const entries = parsed.entries.map((entry) => ({
    ...entry,
    usedByAnswer: legacy ? true : acknowledged.has(entry.documentId),
  }));
  const enteredIds = new Set(entries.map((entry) => entry.documentId));

  // An acknowledged id with no usable manifest entry cannot be reconstructed,
  // so the answer's claimed basis would silently disappear. Fail instead.
  for (const id of acknowledged) {
    if (!enteredIds.has(id)) {
      return { error: "The answer's customer document manifest is invalid." };
    }
  }

  const selectedSet = new Set(requested);
  for (const id of selectedSet) {
    if (!enteredIds.has(id)) {
      return { error: "The selected documents are no longer available." };
    }
  }

  const attachments = entries.filter((entry) =>
    selectedSet.has(entry.documentId)
  );
  const acknowledgedSharedCount = attachments.filter(
    (attachment) => attachment.usedByAnswer
  ).length;
  const acknowledgedEligible = entries.filter(
    (entry) => entry.usedByAnswer
  ).length;

  return {
    attachments,
    selectedCount: attachments.length,
    acknowledgedSharedCount,
    acknowledgedWithheldCount: acknowledgedEligible - acknowledgedSharedCount,
  };
}

export const LAWYER_DOCUMENT_SELECTION_VERSION = "phase12.stage2.consent.v1";

export type LawyerDocumentSelectionMode =
  | "explicit_selection"
  | "no_selection"
  | "no_documents";

/**
 * Bounded, filename-free record of what the customer chose to disclose.
 *
 * Stored with the request so the exact disclosure decision can be reviewed
 * later: how many documents were eligible, how many were shared, and how many
 * documents the AI answer acknowledged were withheld by customer choice. It
 * never carries filenames, excerpts or ids of documents the lawyer did not
 * receive.
 */
export function buildCustomerDocumentSelectionEvidence({
  eligibleDocumentCount,
  acknowledgedCount,
  selectedCount,
  acknowledgedSharedCount,
  acknowledgedWithheldCount,
  maxSelectable = LAWYER_DOCUMENT_ATTACHMENT_LIMIT,
}: {
  eligibleDocumentCount: number;
  acknowledgedCount: number;
  selectedCount: number;
  acknowledgedSharedCount: number;
  acknowledgedWithheldCount: number;
  maxSelectable?: number;
}): LawyerRequestEvidenceItem {
  const mode: LawyerDocumentSelectionMode =
    selectedCount > 0
      ? "explicit_selection"
      : eligibleDocumentCount > 0
        ? "no_selection"
        : "no_documents";
  return {
    kind: "customer_document_selection",
    selection_version: LAWYER_DOCUMENT_SELECTION_VERSION,
    selection_mode: mode,
    eligible_document_count: Math.max(0, eligibleDocumentCount),
    acknowledged_document_count: Math.max(0, acknowledgedCount),
    selected_document_count: Math.max(0, selectedCount),
    acknowledged_shared_count: Math.max(0, acknowledgedSharedCount),
    acknowledged_withheld_count: Math.max(0, acknowledgedWithheldCount),
    max_selectable: Math.max(0, maxSelectable),
  };
}

export type LawyerRequestSnapshot = {
  userMessageId: string;
  assistantMessageId: string;
  questionSnapshot: string;
  answerSnapshot: string;
  contextSnapshot: LawyerRequestContextItem[];
  evidenceSnapshot: LawyerRequestEvidenceItem[];
  assistantMode: "default" | "premium" | "unknown";
};

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function visibleMessageText(parts: unknown) {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => {
      const record = recordFromUnknown(part);
      return record?.type === "text" && typeof record.text === "string"
        ? record.text
        : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function metadataFromParts(parts: unknown) {
  if (!Array.isArray(parts)) {
    return null;
  }
  for (const part of parts) {
    const record = recordFromUnknown(part);
    if (record?.type === "metadata") {
      return record;
    }
  }
  return null;
}

function safeString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : null;
}

function safeEvidence(parts: unknown): LawyerRequestEvidenceItem[] {
  const metadata = metadataFromParts(parts);
  if (!metadata) {
    return [];
  }

  const evidence: LawyerRequestEvidenceItem[] = [];
  if (Array.isArray(metadata.compactSources)) {
    for (const source of metadata.compactSources) {
      if (typeof source === "string" && source.trim()) {
        evidence.push({ kind: "compact_source", title: source.trim() });
      }
    }
  }

  if (Array.isArray(metadata.citations)) {
    for (const citation of metadata.citations) {
      const record = recordFromUnknown(citation);
      if (!record) {
        continue;
      }
      evidence.push({
        kind: "citation",
        source_id: safeString(record, "source_id"),
        title: safeString(record, "title"),
        quote: safeString(record, "quote"),
        used_for: safeString(record, "used_for"),
        url: safeString(record, "url"),
        source_type: safeString(record, "source_type"),
        authority: safeString(record, "authority"),
      });
    }
  }

  return evidence;
}

function chronologicalMessages(messages: DBMessage[]) {
  return [...messages].sort((left, right) => {
    const createdDifference =
      left.createdAt.getTime() - right.createdAt.getTime();
    return createdDifference || left.id.localeCompare(right.id);
  });
}

export function buildLawyerRequestSnapshot({
  messages,
  assistantMessageId,
}: {
  messages: DBMessage[];
  assistantMessageId: string;
}): LawyerRequestSnapshot | { error: string } {
  const ordered = chronologicalMessages(messages);
  const assistantIndex = ordered.findIndex(
    (message) => message.id === assistantMessageId
  );
  const assistant = ordered[assistantIndex];

  if (!assistant || assistant.role !== "assistant") {
    return { error: "The selected message is not an assistant answer." };
  }

  const answerSnapshot = visibleMessageText(assistant.parts);
  if (!answerSnapshot) {
    return { error: "The selected assistant answer has no visible text." };
  }

  let userMessage: DBMessage | undefined;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (
      ordered[index].role === "user" &&
      visibleMessageText(ordered[index].parts)
    ) {
      userMessage = ordered[index];
      break;
    }
  }
  if (!userMessage) {
    return { error: "The selected answer has no preceding customer question." };
  }

  const contextSnapshot = ordered
    .slice(0, assistantIndex + 1)
    .filter(
      (message): message is DBMessage & { role: "user" | "assistant" } =>
        (message.role === "user" || message.role === "assistant") &&
        Boolean(visibleMessageText(message.parts))
    )
    .slice(-8)
    .map((message) => ({
      role: message.role,
      text: visibleMessageText(message.parts),
      messageId: message.id,
    }));

  const metadata = metadataFromParts(assistant.parts);
  const assistantMode =
    metadata?.assistantMode === "default" ||
    metadata?.assistantMode === "premium"
      ? metadata.assistantMode
      : "unknown";

  return {
    userMessageId: userMessage.id,
    assistantMessageId,
    questionSnapshot: visibleMessageText(userMessage.parts),
    answerSnapshot,
    contextSnapshot,
    evidenceSnapshot: safeEvidence(assistant.parts),
    assistantMode,
  };
}
