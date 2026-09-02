import type {
  LawyerClarificationMessage,
  LawyerClarificationRequest,
} from "@/lib/db/schema";

export function customerLawyerRequestView(
  request: LawyerClarificationRequest,
  messages: Pick<
    LawyerClarificationMessage,
    "id" | "authorRole" | "body" | "createdAt"
  >[] = []
) {
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
