import "server-only";

import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaStatus } from "@/lib/db/project-foundation-schema-availability";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import {
  acquireConversationTurnExecution,
  claimConversationTurn,
  claimConversationTurnInTransaction,
  failConversationTurn,
  finalizeConversationTurnAtomic,
  getConversationTurnRecord,
  getImmigrationConversationByChatId,
  getMessageForChat,
  insertMessageIdempotent,
  recordConversationTurnAttempt,
  recordConversationTurnUserMessageId,
  renewConversationTurnExecution,
  storeConversationTurnPendingAssistantParts,
} from "@/lib/db/queries";
import type { ConversationTurnRow } from "@/lib/db/schema";
import type {
  ConversationTurnRecord,
  ConversationTurnRepository,
  TurnFinalizeResult,
} from "./turn-ledger";
import {
  ConversationTurnOwnershipError,
  createConversationTurnService,
} from "./turn-ledger";

/**
 * Phase 12 Stage 1 R2: assistant persistence is a single atomic operation, so
 * the repository exposes `finalizeTurn` instead of a separate message insert
 * plus turn completion.
 */
function toFinalizeResult(
  result: Awaited<ReturnType<typeof finalizeConversationTurnAtomic>>
): TurnFinalizeResult {
  if (result.outcome === "write_failed") {
    return { outcome: "write_failed" };
  }
  if (result.outcome === "fence_lost") {
    return {
      outcome: "fence_lost",
      turn: result.turn ? toTurnRecord(result.turn) : null,
    };
  }
  if (result.outcome === "message_conflict") {
    return {
      outcome: "message_conflict",
      turn: toTurnRecord(result.turn),
    };
  }
  return {
    outcome: result.outcome,
    turn: toTurnRecord(result.turn),
    linkVerified: result.linkVerified,
  };
}

function toTurnRecord(row: ConversationTurnRow): ConversationTurnRecord {
  return row;
}

const repository: ConversationTurnRepository = {
  getOwnedConversation: ({ chatId, userId }) =>
    getImmigrationConversationByChatId({
      chatId,
      userId,
      allowProject: true,
    }).then((conversation) =>
      conversation
        ? {
            chatId: conversation.chatId,
            legalMatterId: conversation.legalMatterId,
          }
        : null
    ),
  getTurn: getConversationTurnRecord,
  async claimTurn(input) {
    const schemaStatus = await projectFoundationSchemaStatus();
    if (schemaStatus === "partial") {
      throw new Error("Project schema identity is incomplete.");
    }
    if (schemaStatus === "absent") {
      return claimConversationTurn(input);
    }
    try {
      return await projectFoundationRepository.withProjectChatTurnAdmission({
        actorUserId: input.userId,
        chatId: input.chatId,
        claim: (tx) => claimConversationTurnInTransaction(tx, input),
      });
    } catch (error) {
      if (
        error instanceof ProjectFoundationError &&
        (error.code === "project_forbidden" || error.code === "project_closed")
      ) {
        throw new ConversationTurnOwnershipError();
      }
      throw error;
    }
  },
  recordUserMessageId: recordConversationTurnUserMessageId,
  recordAttempt: recordConversationTurnAttempt,
  acquireExecution: acquireConversationTurnExecution,
  renewExecution: renewConversationTurnExecution,
  storePendingAssistantParts: storeConversationTurnPendingAssistantParts,
  async finalizeTurn(input) {
    return toFinalizeResult(await finalizeConversationTurnAtomic(input));
  },
  failTurn: failConversationTurn,
  async insertMessageIdempotent(input) {
    const result = await insertMessageIdempotent(input);
    return {
      inserted: result.inserted,
      message: result.message
        ? {
            id: result.message.id,
            chatId: result.message.chatId,
            role: result.message.role,
            parts: result.message.parts,
            attachments: result.message.attachments,
          }
        : null,
    };
  },
  async getMessage(input) {
    const record = await getMessageForChat(input);
    return record
      ? {
          id: record.id,
          chatId: record.chatId,
          role: record.role,
          parts: record.parts,
          attachments: record.attachments,
        }
      : null;
  },
};

const service = createConversationTurnService({ repository });

export function getConversationTurnService() {
  return service;
}
