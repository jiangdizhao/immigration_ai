/**
 * Phase 13 M9-A — the closed vocabulary of Project workflow steps that may own a
 * persisted step conversation.
 *
 * This module is intentionally dependency-free so the same constants are used by
 * the database schema, the server route, the pure view layer and the client UI
 * without dragging Drizzle or server-only code into a browser bundle.
 *
 * The list is a *navigation* vocabulary, not a legal checklist: it names the real
 * workspace surfaces the product already has, and nothing here implies that a step
 * is required, complete, eligible or approved.
 */
export const PROJECT_CONVERSATION_STAGE_KEYS = [
  "school_applications",
  "school_admissions",
  "student500",
] as const;

export type ProjectConversationStageKey =
  (typeof PROJECT_CONVERSATION_STAGE_KEYS)[number];

export function isProjectConversationStageKey(
  value: unknown
): value is ProjectConversationStageKey {
  return (
    typeof value === "string" &&
    (PROJECT_CONVERSATION_STAGE_KEYS as readonly string[]).includes(value)
  );
}
