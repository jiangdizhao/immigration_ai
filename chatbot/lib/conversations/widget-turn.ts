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
  retryable: boolean;
};

export type WidgetReplayPayload = {
  assistantMessageId: string;
  parts: unknown[];
};

export type WidgetTurnStart =
  | {
      status: "proceed";
      persistence: WidgetTurnPersistence;
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
      parts: unknown[];
    }
  | { status: "conflict"; persistence: WidgetTurnPersistence }
  | { status: "unauthorized"; persistence: null }
  /**
   * The request has no owned conversation to attach durable history to (legacy
   * or anonymous-session callers). No durable write is attempted and the
   * response must not claim persistence.
   */
  | { status: "unscoped" };

function persistenceState(input: {
  clientTurnId: string;
  userTurnPersisted: boolean;
  assistantTurnPersisted?: boolean;
  assistantMessageId?: string | null;
  errorCode?: string | null;
  replayed?: boolean;
  attempts?: number;
}): WidgetTurnPersistence {
  const errorCode = input.errorCode ?? null;
  return {
    clientTurnId: input.clientTurnId,
    userTurnPersisted: input.userTurnPersisted,
    assistantTurnPersisted: input.assistantTurnPersisted === true,
    assistantMessageId: input.assistantMessageId ?? null,
    errorCode,
    replayed: input.replayed === true,
    attempts: input.attempts ?? 1,
    retryable: input.assistantTurnPersisted !== true,
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
  });

  if (started.kind === "conflict") {
    return { status: "conflict", persistence };
  }

  if (started.kind === "replayed" && started.replay) {
    return {
      status: "replay",
      persistence: {
        ...persistence,
        assistantTurnPersisted: true,
        assistantMessageId: started.replay.assistantMessageId,
        replayed: true,
        errorCode: null,
        retryable: false,
      },
      replay: {
        assistantMessageId: started.replay.assistantMessageId,
        parts: started.replay.parts,
      },
    };
  }

  if (
    started.pendingAssistantParts &&
    started.pendingAssistantParts.length > 0
  ) {
    return {
      status: "resume",
      persistence,
      parts: started.pendingAssistantParts,
    };
  }

  return {
    status: "proceed",
    persistence,
    pendingAssistantParts: started.pendingAssistantParts,
  };
}

export async function completeWidgetTurn(input: {
  userId: string;
  chatId: string;
  clientTurnId: string;
  text: string;
  metadata: Record<string, unknown>;
  userTurnPersisted: boolean;
  attempts: number;
  assistantMessageId?: string | null;
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
      assistantMessageId: input.assistantMessageId ?? null,
    });
    return persistenceState({
      clientTurnId: input.clientTurnId,
      userTurnPersisted: input.userTurnPersisted,
      assistantTurnPersisted: completed.assistantTurnPersisted,
      assistantMessageId: completed.assistantMessageId,
      errorCode: completed.errorCode,
      attempts: input.attempts,
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
}): Promise<WidgetTurnPersistence> {
  const service = getConversationTurnService();
  try {
    const completed = await service.completeTurn({
      userId: input.userId,
      chatId: input.chatId,
      clientTurnId: input.clientTurnId,
      parts: input.parts,
    });
    return persistenceState({
      clientTurnId: input.clientTurnId,
      userTurnPersisted: input.userTurnPersisted,
      assistantTurnPersisted: completed.assistantTurnPersisted,
      assistantMessageId: completed.assistantMessageId,
      errorCode: completed.errorCode,
      replayed: true,
      attempts: input.attempts,
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
