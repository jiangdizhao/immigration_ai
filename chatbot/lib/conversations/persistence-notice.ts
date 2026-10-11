/**
 * Phase 12 Stage 1 R1 client-side persistence truth table.
 *
 * The browser must never imply "saved to your account" from a partial write.
 * Only an explicit server `saved: true` (user message + assistant answer both
 * durable and linked) counts as saved; everything else is surfaced as an
 * explicit, retryable state.
 */

export type PersistenceStatusInput =
  | {
      userTurnPersisted?: boolean;
      assistantTurnPersisted?: boolean;
      assistantMessageId?: string | null;
      errorCode?: string | null;
      replayed?: boolean;
      attempts?: number;
      saved?: boolean;
      retryable?: boolean;
      retryAfterMs?: number | null;
    }
  | null
  | undefined;

export type WorkspacePersistenceState = {
  /** True only when the server confirmed a complete, linked durable turn. */
  saved: boolean;
  noticeKind: "none" | "not_saved" | "in_progress" | "not_persisted";
  retryable: boolean;
  retryAfterMs: number | null;
};

export function resolveWorkspacePersistence(
  persistence: PersistenceStatusInput
): WorkspacePersistenceState {
  if (!persistence) {
    // Unscoped/guest callers get no durability claim at all.
    return {
      saved: false,
      noticeKind: "none",
      retryable: false,
      retryAfterMs: null,
    };
  }

  const retryAfterMs =
    typeof persistence.retryAfterMs === "number"
      ? persistence.retryAfterMs
      : null;

  if (persistence.saved === true) {
    return { saved: true, noticeKind: "none", retryable: false, retryAfterMs };
  }

  if (persistence.errorCode === "client_turn_in_progress") {
    return {
      saved: false,
      noticeKind: "in_progress",
      retryable: true,
      retryAfterMs,
    };
  }

  if (persistence.errorCode === "conversation_turn_not_persisted") {
    return {
      saved: false,
      noticeKind: "not_persisted",
      retryable: true,
      retryAfterMs,
    };
  }

  return {
    saved: false,
    noticeKind: "not_saved",
    retryable: persistence.retryable !== false,
    retryAfterMs,
  };
}
