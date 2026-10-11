import { createHash } from "node:crypto";

/**
 * Durable, owner-authorized conversation turn ledger.
 *
 * Reliability contract (Phase 12 Stage 1):
 *  - the user turn is written durably before the model/agent stage starts;
 *  - the assistant turn is written durably after generation and the caller must
 *    not report "saved" unless the durable write actually succeeded;
 *  - a repeated request with the same `clientTurnId` is idempotent: it never
 *    duplicates the user or assistant message;
 *  - an already-completed turn is replayed from storage instead of re-running
 *    the expensive model stage;
 *  - a crash between the user write and the assistant write is recovered from
 *    the persisted pending assistant payload without another model call;
 *  - no database transaction is held open across the long-running model call.
 *
 * Concurrency safety comes from the `ConversationTurn` unique
 * `(chatId, clientTurnId)` index plus `ON CONFLICT DO NOTHING` claims.
 */

export const CLIENT_TURN_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/u;
export const MAX_TURN_ATTEMPTS = 12;

export type ConversationTurnStatus =
  | "user_persisted"
  | "assistant_persisted"
  | "failed";

export type ConversationTurnRecord = {
  id: string;
  chatId: string;
  userId: string;
  clientTurnId: string;
  assistantMode: string | null;
  requestHash: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  status: ConversationTurnStatus;
  attemptCount: number;
  errorCode: string | null;
  pendingAssistantParts: unknown[] | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedMessageRecord = {
  id: string;
  chatId: string;
  role: string;
  parts: unknown;
};

export type ConversationTurnRepository = {
  getOwnedConversation(input: {
    chatId: string;
    userId: string;
  }): Promise<{ chatId: string; legalMatterId: string | null } | null>;
  getTurn(input: {
    chatId: string;
    clientTurnId: string;
  }): Promise<ConversationTurnRecord | null>;
  claimTurn(input: {
    chatId: string;
    userId: string;
    clientTurnId: string;
    assistantMode: string | null;
    requestHash: string;
    userMessageId: string;
    now: Date;
  }): Promise<{ turn: ConversationTurnRecord; created: boolean }>;
  recordUserMessageId(input: {
    turnId: string;
    userMessageId: string;
    now: Date;
  }): Promise<ConversationTurnRecord | null>;
  recordAttempt(input: {
    turnId: string;
    now: Date;
  }): Promise<ConversationTurnRecord | null>;
  storePendingAssistantParts(input: {
    turnId: string;
    parts: unknown[];
    now: Date;
  }): Promise<ConversationTurnRecord | null>;
  completeTurn(input: {
    turnId: string;
    assistantMessageId: string;
    now: Date;
  }): Promise<ConversationTurnRecord | null>;
  failTurn(input: {
    turnId: string;
    errorCode: string;
    now: Date;
  }): Promise<ConversationTurnRecord | null>;
  insertMessageIdempotent(input: {
    chatId: string;
    messageId: string;
    role: "user" | "assistant";
    parts: unknown[];
    createdAt: Date;
  }): Promise<{ inserted: boolean; message: PersistedMessageRecord | null }>;
  getMessage(input: {
    chatId: string;
    messageId: string;
  }): Promise<PersistedMessageRecord | null>;
};

export class ConversationTurnInputError extends Error {
  readonly code = "invalid_client_turn_id";

  constructor() {
    super("Invalid client turn identifier.");
    this.name = "ConversationTurnInputError";
  }
}

export class ConversationTurnOwnershipError extends Error {
  readonly code = "conversation_not_owned";

  constructor() {
    super("Conversation not found for this account.");
    this.name = "ConversationTurnOwnershipError";
  }
}

export type BeginTurnResult = {
  /** True when the caller may run the model stage for this turn. */
  ok: boolean;
  kind: "fresh" | "resumed" | "replayed" | "conflict" | "unavailable";
  clientTurnId: string;
  turnId: string | null;
  userTurnPersisted: boolean;
  userMessageId: string;
  attemptCount: number;
  durabilityError: string | null;
  replay: { assistantMessageId: string; parts: unknown[] } | null;
  pendingAssistantParts: unknown[] | null;
};

export type CompleteTurnResult = {
  assistantTurnPersisted: boolean;
  assistantMessageId: string | null;
  alreadyPersisted: boolean;
  errorCode: string | null;
};

export function requestHashForQuestion(question: string): string {
  return createHash("sha256").update(question, "utf8").digest("hex");
}

export function createConversationTurnService(deps: {
  repository: ConversationTurnRepository;
  now?: () => Date;
  newId?: () => string;
}) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  type OwnershipResolution =
    | {
        status: "owned";
        conversation: { chatId: string; legalMatterId: string | null };
      }
    | { status: "not_owned" }
    | { status: "unavailable" };

  /**
   * Ownership is verified against the owner-scoped conversation lookup. An
   * infrastructure error is reported as `unavailable` and never silently
   * upgraded into "owned".
   */
  async function resolveOwnership(input: {
    userId: string;
    chatId: string;
  }): Promise<OwnershipResolution> {
    try {
      const conversation = await deps.repository.getOwnedConversation(input);
      return conversation
        ? { status: "owned", conversation }
        : { status: "not_owned" };
    } catch {
      return { status: "unavailable" };
    }
  }
  async function insertMessage(input: {
    chatId: string;
    messageId: string;
    role: "user" | "assistant";
    parts: unknown[];
    createdAt: Date;
  }): Promise<{ durable: boolean; errorCode: string | null }> {
    try {
      const insertion = await deps.repository.insertMessageIdempotent(input);
      if (insertion.inserted) {
        return { durable: true, errorCode: null };
      }
      const existing =
        insertion.message ??
        (await deps.repository.getMessage({
          chatId: input.chatId,
          messageId: input.messageId,
        }));
      if (
        existing &&
        existing.chatId === input.chatId &&
        existing.role === input.role
      ) {
        return { durable: true, errorCode: null };
      }
      return { durable: false, errorCode: "message_id_conflict" };
    } catch {
      return { durable: false, errorCode: "message_write_failed" };
    }
  }

  async function persistUserTurn(context: {
    input: {
      userId: string;
      chatId: string;
      clientTurnId: string;
      question: string;
      userMessageId?: string | null;
      assistantMode?: string | null;
    };
    claim: { turn: ConversationTurnRecord; created: boolean };
    turn: ConversationTurnRecord;
    userMessageId: string;
  }): Promise<BeginTurnResult> {
    const { input } = context;
    let turn = context.turn;
    const durableUserMessageId = turn.userMessageId ?? context.userMessageId;
    const inserted = await insertMessage({
      chatId: input.chatId,
      messageId: durableUserMessageId,
      role: "user",
      parts: [{ type: "text", text: input.question }],
      createdAt: turn.createdAt,
    });
    let durabilityError = inserted.errorCode;
    if (!turn.userMessageId && inserted.durable) {
      try {
        const updated = await deps.repository.recordUserMessageId({
          turnId: turn.id,
          userMessageId: durableUserMessageId,
          now: now(),
        });
        if (updated) {
          turn = updated;
        }
      } catch {
        durabilityError = "user_turn_ledger_write_failed";
      }
    }

    let attemptCount = turn.attemptCount;
    if (!context.claim.created) {
      try {
        const attempted = await deps.repository.recordAttempt({
          turnId: turn.id,
          now: now(),
        });
        attemptCount = attempted?.attemptCount ?? attemptCount + 1;
      } catch {
        attemptCount += 1;
      }
    }

    if (turn.status === "assistant_persisted" && turn.assistantMessageId) {
      const stored = await deps.repository
        .getMessage({
          chatId: input.chatId,
          messageId: turn.assistantMessageId,
        })
        .catch(() => null);
      if (stored?.id === turn.assistantMessageId) {
        return {
          clientTurnId: input.clientTurnId,
          userMessageId: durableUserMessageId,
          ok: false,
          kind: "replayed",
          turnId: turn.id,
          userTurnPersisted: inserted.durable,
          attemptCount,
          durabilityError,
          replay: {
            assistantMessageId: turn.assistantMessageId,
            parts: Array.isArray(stored.parts) ? stored.parts : [],
          },
          pendingAssistantParts: null,
        };
      }
    }

    const pendingAssistantParts =
      turn.status !== "assistant_persisted" &&
      Array.isArray(turn.pendingAssistantParts) &&
      turn.pendingAssistantParts.length > 0
        ? turn.pendingAssistantParts
        : null;

    return {
      clientTurnId: input.clientTurnId,
      userMessageId: durableUserMessageId,
      ok: true,
      kind: context.claim.created ? "fresh" : "resumed",
      turnId: turn.id,
      userTurnPersisted: inserted.durable,
      attemptCount,
      durabilityError,
      replay: null,
      pendingAssistantParts,
    };
  }

  async function beginTurn(input: {
    userId: string;
    chatId: string;
    clientTurnId: string;
    question: string;
    userMessageId?: string | null;
    assistantMode?: string | null;
  }): Promise<BeginTurnResult> {
    if (!CLIENT_TURN_ID_PATTERN.test(input.clientTurnId)) {
      throw new ConversationTurnInputError();
    }
    const userMessageId = input.userMessageId ?? newId();
    const requestHash = requestHashForQuestion(input.question);
    const base = { clientTurnId: input.clientTurnId, userMessageId };

    const ownership = await resolveOwnership({
      userId: input.userId,
      chatId: input.chatId,
    });
    if (ownership.status === "not_owned") {
      throw new ConversationTurnOwnershipError();
    }
    if (ownership.status === "unavailable") {
      return {
        ...base,
        ok: true,
        kind: "unavailable",
        turnId: null,
        userTurnPersisted: false,
        attemptCount: 0,
        durabilityError: "conversation_ownership_unverified",
        replay: null,
        pendingAssistantParts: null,
      };
    }

    let claim: { turn: ConversationTurnRecord; created: boolean };
    try {
      claim = await deps.repository.claimTurn({
        chatId: input.chatId,
        userId: input.userId,
        clientTurnId: input.clientTurnId,
        assistantMode: input.assistantMode ?? null,
        requestHash,
        userMessageId,
        now: now(),
      });
    } catch {
      // The customer answer must survive a persistence outage, but the caller
      // may never report the turn as durably saved.
      return {
        ...base,
        ok: true,
        kind: "unavailable",
        turnId: null,
        userTurnPersisted: false,
        attemptCount: 0,
        durabilityError: "conversation_turn_claim_failed",
        replay: null,
        pendingAssistantParts: null,
      };
    }

    const turn = claim.turn;
    if (turn.requestHash && turn.requestHash !== requestHash) {
      return {
        ...base,
        ok: false,
        kind: "conflict",
        turnId: turn.id,
        userTurnPersisted: false,
        attemptCount: turn.attemptCount,
        durabilityError: "client_turn_id_reused_for_different_question",
        replay: null,
        pendingAssistantParts: null,
      };
    }
    return await persistUserTurn({
      input,
      claim,
      turn,
      userMessageId,
    });
  }

  /**
   * Durable post-generation write. Stores the assistant payload before the
   * message row so a crash or write failure can be repaired by retrying the
   * same client turn without another model call.
   */
  async function completeTurn(input: {
    userId: string;
    chatId: string;
    clientTurnId: string;
    parts: unknown[];
    assistantMessageId?: string | null;
  }): Promise<CompleteTurnResult> {
    if (!CLIENT_TURN_ID_PATTERN.test(input.clientTurnId)) {
      throw new ConversationTurnInputError();
    }
    const ownership = await resolveOwnership({
      userId: input.userId,
      chatId: input.chatId,
    });
    if (ownership.status === "not_owned") {
      throw new ConversationTurnOwnershipError();
    }
    if (ownership.status === "unavailable") {
      return {
        assistantTurnPersisted: false,
        assistantMessageId: null,
        alreadyPersisted: false,
        errorCode: "conversation_ownership_unverified",
      };
    }

    const turn = await deps.repository
      .getTurn({
        chatId: input.chatId,
        clientTurnId: input.clientTurnId,
      })
      .catch(() => null);
    if (!turn) {
      return {
        assistantTurnPersisted: false,
        assistantMessageId: null,
        alreadyPersisted: false,
        errorCode: "conversation_turn_missing",
      };
    }
    if (turn.userId !== input.userId) {
      throw new ConversationTurnOwnershipError();
    }

    if (turn.status === "assistant_persisted" && turn.assistantMessageId) {
      const stored = await deps.repository
        .getMessage({
          chatId: input.chatId,
          messageId: turn.assistantMessageId,
        })
        .catch(() => null);
      if (stored?.id === turn.assistantMessageId) {
        return {
          assistantTurnPersisted: true,
          assistantMessageId: turn.assistantMessageId,
          alreadyPersisted: true,
          errorCode: null,
        };
      }
    }

    const assistantMessageId =
      input.assistantMessageId ?? turn.assistantMessageId ?? newId();
    let payloadError: string | null = null;
    try {
      await deps.repository.storePendingAssistantParts({
        turnId: turn.id,
        parts: input.parts,
        now: now(),
      });
    } catch {
      payloadError = "assistant_payload_write_failed";
    }

    const inserted = await insertMessage({
      chatId: input.chatId,
      messageId: assistantMessageId,
      role: "assistant",
      parts: input.parts,
      createdAt: new Date(turn.createdAt.getTime() + 1),
    });

    if (!inserted.durable) {
      await deps.repository
        .failTurn({
          turnId: turn.id,
          errorCode: inserted.errorCode ?? "message_write_failed",
          now: now(),
        })
        .catch(() => null);
      return {
        assistantTurnPersisted: false,
        assistantMessageId: null,
        alreadyPersisted: false,
        errorCode: inserted.errorCode ?? "message_write_failed",
      };
    }

    try {
      await deps.repository.completeTurn({
        turnId: turn.id,
        assistantMessageId,
        now: now(),
      });
    } catch {
      return {
        assistantTurnPersisted: true,
        assistantMessageId,
        alreadyPersisted: false,
        errorCode: payloadError ?? "assistant_turn_ledger_write_failed",
      };
    }

    return {
      assistantTurnPersisted: true,
      assistantMessageId,
      alreadyPersisted: false,
      errorCode: payloadError,
    };
  }

  async function failTurn(input: {
    userId: string;
    chatId: string;
    clientTurnId: string;
    errorCode: string;
  }): Promise<boolean> {
    if (!CLIENT_TURN_ID_PATTERN.test(input.clientTurnId)) {
      return false;
    }
    const turn = await deps.repository
      .getTurn({ chatId: input.chatId, clientTurnId: input.clientTurnId })
      .catch(() => null);
    if (!turn || turn.userId !== input.userId) {
      return false;
    }
    const failed = await deps.repository
      .failTurn({
        turnId: turn.id,
        errorCode: input.errorCode.slice(0, 64),
        now: now(),
      })
      .catch(() => null);
    return Boolean(failed);
  }

  async function readTurn(input: {
    userId: string;
    chatId: string;
    clientTurnId: string;
  }): Promise<ConversationTurnRecord | null> {
    const ownership = await resolveOwnership({
      userId: input.userId,
      chatId: input.chatId,
    });
    if (ownership.status === "not_owned") {
      throw new ConversationTurnOwnershipError();
    }
    if (ownership.status === "unavailable") {
      return null;
    }
    const turn = await deps.repository.getTurn({
      chatId: input.chatId,
      clientTurnId: input.clientTurnId,
    });
    return turn && turn.userId === input.userId ? turn : null;
  }

  return { beginTurn, completeTurn, failTurn, readTurn };
}
