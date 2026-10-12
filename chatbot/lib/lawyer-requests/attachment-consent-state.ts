/**
 * Phase 12 Stage 2 final correction — lawyer attachment consent state.
 *
 * Two reviewed defects are fixed here, in pure, testable code:
 *
 * - **Defect A** — submission is only possible after the eligible-document
 *   request has succeeded. A pending or failed load is never read as "the
 *   customer chose to share nothing", so {@link attachmentDecisionPayload}
 *   returns `null` unless the list actually loaded.
 * - **Defect B** — a server-reported existing request is its own state. It shows
 *   the persisted shared-document count (never the current checkbox state) and
 *   offers no new submission controls.
 *
 * The fetch is injectable so the loading/retry behaviour is testable without a
 * DOM.
 */

export type LawyerAttachmentOption = {
  documentId: string;
  filename: string;
  runStatus: string | null;
  usedByAnswer: boolean;
};

export type LawyerAttachmentConsentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed" }
  | {
      status: "ready";
      documents: LawyerAttachmentOption[];
      maxSelectable: number;
      acknowledgedCount: number;
      unavailableCount: number;
    }
  | {
      status: "already_requested";
      /**
       * Authoritative count taken from the persisted request's
       * `documentSharing`. `null` means "not recorded" and must be displayed as
       * unknown rather than replaced by the current checkbox state.
       */
      sharedDocumentCount: number | null;
      requestId: string | null;
    };

export type LawyerAttachmentDecision = {
  consent: true;
  selectedDocumentIds: string[];
};

export const LAWYER_ATTACHMENT_DEFAULT_LIMIT = 4;

export type AttachmentConsentFetcher = (
  input: string,
  init?: { method?: string }
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

function boundedCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(Math.floor(value), 100_000)
    : null;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The shared-document count of a persisted request, as recorded by the server in
 * `documentSharing.selectedDocumentCount`.
 *
 * Anything missing or malformed — a legacy request whose snapshot predates the
 * consent record, or a truncated response — is `null` ("not recorded"). It is
 * never turned into a fabricated zero, and it never falls back to the client's
 * current selection.
 */
export function sharedDocumentCountFromSharing(
  sharing: unknown
): number | null {
  const record = recordFromUnknown(sharing);
  if (!record) {
    return null;
  }
  return boundedCount(record.selectedDocumentCount);
}

function attachmentOptionFromUnknown(
  value: unknown
): LawyerAttachmentOption | null {
  const record = recordFromUnknown(value);
  if (
    !record ||
    typeof record.documentId !== "string" ||
    record.documentId.trim().length === 0
  ) {
    return null;
  }
  return {
    documentId: record.documentId,
    filename:
      typeof record.filename === "string" && record.filename.trim().length > 0
        ? record.filename
        : "Customer document",
    runStatus: typeof record.runStatus === "string" ? record.runStatus : null,
    usedByAnswer: record.usedByAnswer === true,
  };
}

/**
 * Read the server's `attachmentSelection` block into UI state.
 *
 * Only an explicit `selectable` load is ready for submission; an explicit
 * `already_requested` load shows the persisted request; anything else (missing
 * block, unknown status, malformed payload) fails closed.
 */
export function attachmentConsentStateFromResponse(
  payload: unknown
): LawyerAttachmentConsentState {
  const record = recordFromUnknown(payload);
  const selection = record
    ? recordFromUnknown(record.attachmentSelection)
    : null;
  if (!record || !selection) {
    return { status: "failed" };
  }

  if (selection.status === "already_requested") {
    const requestId =
      typeof selection.requestId === "string" &&
      selection.requestId.trim().length > 0
        ? selection.requestId
        : null;
    return {
      status: "already_requested",
      sharedDocumentCount: sharedDocumentCountFromSharing(
        selection.documentSharing ?? record.documentSharing
      ),
      requestId,
    };
  }

  if (selection.status !== "selectable") {
    return { status: "failed" };
  }

  const documents = Array.isArray(selection.documents)
    ? selection.documents.flatMap((entry) => {
        const option = attachmentOptionFromUnknown(entry);
        return option ? [option] : [];
      })
    : [];
  const maxSelectable = boundedCount(selection.maxSelectable);
  return {
    status: "ready",
    documents,
    maxSelectable:
      maxSelectable && maxSelectable > 0
        ? maxSelectable
        : LAWYER_ATTACHMENT_DEFAULT_LIMIT,
    acknowledgedCount: boundedCount(selection.acknowledgedCount) ?? 0,
    unavailableCount: boundedCount(selection.unavailableCount) ?? 0,
  };
}

/**
 * Whether the customer may submit a lawyer request from this state.
 *
 * Only a successfully loaded list allows submission — `idle`, `loading`,
 * `failed` and `already_requested` all block it.
 */
export function canSubmitLawyerRequestWithAttachments(
  state: LawyerAttachmentConsentState
): boolean {
  return state.status === "ready";
}

/**
 * The explicit decision to send with the request, or `null` when the customer
 * may not submit.
 *
 * An empty selection is a valid, explicit decision (`selectedDocumentIds: []`);
 * a failed load is not, and never produces a payload. Over-limit selections are
 * refused here as well so nothing is ever silently truncated.
 */
export function attachmentDecisionPayload(
  state: LawyerAttachmentConsentState,
  selectedDocumentIds: readonly unknown[]
): LawyerAttachmentDecision | null {
  if (state.status !== "ready") {
    return null;
  }
  const selected: string[] = [];
  for (const id of selectedDocumentIds) {
    // A malformed selection is refused outright rather than silently dropped.
    if (typeof id !== "string" || id.trim().length === 0) {
      return null;
    }
    selected.push(id);
  }
  const unique = Array.from(new Set(selected));
  if (
    unique.length !== selected.length ||
    unique.length > state.maxSelectable
  ) {
    return null;
  }
  return { consent: true, selectedDocumentIds: unique };
}

/**
 * Load the eligible documents for one answered turn. Never throws: a network
 * failure, an error response or a malformed body becomes the explicit `failed`
 * state, which blocks submission.
 */
export async function loadAttachmentConsentState({
  chatId,
  assistantMessageId,
  fetcher,
}: {
  chatId: string;
  assistantMessageId: string;
  fetcher?: AttachmentConsentFetcher;
}): Promise<{
  state: LawyerAttachmentConsentState;
  questionPreview: string | null;
}> {
  const doFetch: AttachmentConsentFetcher = fetcher ?? fetch;
  try {
    const query = new URLSearchParams({ chatId, assistantMessageId });
    const response = await doFetch(`/api/lawyer-requests?${query}`, {
      method: "GET",
    });
    if (!response.ok) {
      return { state: { status: "failed" }, questionPreview: null };
    }
    const payload = await response.json().catch(() => null);
    const record = recordFromUnknown(payload);
    return {
      state: attachmentConsentStateFromResponse(payload),
      questionPreview:
        record && typeof record.questionPreview === "string"
          ? record.questionPreview
          : null,
    };
  } catch {
    return { state: { status: "failed" }, questionPreview: null };
  }
}
