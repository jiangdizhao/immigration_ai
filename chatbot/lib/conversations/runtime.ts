import "server-only";

import {
  acquireConversationTurnExecution,
  claimConversationTurn,
  completeConversationTurn,
  failConversationTurn,
  getConversationTurnRecord,
  getImmigrationConversationByChatId,
  getMessageForChat,
  insertMessageIdempotent,
  recordConversationTurnAttempt,
  recordConversationTurnUserMessageId,
  renewConversationTurnExecution,
  storeConversationTurnPendingAssistantParts,
} from "@/lib/db/queries";
import {
  type ConversationTurnRepository,
  createConversationTurnService,
} from "./turn-ledger";

const repository: ConversationTurnRepository = {
  getOwnedConversation: ({ chatId, userId }) =>
    getImmigrationConversationByChatId({ chatId, userId }).then(
      (conversation) =>
        conversation
          ? {
              chatId: conversation.chatId,
              legalMatterId: conversation.legalMatterId,
            }
          : null
    ),
  getTurn: getConversationTurnRecord,
  claimTurn: claimConversationTurn,
  recordUserMessageId: recordConversationTurnUserMessageId,
  recordAttempt: recordConversationTurnAttempt,
  acquireExecution: acquireConversationTurnExecution,
  renewExecution: renewConversationTurnExecution,
  storePendingAssistantParts: storeConversationTurnPendingAssistantParts,
  completeTurn: completeConversationTurn,
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
