import { z } from "zod";
import {
  getChatById,
  getImmigrationConversationByChatId,
  getLawyerClarificationRequestByUserAndAssistantMessage,
  getMessagesByChatId,
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
  buildLawyerRequestSnapshot,
  LAWYER_REQUEST_SNAPSHOT_VERSION,
} from "@/lib/lawyer-requests/snapshot";
import { validateLawyerRequestTarget } from "@/lib/lawyer-requests/target-validation";
import {
  customerLawyerRequestSummary,
  customerLawyerRequestView,
} from "@/lib/lawyer-requests/views";
import { requireRegisteredUser } from "@/lib/vip/access";
import { premiumDeniedResponse } from "@/lib/vip/entitlement";

const createRequestSchema = z
  .object({
    chatId: z.string().uuid(),
    assistantMessageId: z.string().uuid(),
    customerNote: z.string().trim().max(4000).optional(),
  })
  .strict();

export async function GET(request: Request) {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }

  const chatId = new URL(request.url).searchParams.get("chatId") ?? undefined;
  if (chatId && !z.string().uuid().safeParse(chatId).success) {
    return Response.json({ error: "Invalid chat ID." }, { status: 400 });
  }

  const requests = await listCustomerLawyerRequests(access.userId);
  const filteredRequests = chatId
    ? requests.filter((request) => request.chatId === chatId)
    : requests;
  return Response.json({
    requests: filteredRequests.map(customerLawyerRequestSummary),
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
    return Response.json(
      {
        error:
          "chatId, assistantMessageId, and an optional customerNote are required.",
      },
      { status: 400 }
    );
  }

  const { chatId, assistantMessageId, customerNote } = parsed.data;
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
    return Response.json(customerLawyerRequestSummary(existing));
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
