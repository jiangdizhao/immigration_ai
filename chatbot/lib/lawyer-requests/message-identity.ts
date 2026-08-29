export function persistedAssistantMessageIdForReview(message: {
  role: "user" | "assistant";
  persistedAssistantMessageId?: string | null;
}) {
  if (message.role !== "assistant") {
    return null;
  }
  return message.persistedAssistantMessageId ?? null;
}
