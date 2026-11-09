/**
 * Phase 13 Project Workspace UX: the section the main content area shows while a
 * Project is selected and no Project Chat is open.
 *
 * This value is presentation only. It never authorizes a request: every section
 * reuses the existing owner/Project-guarded M5 endpoints, so a client-supplied
 * section can never widen access. It is also deliberately free of any invented
 * stage, progress or readiness semantics.
 */
export const PROJECT_WORKSPACE_VIEWS = [
  "home",
  "applications",
  "admissions",
  /** Phase 13 M6.1: Student 500 application preparation. */
  "student500",
  /** Phase 13 M9-A: the version-aware Project document centre. */
  "documents",
  /** Phase 13 M9-B: exact-version check/confirmation/lawyer-review surface. */
  "review",
] as const;

export type ProjectWorkspaceView = (typeof PROJECT_WORKSPACE_VIEWS)[number];

export function isProjectWorkspaceView(
  value: unknown
): value is ProjectWorkspaceView {
  return (
    typeof value === "string" &&
    (PROJECT_WORKSPACE_VIEWS as readonly string[]).includes(value)
  );
}

/**
 * Section state must never carry from one Project to another (or survive a
 * cleared selection), otherwise Project B could open on a form whose data was
 * loaded for Project A. A new selection always starts on its own home section.
 */
export function nextProjectWorkspaceView(input: {
  current: ProjectWorkspaceView;
  previousProjectId: string | null;
  nextProjectId: string | null;
}): ProjectWorkspaceView {
  return input.previousProjectId === input.nextProjectId
    ? input.current
    : "home";
}

/**
 * A Project Chat may only stay active for the Project it belongs to. When the
 * selection moves to another Project (or is cleared), the previous Project Chat's
 * identity — and its `chatId` URL parameter — must be dropped, otherwise Project
 * B could display, or a reload could restore, Project A's conversation.
 *
 * A Standalone conversation is intentionally preserved: it is not Project data
 * and the existing neutral-selection behaviour keeps it in history/list state.
 */
export function projectSwitchClearsConversation(input: {
  previousProjectId: string | null;
  nextProjectId: string | null;
  conversationOrigin: "immigration" | "legacy_chat" | "project";
}): boolean {
  return (
    input.previousProjectId !== input.nextProjectId &&
    input.conversationOrigin === "project"
  );
}

/**
 * The workspace URL without the active-conversation parameters. Used when the
 * main area returns to a Project home so a reload cannot restore the Chat that
 * was just left. Unrelated parameters (for example a policy slug) are preserved.
 */
export function workspaceUrlWithoutChat(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("chatId");
  url.searchParams.delete("launch");
  return url.toString();
}
