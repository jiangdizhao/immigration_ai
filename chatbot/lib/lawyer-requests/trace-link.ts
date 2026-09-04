export function buildImmigrationAnswerTraceLinkValues({
  chatId,
  assistantMessageId,
  legalMatterId,
  answerTraceId,
}: {
  chatId: string | null | undefined;
  assistantMessageId: string | null | undefined;
  legalMatterId: string | null | undefined;
  answerTraceId: string | null | undefined;
}) {
  if (!chatId || !assistantMessageId || !answerTraceId) {
    return null;
  }

  return {
    chatId,
    assistantMessageId,
    legalMatterId: legalMatterId ?? null,
    answerTraceId,
  };
}
