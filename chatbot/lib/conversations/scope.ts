/**
 * Phase 12 Stage 1 conversation scope contracts.
 *
 * These types reserve a future optional GPT-like "Project" dimension without
 * implementing any Project feature: there is no Project table, membership,
 * shared memory, project document sharing or Project UI in this stage. A
 * non-project conversation always carries `projectId: null` and remains fully
 * supported.
 *
 * A future user Project must never be conflated with the legal `Matter`
 * identity, which is server-owned and validated against the authenticated
 * user's conversation.
 */

export type ConversationSurface = "fast" | "default" | "premium";

export type ProjectScope = {
  /** Reserved for a future product-level grouping. Always null in Stage 1. */
  projectId: null;
};

export type ConversationContextScope = ProjectScope & {
  userId: string;
  conversationId: string;
  /**
   * Server-owned legal Matter identity resolved from the owned conversation.
   * A client-supplied matter identifier never becomes authoritative.
   */
  matterId: string | null;
};

export type ConversationScopeInput = {
  userId: string;
  conversationId: string;
  matterId?: string | null;
  projectId?: string | null;
};

export function conversationContextScope(
  input: ConversationScopeInput
): ConversationContextScope {
  return {
    userId: input.userId,
    conversationId: input.conversationId,
    matterId: input.matterId ?? null,
    projectId: null,
  };
}

/**
 * Document access scope. `conversationIds` bounds which conversations may
 * contribute evidence to an answer; the owner-level history index is a
 * separate read surface and never widens AI working context.
 */
export type DocumentAccessScope = ProjectScope & {
  userId: string;
  conversationIds: readonly string[];
  includeUserHistoryIndex: boolean;
};

export function conversationDocumentAccessScope(
  scope: ConversationContextScope
): DocumentAccessScope {
  return {
    userId: scope.userId,
    conversationIds: [scope.conversationId],
    includeUserHistoryIndex: false,
    projectId: null,
  };
}

/**
 * Memory scope. Stage 1 keeps memory confined to one conversation; no
 * cross-conversation or Project-scoped memory exists yet.
 */
export type MemoryScope = ProjectScope & {
  conversationId: string;
  sharedAcrossConversations: false;
};

export function conversationMemoryScope(
  scope: ConversationContextScope
): MemoryScope {
  return {
    conversationId: scope.conversationId,
    sharedAcrossConversations: false,
    projectId: null,
  };
}
