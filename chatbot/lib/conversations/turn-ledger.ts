import { createHash } from "node:crypto";

import {
  deterministicMessageId,
  matchesImmutableMessage,
} from "./message-identity";

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
 * Concurrency safety comes from three mechanisms:
 *  1. the `ConversationTurn` unique `(chatId, clientTurnId)` index plus
 *     `ON CONFLICT DO NOTHING` claims;
 *  2. a durable execution lease (`executionOwnerId` + `executionAttempt`) so
 *     exactly one attempt may run the model for a turn and a superseded attempt
 *     can never regain write authority;
 *  3. atomic finalization: the assistant message row, the terminal turn
 *     transition and the payload clearing commit in one transaction that
 *     re-verifies the lease on the locked turn row, so a stale attempt cannot
 *     insert a message, finalize the turn or clear another owner's payload.
 */

export const CLIENT_TURN_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/u;
export const MAX_TURN_ATTEMPTS = 12;
/**
 * Phase 12 Stage 1 R1 execution lease budget. The lease is deliberately shorter
 * than the longest allowed answer runtime because a live attempt renews it;
 * only a crashed/stalled attempt lets the lease expire and become stealable.
 */
export const TURN_EXECUTION_LEASE_MS = 120_000;
export const TURN_EXECUTION_LEASE_RENEW_MS = 30_000;
export const TURN_RETRY_AFTER_MIN_MS = 500;
export const TURN_RETRY_AFTER_MAX_MS = 5000;

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
  executionOwnerId: string | null;
  executionLeaseExpiresAt: Date | null;
  executionAttempt: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedMessageRecord = {
  id: string;
  chatId: string;
  role: string;
  parts: unknown;
  attachments: unknown;
};

/**
 * Result of the atomic finalization. `fence_lost` covers a taken-over lease and
 * a superseded attempt number; `message_conflict` means the deterministic id is
 * owned by a different message and nothing was written.
 */
export type TurnFinalizeResult =
  | {
      outcome: "completed" | "already_completed";
      turn: ConversationTurnRecord;
      linkVerified: boolean;
    }
  | { outcome: "fence_lost"; turn: ConversationTurnRecord | null }
  | { outcome: "message_conflict"; turn: ConversationTurnRecord }
  | { outcome: "write_failed" };

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
  /**
   * Atomic exclusive-execution claim. Returns the turn only when this caller now
   * owns the execution lease; `null` means another live attempt owns it.
   */
  acquireExecution(input: {
    turnId: string;
    ownerId: string;
    leaseMs: number;
    now: Date;
  }): Promise<ConversationTurnRecord | null>;
  renewExecution(input: {
    turnId: string;
    ownerId: string;
    executionAttempt: number;
    leaseMs: number;
    now: Date;
  }): Promise<ConversationTurnRecord | null>;
  storePendingAssistantParts(input: {
    turnId: string;
    ownerId: string;
    executionAttempt: number;
    parts: unknown[];
    now: Date;
  }): Promise<ConversationTurnRecord | null>;
  /**
   * Phase 12 Stage 1 R2: the assistant message row, the terminal turn
   * transition and the payload clearing commit in one transaction whose fence
   * is re-verified on the locked turn row. There is deliberately no separate
   * "insert assistant message" repository method any more.
   */
  finalizeTurn(input: {
    turnId: string;
    ownerId: string;
    executionAttempt: number;
    chatId: string;
    assistantMessageId: string;
    parts: unknown[];
    createdAt: Date;
    now: Date;
  }): Promise<TurnFinalizeResult>;
  failTurn(input: {
    turnId: string;
    ownerId: string | null;
    executionAttempt?: number | null;
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

// Message identity (fingerprints, deterministic ids and immutable-message
// comparison) lives in ./message-identity so the ledger and the database
// finalization transaction share exactly one implementation.
export { deterministicMessageId, partsFingerprint } from "./message-identity";

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
  /** True only when the caller owns the execution lease and may run the model. */
  ok: boolean;
  kind:
    | "fresh"
    | "resumed"
    | "replayed"
    | "conflict"
    | "persistence_failed"
    | "in_progress";
  clientTurnId: string;
  turnId: string | null;
  /**
   * Fencing token the caller must present to complete or fail this turn. The
   * pair (executionOwnerId, executionAttempt) is the whole fence: the attempt
   * number prevents a superseded attempt from regaining authority later.
   */
  executionOwnerId: string | null;
  executionAttempt: number | null;
  leaseExpiresAt: Date | null;
  userTurnPersisted: boolean;
  userMessageId: string;
  attemptCount: number;
  durabilityError: string | null;
  /** Suggested delay before retrying an in-progress or failed turn. */
  retryAfterMs: number | null;
  replay: { assistantMessageId: string; parts: unknown[] } | null;
  pendingAssistantParts: unknown[] | null;
};

export type CompleteTurnResult = {
  assistantTurnPersisted: boolean;
  assistantMessageId: string | null;
  alreadyPersisted: boolean;
  /** True only when user + assistant records are durable and linked. */
  linkVerified: boolean;
  saved: boolean;
  errorCode: string | null;
  retryable: boolean;
};

export type TurnExecutionHeartbeat = {
  /** Stops renewals and reports how often renewal failed. */
  stop(): { renewalFailures: number; leaseLost: boolean };
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
      if (!existing) {
        return { durable: false, errorCode: "message_write_failed" };
      }
      // An id collision is an idempotent retry only for the same immutable
      // message: same chat, same role, same parts and same attachments. Any
      // other reuse fails deterministically and the stored row is untouched.
      if (existing.chatId !== input.chatId || existing.role !== input.role) {
        return { durable: false, errorCode: "message_id_conflict" };
      }
      if (!matchesImmutableMessage(existing, input)) {
        return { durable: false, errorCode: "message_id_content_conflict" };
      }
      return { durable: true, errorCode: null };
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
    const base = {
      clientTurnId: input.clientTurnId,
      userMessageId: durableUserMessageId,
      executionOwnerId: null,
      executionAttempt: null,
      leaseExpiresAt: null,
      replay: null,
      pendingAssistantParts: null,
      retryAfterMs: null,
    };

    const inserted = await insertMessage({
      chatId: input.chatId,
      messageId: durableUserMessageId,
      role: "user",
      parts: [{ type: "text", text: input.question }],
      createdAt: turn.createdAt,
    });
    let durabilityError = inserted.errorCode;
    // Phase 12 Stage 1 R1: a durable conversation must not silently proceed when
    // its own user message could not be stored. The caller is told to retry
    // instead of receiving an answer that can never be part of the history.
    if (!inserted.durable) {
      return {
        ...base,
        ok: false,
        kind: "persistence_failed",
        turnId: turn.id,
        userTurnPersisted: false,
        attemptCount: turn.attemptCount,
        durabilityError: durabilityError ?? "message_write_failed",
        retryAfterMs: TURN_RETRY_AFTER_MIN_MS,
      };
    }
    if (!turn.userMessageId) {
      try {
        const updated = await deps.repository.recordUserMessageId({
          turnId: turn.id,
          userMessageId: durableUserMessageId,
          now: now(),
        });
        if (!updated || updated.userMessageId !== durableUserMessageId) {
          durabilityError = "user_turn_ledger_write_failed";
        } else {
          turn = updated;
        }
      } catch {
        durabilityError = "user_turn_ledger_write_failed";
      }
    }
    if (durabilityError) {
      // Without a verified ledger link a later retry cannot prove this turn is
      // the same stored user message, so the contract is not yet durable.
      return {
        ...base,
        ok: false,
        kind: "persistence_failed",
        turnId: turn.id,
        userTurnPersisted: false,
        attemptCount: turn.attemptCount,
        durabilityError,
        retryAfterMs: TURN_RETRY_AFTER_MIN_MS,
      };
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

    const replayResult = async (): Promise<BeginTurnResult | null> => {
      if (turn.status !== "assistant_persisted" || !turn.assistantMessageId) {
        return null;
      }
      const stored = await deps.repository
        .getMessage({
          chatId: input.chatId,
          messageId: turn.assistantMessageId,
        })
        .catch(() => null);
      if (stored?.id !== turn.assistantMessageId) {
        return null;
      }
      return {
        ...base,
        ok: false,
        kind: "replayed",
        turnId: turn.id,
        userTurnPersisted: true,
        attemptCount,
        durabilityError: null,
        replay: {
          assistantMessageId: turn.assistantMessageId,
          parts: Array.isArray(stored.parts) ? stored.parts : [],
        },
      };
    };

    const replay = await replayResult();
    if (replay) {
      return replay;
    }

    // Phase 12 Stage 1 R1: exactly one live attempt may execute the model stage
    // for this turn. The lease is an atomic compare-and-set on the turn row; a
    // caller that loses the race is told the turn is already in progress.
    const ownerId = newId();
    const acquired = await deps.repository
      .acquireExecution({
        turnId: turn.id,
        ownerId,
        leaseMs: TURN_EXECUTION_LEASE_MS,
        now: now(),
      })
      .catch(() => null);
    if (!acquired) {
      const current = await deps.repository
        .getTurn({ chatId: input.chatId, clientTurnId: input.clientTurnId })
        .catch(() => null);
      const alreadyCompleted = current
        ? await (async () => {
            turn = current;
            return await replayResult();
          })()
        : null;
      if (alreadyCompleted) {
        return alreadyCompleted;
      }
      const leaseRemaining = current?.executionLeaseExpiresAt
        ? current.executionLeaseExpiresAt.getTime() - now().getTime()
        : TURN_RETRY_AFTER_MIN_MS;
      return {
        ...base,
        ok: false,
        kind: "in_progress",
        turnId: turn.id,
        userTurnPersisted: true,
        attemptCount,
        durabilityError: "turn_execution_in_progress",
        retryAfterMs: Math.min(
          Math.max(leaseRemaining, TURN_RETRY_AFTER_MIN_MS),
          TURN_RETRY_AFTER_MAX_MS
        ),
      };
    }

    turn = acquired;
    const pendingAssistantParts =
      turn.status !== "assistant_persisted" &&
      Array.isArray(turn.pendingAssistantParts) &&
      turn.pendingAssistantParts.length > 0
        ? turn.pendingAssistantParts
        : null;

    return {
      ...base,
      ok: true,
      kind: context.claim.created ? "fresh" : "resumed",
      turnId: turn.id,
      executionOwnerId: ownerId,
      executionAttempt: turn.executionAttempt,
      leaseExpiresAt: turn.executionLeaseExpiresAt,
      userTurnPersisted: true,
      attemptCount,
      durabilityError: null,
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
    // The durable user message id is server-controlled and stable per turn even
    // when the client does not supply one (repairs and server-initiated retries),
    // so the same turn can never accumulate duplicate user messages.
    const userMessageId =
      input.userMessageId ??
      deterministicMessageId(`user:${input.chatId}:${input.clientTurnId}`);
    const requestHash = requestHashForQuestion(input.question);
    const base = {
      clientTurnId: input.clientTurnId,
      userMessageId,
      executionOwnerId: null,
      executionAttempt: null,
      leaseExpiresAt: null,
      replay: null,
      pendingAssistantParts: null,
      retryAfterMs: null,
    };

    const ownership = await resolveOwnership({
      userId: input.userId,
      chatId: input.chatId,
    });
    if (ownership.status === "not_owned") {
      throw new ConversationTurnOwnershipError();
    }
    if (ownership.status === "unavailable") {
      // Phase 12 Stage 1 R1: an authenticated, persistable conversation whose
      // durable user turn cannot be established must fail closed and be
      // retryable rather than silently answering without durable history.
      return {
        ...base,
        ok: false,
        kind: "persistence_failed",
        turnId: null,
        userTurnPersisted: false,
        attemptCount: 0,
        durabilityError: "conversation_ownership_unverified",
        retryAfterMs: TURN_RETRY_AFTER_MIN_MS,
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
      return {
        ...base,
        ok: false,
        kind: "persistence_failed",
        turnId: null,
        userTurnPersisted: false,
        attemptCount: 0,
        durabilityError: "conversation_turn_claim_failed",
        retryAfterMs: TURN_RETRY_AFTER_MIN_MS,
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
    /** Required: the fencing token issued by `beginTurn`. */
    executionOwnerId: string;
    /** Required: the attempt number issued together with the token. */
    executionAttempt: number;
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
        linkVerified: false,
        saved: false,
        errorCode: "conversation_ownership_unverified",
        retryable: true,
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
        linkVerified: false,
        saved: false,
        errorCode: "conversation_turn_missing",
        retryable: true,
      };
    }
    if (turn.userId !== input.userId) {
      throw new ConversationTurnOwnershipError();
    }

    const verifyUserLink = async (
      record: ConversationTurnRecord
    ): Promise<boolean> => {
      if (!record.userMessageId) {
        return false;
      }
      const storedUserMessage = await deps.repository
        .getMessage({ chatId: input.chatId, messageId: record.userMessageId })
        .catch(() => null);
      return Boolean(
        storedUserMessage &&
          storedUserMessage.id === record.userMessageId &&
          storedUserMessage.role === "user"
      );
    };

    const completedResult = async (
      record: ConversationTurnRecord
    ): Promise<CompleteTurnResult> => {
      const linkVerified = await verifyUserLink(record);
      return {
        assistantTurnPersisted: true,
        assistantMessageId: record.assistantMessageId,
        alreadyPersisted: true,
        linkVerified,
        saved: linkVerified,
        errorCode: linkVerified ? null : "user_turn_link_missing",
        retryable: !linkVerified,
      };
    };

    if (turn.status === "assistant_persisted" && turn.assistantMessageId) {
      const stored = await deps.repository
        .getMessage({
          chatId: input.chatId,
          messageId: turn.assistantMessageId,
        })
        .catch(() => null);
      if (stored?.id === turn.assistantMessageId) {
        // Another attempt (or an earlier retry) already produced the durable
        // answer. Never overwrite it with this attempt's content.
        return await completedResult(turn);
      }
    }

    // Fencing: a late or obsolete attempt whose lease was taken over, or whose
    // attempt number was superseded, may not write the message row, the pending
    // payload or the terminal state. The authoritative check happens inside the
    // finalization transaction below.
    if (
      turn.executionOwnerId !== input.executionOwnerId ||
      turn.executionAttempt !== input.executionAttempt
    ) {
      return {
        assistantTurnPersisted: false,
        assistantMessageId: null,
        alreadyPersisted: false,
        linkVerified: false,
        saved: false,
        errorCode: "turn_execution_lease_lost",
        retryable: true,
      };
    }

    const assistantMessageId = deterministicMessageId(`assistant:${turn.id}`);

    // The payload is stored before the message row so a failure between the two
    // can be repaired by retrying the same client turn without another model
    // call. It is fenced by the same lease and is cleared in the same
    // transaction that finalizes the turn.
    const storedPayload = await deps.repository
      .storePendingAssistantParts({
        turnId: turn.id,
        ownerId: input.executionOwnerId,
        executionAttempt: input.executionAttempt,
        parts: input.parts,
        now: now(),
      })
      .catch(() => null);
    if (
      !storedPayload ||
      storedPayload.executionOwnerId !== input.executionOwnerId ||
      storedPayload.executionAttempt !== input.executionAttempt
    ) {
      await deps.repository
        .failTurn({
          turnId: turn.id,
          ownerId: input.executionOwnerId,
          executionAttempt: input.executionAttempt,
          errorCode: "assistant_payload_write_failed",
          now: now(),
        })
        .catch(() => null);
      return {
        assistantTurnPersisted: false,
        assistantMessageId: null,
        alreadyPersisted: false,
        linkVerified: false,
        saved: false,
        errorCode: "assistant_payload_write_failed",
        retryable: true,
      };
    }

    // Atomic assistant persistence: the message row, the terminal turn
    // transition and the payload clearing commit together, and the lease is
    // re-verified on the locked turn row inside that transaction.
    const finalized = await deps.repository.finalizeTurn({
      turnId: turn.id,
      ownerId: input.executionOwnerId,
      executionAttempt: input.executionAttempt,
      chatId: input.chatId,
      assistantMessageId,
      parts: input.parts,
      createdAt: new Date(turn.createdAt.getTime() + 1),
      now: now(),
    });

    if (finalized.outcome === "fence_lost") {
      return {
        assistantTurnPersisted: false,
        assistantMessageId: null,
        alreadyPersisted: false,
        linkVerified: false,
        saved: false,
        errorCode: "turn_execution_lease_lost",
        retryable: true,
      };
    }

    if (finalized.outcome === "message_conflict") {
      // A different message owns the deterministic id. Nothing was written and
      // the existing row must never be rewritten. The lease is released so an
      // immediate retry can resume from the stored payload.
      await deps.repository
        .failTurn({
          turnId: turn.id,
          ownerId: input.executionOwnerId,
          executionAttempt: input.executionAttempt,
          errorCode: "assistant_message_conflict",
          now: now(),
        })
        .catch(() => null);
      return {
        assistantTurnPersisted: false,
        assistantMessageId: null,
        alreadyPersisted: false,
        linkVerified: false,
        saved: false,
        errorCode: "assistant_message_conflict",
        retryable: true,
      };
    }

    if (finalized.outcome === "write_failed") {
      // The finalization transaction rolled back, so no partial state exists and
      // the pending payload is intact. Releasing the lease lets an immediate
      // retry resume the stored answer without another model call.
      await deps.repository
        .failTurn({
          turnId: turn.id,
          ownerId: input.executionOwnerId,
          executionAttempt: input.executionAttempt,
          errorCode: "assistant_turn_write_failed",
          now: now(),
        })
        .catch(() => null);
      return {
        assistantTurnPersisted: false,
        assistantMessageId: null,
        alreadyPersisted: false,
        linkVerified: false,
        saved: false,
        errorCode: "assistant_turn_write_failed",
        retryable: true,
      };
    }

    if (finalized.outcome === "already_completed") {
      // Another attempt finalized this turn first. Report its authoritative
      // result instead of claiming this attempt's content.
      return {
        assistantTurnPersisted: true,
        assistantMessageId: finalized.turn.assistantMessageId,
        alreadyPersisted: true,
        linkVerified: finalized.linkVerified,
        saved: finalized.linkVerified,
        errorCode: finalized.linkVerified ? null : "user_turn_link_missing",
        retryable: !finalized.linkVerified,
      };
    }

    return {
      assistantTurnPersisted: true,
      assistantMessageId: finalized.turn.assistantMessageId,
      alreadyPersisted: false,
      linkVerified: finalized.linkVerified,
      saved: finalized.linkVerified,
      errorCode: finalized.linkVerified ? null : "user_turn_link_missing",
      retryable: !finalized.linkVerified,
    };
  }

  /**
   * Renews the execution lease while the model stage runs.
   *
   * Renewal is fenced by the whole token (`ownerId` + `executionAttempt`), so a
   * lease that was taken over — or an attempt whose number was superseded —
   * cannot keep extending (or regain) authority; the caller sees `leaseLost`.
   * Expiry alone does not revoke authority: takeover is what revokes it, and a
   * takeover can only happen once the lease has expired.
   */
  function startExecutionHeartbeat(input: {
    turnId: string;
    ownerId: string;
    executionAttempt: number;
    intervalMs?: number;
    leaseMs?: number;
  }): TurnExecutionHeartbeat {
    const intervalMs = input.intervalMs ?? TURN_EXECUTION_LEASE_RENEW_MS;
    const leaseMs = input.leaseMs ?? TURN_EXECUTION_LEASE_MS;
    let renewalFailures = 0;
    let leaseLost = false;
    let stopped = false;
    const timer = setInterval(() => {
      if (stopped || leaseLost) {
        return;
      }
      deps.repository
        .renewExecution({
          turnId: input.turnId,
          ownerId: input.ownerId,
          executionAttempt: input.executionAttempt,
          leaseMs,
          now: now(),
        })
        .then((renewed) => {
          if (!renewed || renewed.executionOwnerId !== input.ownerId) {
            leaseLost = true;
          }
        })
        .catch(() => {
          renewalFailures += 1;
        });
    }, intervalMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
    return {
      stop() {
        stopped = true;
        clearInterval(timer);
        return { renewalFailures, leaseLost };
      },
    };
  }

  async function failTurn(input: {
    userId: string;
    chatId: string;
    clientTurnId: string;
    errorCode: string;
    executionOwnerId?: string | null;
    executionAttempt?: number | null;
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
        ownerId: input.executionOwnerId ?? null,
        executionAttempt: input.executionAttempt ?? null,
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

  return {
    beginTurn,
    completeTurn,
    failTurn,
    readTurn,
    startExecutionHeartbeat,
  };
}
