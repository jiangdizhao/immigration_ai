type TargetChat = {
  id: string;
  userId: string;
};

type TargetMessage = {
  id: string;
  chatId: string;
  role: string;
};

export type LawyerRequestTargetFailure =
  | "conversation_not_owned"
  | "message_not_in_conversation"
  | "not_assistant";

export function validateLawyerRequestTarget({
  authenticatedUserId,
  chat,
  requestedChatId,
  requestedAssistantMessageId,
  selectedMessage,
}: {
  authenticatedUserId: string;
  chat: TargetChat | null;
  requestedChatId: string;
  requestedAssistantMessageId: string;
  selectedMessage: TargetMessage | null;
}): LawyerRequestTargetFailure | null {
  if (!chat || chat.userId !== authenticatedUserId) {
    return "conversation_not_owned";
  }
  if (
    !selectedMessage ||
    selectedMessage.id !== requestedAssistantMessageId ||
    selectedMessage.chatId !== requestedChatId
  ) {
    return "message_not_in_conversation";
  }
  if (selectedMessage.role !== "assistant") {
    return "not_assistant";
  }
  return null;
}
