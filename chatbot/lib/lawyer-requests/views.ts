import type {
  LawyerClarificationMessage,
  LawyerClarificationRequest,
} from "@/lib/db/schema";

/**
 * Bounded, customer-facing view of what was shared with the lawyer.
 *
 * Reads the persisted evidence snapshot: the `customer_document` items are
 * exactly the documents the customer selected (with their acknowledgement
 * state), and the `customer_document_selection` item records the decision
 * counts. Customers may see their own filenames here; the lawyer never receives
 * the names of documents the customer withheld.
 */
function documentSharingFromSnapshot(evidenceSnapshot: unknown) {
  const sharedDocuments: Array<{ filename: string; usedByAnswer: boolean }> =
    [];
  let selection: Record<string, unknown> | null = null;
  if (Array.isArray(evidenceSnapshot)) {
    for (const entry of evidenceSnapshot) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      if (record.kind === "customer_document_selection") {
        selection = record;
        continue;
      }
      if (record.kind !== "customer_document") {
        continue;
      }
      sharedDocuments.push({
        filename:
          typeof record.filename === "string" && record.filename.trim()
            ? record.filename
            : "Customer document",
        usedByAnswer: record.used_by_answer === true,
      });
    }
  }
  const count = (key: string) => {
    const value = selection?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return {
    sharedDocuments,
    documentSharing: {
      decision:
        typeof selection?.selection_mode === "string"
          ? selection.selection_mode
          : "unknown",
      eligibleDocumentCount: count("eligible_document_count"),
      acknowledgedDocumentCount: count("acknowledged_document_count"),
      selectedDocumentCount: count("selected_document_count"),
      acknowledgedSharedCount: count("acknowledged_shared_count"),
      acknowledgedWithheldCount: count("acknowledged_withheld_count"),
    },
  };
}

export function customerLawyerRequestView(
  request: LawyerClarificationRequest,
  messages: Pick<
    LawyerClarificationMessage,
    "id" | "authorRole" | "body" | "createdAt"
  >[] = []
) {
  const sharing = documentSharingFromSnapshot(request.evidenceSnapshot);
  return {
    id: request.id,
    chatId: request.chatId,
    legalMatterId: request.legalMatterId,
    status: request.status,
    assistantMode: request.assistantMode,
    questionSnapshot: request.questionSnapshot,
    answerSnapshot: request.answerSnapshot,
    customerNote: request.customerNote,
    lawyerResponse: request.lawyerResponse,
    correctedAnswer: request.correctedAnswer,
    assigned: Boolean(request.assignedLawyerUserId),
    customerLastViewedAt: request.customerLastViewedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    reviewedAt: request.reviewedAt,
    closedAt: request.closedAt,
    sharedDocuments: sharing.sharedDocuments,
    documentSharing: sharing.documentSharing,
    messages: messages.map((message) => ({
      id: message.id,
      authorRole: message.authorRole,
      body: message.body,
      createdAt: message.createdAt,
    })),
  };
}

export function customerLawyerRequestSummary(
  request: LawyerClarificationRequest
) {
  const view = customerLawyerRequestView(request);
  return {
    ...view,
    messages: undefined,
    unread: Boolean(
      request.updatedAt &&
        (!request.customerLastViewedAt ||
          request.updatedAt > request.customerLastViewedAt)
    ),
  };
}
