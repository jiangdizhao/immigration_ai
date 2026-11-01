import { defaultOnCapability } from "@/lib/platform/capability-environment";

/**
 * Project Chat write capability.
 *
 * Phase 13 P1: Project is a foundational product capability, so this is ON by
 * default and `PHASE13_PROJECT_CHAT_ENABLED` now only acts as an explicit
 * emergency disable (`false`/`0`/`off`/`no`/`disabled`). An unset flag must
 * never silently hide Project creation or Project Chat.
 *
 * Read-only history for a closed Project, or for an explicitly disabled
 * capability, is unchanged: writes fail closed, reads stay available.
 */
export function projectChatWritesEnabled(
  value: string | undefined = process.env.PHASE13_PROJECT_CHAT_ENABLED
): boolean {
  return defaultOnCapability(value);
}

export function projectChatIdentifierRequiresScopedIngress(input: {
  projectChatIds: readonly string[];
  frontendChatId?: string | null;
}): boolean {
  return input.projectChatIds.some((chatId) => chatId !== input.frontendChatId);
}
