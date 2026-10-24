/**
 * Phase 12 Stage 1 R3: conversation origin and read-only interaction contract.
 *
 * Stage 1 R1 started listing owner chats that hold messages but predate the
 * `ImmigrationConversation` row. The history API reports those as
 * `origin: "legacy_chat"`. Project Chats also carry server-derived
 * read-only state; their M1.3 workspace surface permits chat turns only and
 * does not expose documents, guided intake or lawyer review.
 *
 * The rules live here (and not inside the component) so the interactive /
 * read-only decision is one testable, reusable contract for both UI surfaces
 * and their tests.
 */

export type ConversationOrigin = "immigration" | "legacy_chat" | "project";

/** Server values are normalized defensively: anything unknown is a normal chat. */
export function normalizeConversationOrigin(
  value: unknown
): ConversationOrigin {
  if (value === "legacy_chat" || value === "project") {
    return value;
  }
  return "immigration";
}

export type ConversationInteraction = {
  origin: ConversationOrigin;
  /**
   * True once a legacy chat is the applied conversation. While a load is still
   * in flight the workspace keeps the interactive chrome but stays disabled, so
   * the mode can never be half-applied.
   */
  readOnly: boolean;
  /** Send / suggested question / guided intake / uploads / lawyer request. */
  canSubmitMessage: boolean;
  canUseSuggestedQuestions: boolean;
  canUseGuidedIntake: boolean;
  canUploadDocuments: boolean;
  canRequestLawyerReview: boolean;
  canStartNewConversation: boolean;
  /** Browsing retained history never depends on the origin. */
  canBrowseHistory: boolean;
  canLoadOlderMessages: boolean;
};

export function resolveConversationInteraction(input: {
  origin: ConversationOrigin;
  /** Server-derived read-only status for Project Chats. */
  projectReadOnly?: boolean;
  /** The detail for the applied conversation finished loading. */
  conversationReady: boolean;
  /** Another conversation load or create is in flight. */
  conversationLoading?: boolean;
  /** A model turn is running (`status !== "ready"`). */
  turnInFlight?: boolean;
}): ConversationInteraction {
  const isProject = input.origin === "project";
  const readOnly =
    (input.origin === "legacy_chat" ||
      (isProject && input.projectReadOnly === true)) &&
    input.conversationReady;
  const interactive =
    !readOnly && input.conversationReady && !input.conversationLoading;

  return {
    origin: input.origin,
    readOnly,
    canSubmitMessage: interactive && !input.turnInFlight,
    canUseSuggestedQuestions: interactive && !input.turnInFlight,
    canUseGuidedIntake: interactive && !isProject && !input.turnInFlight,
    canUploadDocuments: interactive && !isProject && !input.turnInFlight,
    canRequestLawyerReview: interactive && !isProject,
    canStartNewConversation: !input.conversationLoading,
    canBrowseHistory: true,
    canLoadOlderMessages: true,
  };
}

/**
 * A conversation detail response may only be applied when it belongs to the
 * newest request and to the chat the workspace is switching to. This is what
 * keeps rapid switching and delayed HTTP responses from leaving the UI in the
 * wrong interactive/read-only mode.
 */
export function shouldApplyConversationDetail(input: {
  requestSeq: number;
  latestRequestSeq: number;
  requestedChatId: string;
  loadedChatId: string | null;
}): boolean {
  return (
    input.requestSeq === input.latestRequestSeq &&
    input.loadedChatId === input.requestedChatId
  );
}

/**
 * Paginated history may only be merged when it still belongs to the conversation
 * currently shown.
 */
export function shouldApplyOlderMessages(input: {
  loadedChatId: string | null;
  activeChatId: string | null;
}): boolean {
  return Boolean(
    input.activeChatId && input.loadedChatId === input.activeChatId
  );
}
