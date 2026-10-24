export function projectChatWritesEnabled(
  value: string | undefined = process.env.PHASE13_PROJECT_CHAT_ENABLED
): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function projectChatIdentifierRequiresScopedIngress(input: {
  projectChatIds: readonly string[];
  frontendChatId?: string | null;
}): boolean {
  return input.projectChatIds.some((chatId) => chatId !== input.frontendChatId);
}
