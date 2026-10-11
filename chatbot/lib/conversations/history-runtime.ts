import "server-only";

import {
  countImmigrationConversations,
  createImmigrationConversation,
  getImmigrationConversationByChatId,
  listImmigrationConversationsPage,
  listMessagesForChatPage,
  updateImmigrationConversation,
} from "@/lib/db/queries";
import type { ConversationHistoryRepository } from "./conversation-http";
import { createConversationHistoryHandlers } from "./conversation-http";

const repository: ConversationHistoryRepository = {
  listConversations: ({ userId, limit, cursor }) =>
    listImmigrationConversationsPage({ userId, limit, cursor }),
  countConversations: ({ userId }) => countImmigrationConversations({ userId }),
  async createConversation({ userId, title }) {
    const created = await createImmigrationConversation({ userId, title });
    return {
      chatId: created.chatId,
      legalMatterId: created.legalMatterId ?? null,
      title: created.title ?? null,
      chatTitle: created.title ?? title,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  },
  async getConversation({ chatId, userId }) {
    const conversation = await getImmigrationConversationByChatId({
      chatId,
      userId,
    });
    return conversation
      ? {
          chatId: conversation.chatId,
          legalMatterId: conversation.legalMatterId ?? null,
          title: conversation.title ?? null,
          chatTitle: conversation.chatTitle,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        }
      : null;
  },
  listMessages: ({ chatId, userId, limit, olderThan }) =>
    listMessagesForChatPage({ chatId, userId, limit, olderThan }),
  async updateConversation(input) {
    const updated = await updateImmigrationConversation(input);
    return updated
      ? {
          chatId: updated.chatId,
          legalMatterId: updated.legalMatterId ?? null,
          title: updated.title ?? null,
          chatTitle: updated.title ?? "Immigration conversation",
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        }
      : null;
  },
};

export function getConversationHistoryRepository() {
  return repository;
}

export function createDatabaseConversationHistoryHandlers(
  authenticate: Parameters<
    typeof createConversationHistoryHandlers
  >[0]["authenticate"]
) {
  return createConversationHistoryHandlers({ authenticate, repository });
}
