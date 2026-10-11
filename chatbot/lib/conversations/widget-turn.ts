import "server-only";

import type { StoredAssistantMetadata } from "./message-parts";
import {
  buildAssistantMessageParts,
  extractAssistantMetadata,
  extractTextFromParts,
} from "./message-parts";
import { getConversationTurnService } from "./runtime";
import {
  CLIENT_TURN_ID_PATTERN,
  ConversationTurnInputError,
  ConversationTurnOwnershipError,
  type TurnExecutionHeartbeat,
} from "./turn-ledger";

/**
 * Shared persistence boundary for Fast, Legal Check (Default) and Premium.
 *
 * All three widget routes use this module instead of writing messages
 * ad-hoc, so durability, idempotency and error semantics cannot drift between
 * answer modes.
 */

export type WidgetTurnPersistence = {
  clientTurnId: string;
  userTurnPersisted: boolean;
  assistantTurnPersisted: boolean;
  assistantMessageId: string | null;
  errorCode: string | null;
  replayed: boolean;
  attempts: number;
  /**
   * True only when the user message and the assistant answer are both durably
   * stored and linked. The client must never present a turn as saved otherwise.
   */
  saved: boolean;
  retryable: boolean;
  /** Suggested delay before retrying an in-progress or failed turn. */
  retryAfterMs: number | null;
};

export type {
  BeginTurnResult,
  CompleteTurnResult,
  ConversationTurnRecord,
  ConversationTurnStatus,
  PersistedMessageRecord,
  TurnExecutionHeartbeat as WidgetTurnHeartbeat,
} from "./turn-ledger";

export type WidgetReplayPayload = {
  assistantMessageId: string;
  parts: unknown[];
};

export type WidgetTurnStart =
  | {
      status: "proceed";
      persistence: WidgetTurnPersistence;
      /** Fencing token required to complete or fail this executed turn. */
      executionOwnerId: string;
      /** Attempt number issued with the token; a superseded one has no authority. */
      executionAttempt: number;
      /** Durable turn row whose execution lease must be renewed while running. */
      turnId: string;
      pendingAssistantParts: unknown[] | null;
    }
  | {
      status: "replay";
      persistence: WidgetTurnPersistence;
      replay: WidgetReplayPayload;
    }
  | {
      /** A previous attempt generated an answer that was not durably stored. */
      status: "resume";
      persistence: WidgetTurnPersistence;
      executionOwnerId: string;
      executionAttempt: number;
      parts: unknown[];
    }
  | { status: "conflict"; persistence: WidgetTurnPersistence }
  | {
      /**
       * The durable user turn could not be established for an authenticated
       * conversation. No model call may run and the client must retry.
       */
      status: "persistence_failed";
      persistence: WidgetTurnPersistence;
    }
  | {
      /** Another live request owns this turn and is still producing the answer. */
      status: "in_progress";
      persistence: WidgetTurnPersistence;
    }
  | { status: "unauthorized"; persistence: null }
  /**
   * The request has no owned conversation to attach durable history to (legacy
   * or anonymous-session callers). No durable write is attempted and the
   * response must not claim persistence.
   */
  | { status: "unscoped" };

export type WidgetTurnDecision = {
  /** True only for `proceed`: no other status may reach the model stage. */
  runModel: boolean;
  kind: WidgetTurnStart["status"];
};

/**
 * Single decision table shared by the Fast, Legal Check and Premium routes so
 * that "exactly one model execution per turn" cannot drift per route.
 */
export function widgetTurnDecision(start: WidgetTurnStart): WidgetTurnDecision {
  return { runModel: start.status === "proceed", kind: start.status };
}

function persistenceState(input: {
  clientTurnId: string;
  userTurnPersisted: boolean;
  assistantTurnPersisted?: boolean;
  assistantMessageId?: string | null;
  errorCode?: string | null;
  replayed?: boolean;
  attempts?: number;
  saved?: boolean;
  retryable?: boolean;
  retryAfterMs?: number | null;
}): WidgetTurnPersistence {
  const errorCode = input.errorCode ?? null;
  const assistantTurnPersisted = input.assistantTurnPersisted === true;
  const saved =
    input.saved === true &&
    assistantTurnPersisted &&
    input.userTurnPersisted === true;
  return {
    clientTurnId: input.clientTurnId,
    userTurnPersisted: input.userTurnPersisted,
    assistantTurnPersisted,
    assistantMessageId: input.assistantMessageId ?? null,
    errorCode,
    replayed: input.replayed === true,
    attempts: input.attempts ?? 1,
    saved,
    retryable: input.retryable ?? !saved,
    retryAfterMs: input.retryAfterMs ?? null,
  };
}

export function resolveClientTurnId(input: {
  clientTurnId?: string | null;
  userMessageId?: string | null;
  fallbackId: string;
}): string {
  const candidates = [input.clientTurnId, input.userMessageId];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      CLIENT_TURN_ID_PATTERN.test(candidate)
    ) {
      return candidate;
    }
  }
  return input.fallbackId;
}

export async function beginWidgetTurn(input: {
  userId: string;
  chatId: string;
  clientTurnId: string;
  question: string;
  userMessageId?: string | null;
  assistantMode: string;
}): Promise<WidgetTurnStart> {
  const service = getConversationTurnService();
  let started: Awaited<ReturnType<typeof service.beginTurn>>;
  try {
    started = await service.beginTurn({
      userId: input.userId,
      chatId: input.chatId,
      clientTurnId: input.clientTurnId,
      question: input.question,
      userMessageId: input.userMessageId ?? null,
      assistantMode: input.assistantMode,
    });
  } catch (error) {
    if (
      error instanceof ConversationTurnOwnershipError ||
      error instanceof ConversationTurnInputError
    ) {
      return { status: "unauthorized", persistence: null };
    }
    throw error;
  }

  const persistence = persistenceState({
    clientTurnId: started.clientTurnId,
    userTurnPersisted: started.userTurnPersisted,
    errorCode: started.durabilityError,
    attempts: started.attemptCount,
    retryAfterMs: started.retryAfterMs,
  });

  if (started.kind === "conflict") {
    return { status: "conflict", persistence };
  }

  if (started.kind === "persistence_failed") {
    // The durable user turn could not be established. Failing closed here keeps
    // an unpersistable answer out of the customer's history.
    return { status: "persistence_failed", persistence };
  }

  if (started.kind === "in_progress") {
    return { status: "in_progress", persistence };
  }

  if (started.kind === "replayed" && started.replay) {
    return {
      status: "replay",
      persistence: {
        ...persistence,
        assistantTurnPersisted: true,
        assistantMessageId: started.replay.assistantMessageId,
        replayed: true,
        saved: true,
        errorCode: null,
        retryable: false,
      },
      replay: {
        assistantMessageId: started.replay.assistantMessageId,
        parts: started.replay.parts,
      },
    };
  }

  if (!started.executionOwnerId || !started.turnId) {
    // Defensive: the service never reports an executable turn without a lease
    // token. Without one a model run could not be recorded, so fail closed.
    return {
      status: "persistence_failed",
      persistence: {
        ...persistence,
        errorCode: persistence.errorCode ?? "turn_lease_not_issued",
        retryable: true,
      },
    };
  }
  const executionAttempt = started.executionAttempt ?? 0;

  if (
    started.pendingAssistantParts &&
    started.pendingAssistantParts.length > 0
  ) {
    return {
      status: "resume",
      persistence,
      executionOwnerId: started.executionOwnerId,
      executionAttempt,
      parts: started.pendingAssistantParts,
    };
  }

  return {
    status: "proceed",
    persistence,
    executionOwnerId: started.executionOwnerId,
    executionAttempt,
    turnId: started.turnId,
    pendingAssistantParts: started.pendingAssistantParts,
  };
}

/**
 * Starts lease renewal for an executed turn. Callers must stop it in a `finally`
 * so a finished or failed request never keeps extending its lease.
 */
export function startWidgetTurnHeartbeat(input: {
  turnId: string;
  executionOwnerId: string;
  executionAttempt: number;
}): TurnExecutionHeartbeat {
  return getConversationTurnService().startExecutionHeartbeat({
    turnId: input.turnId,
    ownerId: input.executionOwnerId,
    executionAttempt: input.executionAttempt,
  });
}

export async function completeWidgetTurn(input: {
  userId: string;
  chatId: string;
  clientTurnId: string;
  text: string;
  metadata: Record<string, unknown>;
  userTurnPersisted: boolean;
  attempts: number;
  executionOwnerId: string;
  executionAttempt: number;
}): Promise<WidgetTurnPersistence> {
  const service = getConversationTurnService();
  const parts = buildAssistantMessageParts({
    text: input.text,
    metadata: input.metadata,
  });
  try {
    const completed = await service.completeTurn({
      userId: input.userId,
      chatId: input.chatId,
      clientTurnId: input.clientTurnId,
      parts,
      executionOwnerId: input.executionOwnerId,
      executionAttempt: input.executionAttempt,
    });
    return persistenceState({
      clientTurnId: input.clientTurnId,
      userTurnPersisted: input.userTurnPersisted,
      assistantTurnPersisted: completed.assistantTurnPersisted,
      assistantMessageId: completed.assistantMessageId,
      errorCode: completed.errorCode,
      attempts: input.attempts,
      saved: completed.saved,
      retryable: completed.retryable,
    });
  } catch (error) {
    if (
      error instanceof ConversationTurnOwnershipError ||
      error instanceof ConversationTurnInputError
    ) {
      return persistenceState({
        clientTurnId: input.clientTurnId,
        userTurnPersisted: false,
        errorCode: "conversation_not_owned",
        attempts: input.attempts,
      });
    }
    return persistenceState({
      clientTurnId: input.clientTurnId,
      userTurnPersisted: input.userTurnPersisted,
      errorCode: "assistant_turn_write_failed",
      attempts: input.attempts,
    });
  }
}

export async function failWidgetTurn(input: {
  userId: string;
  chatId: string;
  clientTurnId: string;
  errorCode: string;
  executionOwnerId?: string | null;
  executionAttempt?: number | null;
}): Promise<void> {
  const service = getConversationTurnService();
  await service.failTurn(input).catch(() => false);
}

/**
 * Completes a turn from an already-generated payload, e.g. when a previous
 * attempt produced an answer but failed to store it. No model call happens.
 */
export async function completeWidgetTurnFromParts(input: {
  userId: string;
  chatId: string;
  clientTurnId: string;
  parts: unknown[];
  userTurnPersisted: boolean;
  attempts: number;
  executionOwnerId: string;
  executionAttempt: number;
}): Promise<WidgetTurnPersistence> {
  const service = getConversationTurnService();
  try {
    const completed = await service.completeTurn({
      userId: input.userId,
      chatId: input.chatId,
      clientTurnId: input.clientTurnId,
      parts: input.parts,
      executionOwnerId: input.executionOwnerId,
      executionAttempt: input.executionAttempt,
    });
    return persistenceState({
      clientTurnId: input.clientTurnId,
      userTurnPersisted: input.userTurnPersisted,
      assistantTurnPersisted: completed.assistantTurnPersisted,
      assistantMessageId: completed.assistantMessageId,
      errorCode: completed.errorCode,
      replayed: true,
      attempts: input.attempts,
      saved: completed.saved,
      retryable: completed.retryable,
    });
  } catch {
    return persistenceState({
      clientTurnId: input.clientTurnId,
      userTurnPersisted: input.userTurnPersisted,
      errorCode: "assistant_turn_write_failed",
      attempts: input.attempts,
    });
  }
}

export function widgetFieldsFromAssistantParts(parts: unknown[]): {
  text: string;
  metadata: StoredAssistantMetadata;
} {
  return {
    text: extractTextFromParts(parts),
    metadata: extractAssistantMetadata(parts),
  };
}
