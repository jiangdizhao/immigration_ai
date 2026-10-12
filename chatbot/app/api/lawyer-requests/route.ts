import { z } from "zod";
import {
  getChatById,
  getImmigrationConversationByChatId,
  getLawyerClarificationRequestByUserAndAssistantMessage,
  getMatterDocumentEvidenceForLawyerSnapshot,
  getMessagesByChatId,
  listLatestMatterDocumentProcessingRunsForConversation,
  listMatterDocumentRecordsForOwner,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import {
  canCreateLawyerClarificationRequest,
  requestSourceForRole,
} from "@/lib/lawyer-requests/authorization";
import {
  createLawyerRequestWithEvent,
  listCustomerLawyerRequests,
} from "@/lib/lawyer-requests/service";
import {
  buildCustomerDocumentSelectionEvidence,
  buildLawyerRequestSnapshot,
  LAWYER_DOCUMENT_ATTACHMENT_LIMIT,
  LAWYER_REQUEST_SNAPSHOT_VERSION,
  type LawyerDocumentAvailability,
  listEligibleLawyerDocumentAttachments,
  selectLawyerDocumentAttachments,
} from "@/lib/lawyer-requests/snapshot";
import { validateLawyerRequestTarget } from "@/lib/lawyer-requests/target-validation";
import {
  customerLawyerRequestSummary,
  customerLawyerRequestView,
} from "@/lib/lawyer-requests/views";
import { reconstructExactLawyerDocumentEvidence } from "@/lib/matter-documents/lawyer-evidence-reconstruction";
import { requireRegisteredUser } from "@/lib/vip/access";
import { premiumDeniedResponse } from "@/lib/vip/entitlement";

const PREVIEW_CHAR_LIMIT = 400;

const createRequestSchema = z
  .object({
    chatId: z.string().uuid(),
    assistantMessageId: z.string().uuid(),
    customerNote: z.string().trim().max(4000).optional(),
    /**
     * Explicit attachment decision. Absent means "share nothing": permission is
     * never inferred from asking for a review. `consent` must be an explicit
     * `true`, and `selectedDocumentIds` must be ids of documents belonging to
     * this answered turn's server-persisted manifest.
     */
    attachments: z
      .object({
        consent: z.literal(true),
        selectedDocumentIds: z
          .array(z.string().trim().min(1).max(64))
          .max(LAWYER_DOCUMENT_ATTACHMENT_LIMIT),
      })
      .strict()
      .optional(),
  })
  .strict();

function metadataFromParts(parts: unknown) {
  return Array.isArray(parts)
    ? (parts.find(
        (part) =>
          part &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "metadata"
      ) as Record<string, unknown> | undefined)
    : undefined;
}

function documentIdsFromManifest(manifest: unknown): string[] {
  if (!Array.isArray(manifest)) {
    return [];
  }
  return manifest.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const documentId = (entry as Record<string, unknown>).documentId;
    return typeof documentId === "string" && documentId.trim()
      ? [documentId]
      : [];
  });
}

/**
 * Authoritative availability for the persisted manifest of one answered turn.
 *
 * Reads only the owner's own stored, non-deleted documents for this
 * conversation, plus their latest processing runs. Filenames come from the
 * application rows, never from the client.
 */
async function documentAvailabilityForTurn({
  userId,
  chatId,
  documentIds,
}: {
  userId: string;
  chatId: string;
  documentIds: readonly string[];
}): Promise<Map<string, LawyerDocumentAvailability>> {
  const wanted = new Set(documentIds);
  const details = new Map<string, LawyerDocumentAvailability>();
  if (wanted.size === 0) {
    return details;
  }
  const records = await listMatterDocumentRecordsForOwner({ userId, chatId });
  const runStatus = new Map<string, string | null>();
  for (const row of await listLatestMatterDocumentProcessingRunsForConversation(
    {
      userId,
      chatId,
    }
  )) {
    runStatus.set(row.documentId, row.status ?? null);
  }
  const byDocumentId = new Map<
    string,
    { filename: string; available: boolean }
  >();
  for (const { matterDocument } of records) {
    if (!matterDocument || typeof matterDocument.id !== "string") {
      continue;
    }
    byDocumentId.set(matterDocument.id, {
      filename:
        typeof matterDocument.originalFilename === "string"
          ? matterDocument.originalFilename
          : "Customer document",
      available:
        matterDocument.storageStatus === "stored" &&
        matterDocument.securityStatus === "clean" &&
        !matterDocument.deletedAt,
    });
  }
  for (const documentId of wanted) {
    const record = byDocumentId.get(documentId);
    if (!record) {
      // Not returned by the owner-scoped query: deleted, unstored, foreign or
      // simply gone. Never offer it and never accept it.
      details.set(documentId, {
        filename: "Customer document",
        runStatus: null,
        available: false,
      });
      continue;
    }
    details.set(documentId, {
      filename: record.filename,
      runStatus: runStatus.get(documentId) ?? null,
      available: record.available,
    });
  }
  return details;
}

export async function GET(request: Request) {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  const url = new URL(request.url);
  const chatId = url.searchParams.get("chatId") ?? undefined;
  if (chatId && !z.string().uuid().safeParse(chatId).success) {
    return Response.json({ error: "Invalid chat ID." }, { status: 400 });
  }
  const assistantMessageId =
    url.searchParams.get("assistantMessageId") ?? undefined;

  const requests = await listCustomerLawyerRequests(access.userId);
  const filteredRequests = chatId
    ? requests.filter((request) => request.chatId === chatId)
    : requests;
  const payload: Record<string, unknown> = {
    requests: filteredRequests.map(customerLawyerRequestSummary),
  };

  if (!assistantMessageId) {
    return Response.json(payload);
  }
  if (!chatId || !z.string().uuid().safeParse(assistantMessageId).success) {
    return Response.json(
      { error: "A valid chatId and assistantMessageId are required." },
      { status: 400 }
    );
  }

  const existing = await getLawyerClarificationRequestByUserAndAssistantMessage(
    {
      userId: access.userId,
      assistantMessageId,
    }
  );
  if (existing) {
    /**
     * A request already exists for this answer.
     *
     * Backward compatible: the `status`/`documents` contract is unchanged. The
     * id and the persisted `documentSharing` summary are additive, so the client
     * can show the authoritative shared-document count instead of guessing from
     * its current checkbox state.
     */
    return Response.json({
      ...payload,
      attachmentSelection: {
        status: "already_requested",
        maxSelectable: LAWYER_DOCUMENT_ATTACHMENT_LIMIT,
        documents: [],
        requestId: existing.id,
        documentSharing: customerLawyerRequestView(existing).documentSharing,
      },
    });
  }

  const selectedChat = await getChatById({ id: chatId });
  const messages = await getMessagesByChatId({ id: chatId });
  const selectedMessage = messages.find(
    (message) => message.id === assistantMessageId
  );
  const targetFailure = validateLawyerRequestTarget({
    authenticatedUserId: access.userId,
    chat: selectedChat,
    requestedChatId: chatId,
    requestedAssistantMessageId: assistantMessageId,
    selectedMessage: selectedMessage ?? null,
  });
  if (targetFailure) {
    return Response.json(
      { error: "The selected message is not an assistant answer." },
      { status: targetFailure === "conversation_not_owned" ? 404 : 400 }
    );
  }

  const snapshot = buildLawyerRequestSnapshot({ messages, assistantMessageId });
  if ("error" in snapshot) {
    return Response.json({ error: snapshot.error }, { status: 400 });
  }
  const metadata = metadataFromParts(selectedMessage?.parts);
  const manifest = metadata?.customerDocumentManifest;
  const details = await documentAvailabilityForTurn({
    userId: access.userId,
    chatId,
    documentIds: documentIdsFromManifest(manifest),
  });
  const eligibility = listEligibleLawyerDocumentAttachments({
    manifest,
    acknowledgedDocumentIds: metadata?.customerDocumentUsedIds,
    details,
  });

  return Response.json({
    ...payload,
    questionPreview: snapshot.questionSnapshot.slice(0, PREVIEW_CHAR_LIMIT),
    answerPreview: snapshot.answerSnapshot.slice(0, PREVIEW_CHAR_LIMIT),
    attachmentSelection: {
      status: "selectable",
      maxSelectable: LAWYER_DOCUMENT_ATTACHMENT_LIMIT,
      documents: eligibility.documents,
      acknowledgedCount: eligibility.acknowledgedCount,
      acknowledgedWithheldCount: eligibility.acknowledgedWithheldCount,
      unavailableCount: eligibility.unavailableCount,
    },
  });
}

export async function POST(request: Request) {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }
  if (!canCreateLawyerClarificationRequest(access.entitlement)) {
    return premiumDeniedResponse();
  }

  const parsed = createRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    const attachmentIssue = parsed.error.issues.find(
      (issue) => issue.path[0] === "attachments"
    );
    if (attachmentIssue) {
      return Response.json(
        {
          error: `You can share at most ${LAWYER_DOCUMENT_ATTACHMENT_LIMIT} documents with the lawyer, and sharing requires an explicit consent flag.`,
        },
        { status: 400 }
      );
    }
    return Response.json(
      {
        error:
          "chatId, assistantMessageId, and an optional customerNote are required.",
      },
      { status: 400 }
    );
  }

  const { chatId, assistantMessageId, customerNote, attachments } = parsed.data;
  const selectedChat = await getChatById({ id: chatId });
  if (!selectedChat || selectedChat.userId !== access.userId) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const existing = await getLawyerClarificationRequestByUserAndAssistantMessage(
    {
      userId: access.userId,
      assistantMessageId,
    }
  );
  if (existing && existing.chatId === chatId) {
    /**
     * Idempotent repeat: the stored request is returned unchanged, with an
     * explicit marker (and its persisted `documentSharing`) so the client never
     * presents this as a new submission with a new attachment selection.
     * Backward compatible: the response body remains the stored summary.
     */
    return Response.json({
      ...customerLawyerRequestSummary(existing),
      existingRequest: true,
    });
  }
  if (existing) {
    return Response.json(
      { error: "Message does not belong to this conversation." },
      { status: 404 }
    );
  }

  const messages = await getMessagesByChatId({ id: chatId });
  const selectedMessage = messages.find(
    (message) => message.id === assistantMessageId
  );
  const targetFailure = validateLawyerRequestTarget({
    authenticatedUserId: access.userId,
    chat: selectedChat,
    requestedChatId: chatId,
    requestedAssistantMessageId: assistantMessageId,
    selectedMessage: selectedMessage ?? null,
  });
  if (targetFailure === "conversation_not_owned") {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (targetFailure) {
    return Response.json(
      { error: "The selected message is not an assistant answer." },
      { status: 400 }
    );
  }

  const snapshot = buildLawyerRequestSnapshot({ messages, assistantMessageId });
  if ("error" in snapshot) {
    return Response.json({ error: snapshot.error }, { status: 400 });
  }
  const metadata = metadataFromParts(selectedMessage?.parts);
  const manifest = metadata?.customerDocumentManifest;
  const manifestDocumentIds = documentIdsFromManifest(manifest);
  /**
   * Phase 12 Stage 2 closure: explicit attachment consent.
   *
   * Nothing is shared because the button was pressed. The customer's selected
   * ids must exist in this answered turn's *server-persisted* manifest, and the
   * selection is never truncated: more than four documents is an explicit error.
   */
  const availability = await documentAvailabilityForTurn({
    userId: access.userId,
    chatId,
    documentIds: manifestDocumentIds,
  });
  const eligibility = listEligibleLawyerDocumentAttachments({
    manifest,
    acknowledgedDocumentIds: metadata?.customerDocumentUsedIds,
    details: availability,
  });
  const selection = selectLawyerDocumentAttachments({
    manifest,
    acknowledgedDocumentIds: metadata?.customerDocumentUsedIds,
    selectedDocumentIds: attachments?.selectedDocumentIds,
  });
  if ("error" in selection) {
    return Response.json({ error: selection.error }, { status: 400 });
  }
  for (const attachment of selection.attachments) {
    if (availability.get(attachment.documentId)?.available === false) {
      return Response.json(
        {
          error:
            "One of the selected documents is no longer available. Uncheck it and try again.",
        },
        { status: 409 }
      );
    }
  }
  let excerptBudget = 12_000;
  for (const attachment of selection.attachments) {
    const exact = await getMatterDocumentEvidenceForLawyerSnapshot({
      documentId: attachment.documentId,
      userId: access.userId,
      chatId,
      runId: attachment.runId,
      ordinals: attachment.includedUnitOrdinals,
    });
    if (!exact) {
      // The customer explicitly asked to share this document, so silently
      // dropping it would misrepresent what was disclosed.
      return Response.json(
        {
          error:
            "One of the selected documents is no longer available for an exact lawyer snapshot. Uncheck it and try again.",
        },
        { status: 409 }
      );
    }
    const reconstructed = reconstructExactLawyerDocumentEvidence({
      manifest: attachment.manifestEntry,
      exact,
      excerptBudget,
    });
    if (!reconstructed) {
      return Response.json(
        {
          error:
            "One of the selected documents cannot be reconstructed exactly for a lawyer snapshot. Uncheck it and try again.",
        },
        { status: 409 }
      );
    }
    excerptBudget = reconstructed.excerptBudget;
    for (const unit of reconstructed.items) {
      snapshot.evidenceSnapshot.push({
        kind: "customer_document",
        document_id: exact.document.id,
        run_id: exact.run.id,
        filename: exact.document.originalFilename,
        run_status: exact.run.status,
        extraction_method: unit.extractionMethod,
        locator: unit.locator,
        quote: unit.quote,
        truncated: unit.truncated,
        used_by_answer: attachment.usedByAnswer,
      });
    }
  }
  const availableAcknowledgedCount = eligibility.documents.filter(
    (document) => document.usedByAnswer
  ).length;
  snapshot.evidenceSnapshot.push(
    buildCustomerDocumentSelectionEvidence({
      eligibleDocumentCount: eligibility.documents.length,
      acknowledgedCount: availableAcknowledgedCount,
      selectedCount: selection.selectedCount,
      acknowledgedSharedCount: selection.acknowledgedSharedCount,
      // Withheld by customer choice, within the documents that were shareable.
      acknowledgedWithheldCount: Math.max(
        0,
        availableAcknowledgedCount - selection.acknowledgedSharedCount
      ),
    })
  );

  const conversation = await getImmigrationConversationByChatId({
    chatId,
    userId: access.userId,
  });

  try {
    const created = await createLawyerRequestWithEvent({
      userId: access.userId,
      chatId,
      userMessageId: snapshot.userMessageId,
      assistantMessageId: snapshot.assistantMessageId,
      legalMatterId: conversation?.legalMatterId ?? null,
      requestSource: requestSourceForRole(access.entitlement.role),
      assistantMode: snapshot.assistantMode,
      snapshotVersion: LAWYER_REQUEST_SNAPSHOT_VERSION,
      questionSnapshot: snapshot.questionSnapshot,
      answerSnapshot: snapshot.answerSnapshot,
      evidenceSnapshot: snapshot.evidenceSnapshot,
      contextSnapshot: snapshot.contextSnapshot,
      customerNote: customerNote || null,
    });
    const staffEmail = process.env.LAWYER_REQUEST_STAFF_EMAIL?.trim();
    if (staffEmail) {
      const { notifyLawyerRequest } = await import(
        "@/lib/lawyer-requests/notifications"
      );
      await notifyLawyerRequest({
        email: staffEmail,
        requestId: created.id,
        recipient: "staff",
        kind: "request_created",
      });
    }
    return Response.json(customerLawyerRequestView(created), { status: 201 });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      const duplicate =
        await getLawyerClarificationRequestByUserAndAssistantMessage({
          userId: access.userId,
          assistantMessageId,
        });
      if (duplicate) {
        return Response.json(customerLawyerRequestSummary(duplicate));
      }
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create lawyer request"
    );
  }
}
