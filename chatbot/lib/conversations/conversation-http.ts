import {
  extractAssistantMetadata,
  extractTextFromParts,
} from "./message-parts";
import {
  decodeCursor,
  encodeCursor,
  normalizePageSize,
  type PaginationCursor,
  PaginationCursorError,
} from "./pagination";

/**
 * Owner-authorized conversation history HTTP contract (Phase 12 Stage 1).
 *
 * The list and detail endpoints are cursor-paginated so an account's complete
 * retained history is reachable from any device without a fixed top-N cap.
 * Responses stay backward compatible: `conversations`, `messages` and the
 * conversation fields keep their previous shape.
 */

export type ConversationHistoryUser = { userId: string };

export type StoredMessageRecord = {
  id: string;
  role: string;
  parts: unknown;
  createdAt: Date;
};

export type ConversationSummaryRecord = {
  chatId: string;
  legalMatterId: string | null;
  title: string | null;
  chatTitle: string;
  createdAt: Date;
  updatedAt: Date;
  /**
   * `legacy_chat` marks an owner chat that holds messages but predates the
   * immigration conversation row. It is presented as retained history and is
   * never silently rewritten or backfilled by the read path.
   */
  origin?: "immigration" | "legacy_chat";
};

export type ConversationHistoryRepository = {
  listConversations(input: {
    userId: string;
    limit: number;
    cursor: PaginationCursor | null;
  }): Promise<{ conversations: ConversationSummaryRecord[]; hasMore: boolean }>;
  countConversations(input: { userId: string }): Promise<number>;
  createConversation(input: {
    userId: string;
    title: string;
  }): Promise<ConversationSummaryRecord>;
  getConversation(input: {
    chatId: string;
    userId: string;
  }): Promise<ConversationSummaryRecord | null>;
  listMessages(input: {
    chatId: string;
    userId: string;
    limit: number;
    olderThan: PaginationCursor | null;
  }): Promise<{ messages: StoredMessageRecord[]; hasOlder: boolean }>;
  updateConversation(input: {
    chatId: string;
    userId: string;
    legalMatterId?: string | null;
    title?: string | null;
  }): Promise<ConversationSummaryRecord | null>;
};

export type MessageCursorSource = { id: string; createdAt: Date };

export function messageCursor(message: MessageCursorSource): PaginationCursor {
  return { timestamp: message.createdAt.getTime(), id: message.id };
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function conversationFields(record: ConversationSummaryRecord) {
  return {
    chatId: record.chatId,
    legalMatterId: record.legalMatterId ?? null,
    title: record.title ?? record.chatTitle ?? "Immigration conversation",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    origin: record.origin ?? "immigration",
  };
}

function storedMessageFields(message: StoredMessageRecord) {
  const metadata = extractAssistantMetadata(message.parts);
  return {
    id: message.id,
    role: message.role,
    text: extractTextFromParts(message.parts),
    createdAt: message.createdAt,
    compactSources: metadata.compactSources,
    citations: metadata.citations,
    customerDocumentEvidenceUsed: metadata.customerDocumentEvidenceUsed,
    customerDocumentSources: metadata.customerDocumentSources,
    confidence: metadata.confidence,
    researchStatus: metadata.researchStatus,
    followUpQuestions: metadata.followUpQuestions,
    matterId: metadata.matterId,
    retrievalDebug: metadata.retrievalDebug,
  };
}

export function createConversationHistoryHandlers(deps: {
  authenticate: () => Promise<ConversationHistoryUser | null>;
  repository: ConversationHistoryRepository;
}) {
  async function requireUser(): Promise<
    { userId: string } | { response: Response }
  > {
    const user = await deps.authenticate();
    return user
      ? { userId: user.userId }
      : { response: jsonResponse({ error: "Unauthorized" }, 401) };
  }

  return {
    async list(request: Request) {
      const access = await requireUser();
      if ("response" in access) {
        return access.response;
      }
      const url = new URL(request.url);
      const limit = normalizePageSize(
        "conversation",
        url.searchParams.has("limit")
          ? Number(url.searchParams.get("limit"))
          : null
      );
      let cursor: PaginationCursor | null;
      try {
        cursor = decodeCursor("conversation", url.searchParams.get("cursor"));
      } catch (error) {
        if (error instanceof PaginationCursorError) {
          return jsonResponse({ error: "Invalid cursor" }, 400);
        }
        throw error;
      }

      const page = await deps.repository.listConversations({
        userId: access.userId,
        limit,
        cursor,
      });
      const totalCount = await deps.repository.countConversations({
        userId: access.userId,
      });
      const last = page.conversations.at(-1);
      return jsonResponse({
        conversations: page.conversations.map(conversationFields),
        hasMore: page.hasMore,
        nextCursor:
          page.hasMore && last
            ? encodeCursor("conversation", {
                timestamp: last.updatedAt.getTime(),
                id: last.chatId,
              })
            : null,
        totalCount,
      });
    },

    async create(request: Request) {
      const access = await requireUser();
      if ("response" in access) {
        return access.response;
      }
      let title = "New immigration conversation";
      try {
        const body = await request.json();
        if (typeof body?.title === "string" && body.title.trim()) {
          title = body.title.trim().slice(0, 120);
        }
      } catch {
        // Empty body is allowed.
      }
      const conversation = await deps.repository.createConversation({
        userId: access.userId,
        title,
      });
      return jsonResponse(conversationFields(conversation));
    },

    async detail(request: Request, chatId: string) {
      const access = await requireUser();
      if ("response" in access) {
        return access.response;
      }
      const conversation = await deps.repository.getConversation({
        chatId,
        userId: access.userId,
      });
      if (!conversation) {
        return jsonResponse({ error: "Conversation not found" }, 404);
      }

      const url = new URL(request.url);
      const messageLimit = normalizePageSize(
        "message",
        url.searchParams.has("messageLimit")
          ? Number(url.searchParams.get("messageLimit"))
          : null
      );
      let olderThan: PaginationCursor | null;
      try {
        olderThan = decodeCursor(
          "message",
          url.searchParams.get("olderCursor")
        );
      } catch (error) {
        if (error instanceof PaginationCursorError) {
          return jsonResponse({ error: "Invalid cursor" }, 400);
        }
        throw error;
      }

      const page = await deps.repository.listMessages({
        chatId,
        userId: access.userId,
        limit: messageLimit,
        olderThan,
      });
      const oldest = page.messages.at(0);

      return jsonResponse({
        ...conversationFields(conversation),
        messages: page.messages.map(storedMessageFields),
        hasOlderMessages: page.hasOlder,
        olderMessagesCursor:
          page.hasOlder && oldest
            ? encodeCursor("message", messageCursor(oldest))
            : null,
      });
    },

    async update(request: Request, chatId: string) {
      const access = await requireUser();
      if ("response" in access) {
        return access.response;
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const parsed = (body ?? {}) as {
        legalMatterId?: unknown;
        title?: unknown;
      };
      const updated = await deps.repository.updateConversation({
        chatId,
        userId: access.userId,
        legalMatterId:
          typeof parsed.legalMatterId === "string" &&
          parsed.legalMatterId.trim()
            ? parsed.legalMatterId.trim()
            : parsed.legalMatterId === null
              ? null
              : undefined,
        title:
          typeof parsed.title === "string"
            ? parsed.title.trim().slice(0, 120)
            : undefined,
      });
      if (!updated) {
        return jsonResponse({ error: "Conversation not found" }, 404);
      }
      return jsonResponse(conversationFields(updated));
    },
  };
}
