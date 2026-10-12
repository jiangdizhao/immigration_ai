import type { ConversationPolicyBindingView } from "../policy-intelligence/conversation-policy-binding";
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
    policySlug?: string | null;
    policyLaunchId?: string | null;
  }): Promise<
    | {
        ok: true;
        conversation: ConversationSummaryRecord;
        policyBinding: ConversationPolicyBindingView | null;
      }
    /**
     * A policy launch that cannot be honoured fails explicitly. The handler
     * turns this into a localized recoverable error instead of creating an
     * apparently successful but unbound conversation.
     */
    | {
        ok: false;
        status: number;
        code: string;
        retryable: boolean;
        unavailable?: "policy_binding_schema";
      }
  >;
  getConversation(input: {
    chatId: string;
    userId: string;
  }): Promise<ConversationSummaryRecord | null>;
  /**
   * Phase 12 Stage 2: the persisted policy binding for an owned conversation.
   * `null` covers both "no binding" and "binding schema not deployed yet".
   */
  getPolicyBinding?(input: {
    chatId: string;
    userId: string;
  }): Promise<ConversationPolicyBindingView | null>;
  listPolicyBindings?(input: {
    userId: string;
    chatIds: string[];
  }): Promise<Map<string, ConversationPolicyBindingView>>;
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
    customerDocumentUsage: metadata.customerDocumentUsage,
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
      /**
       * Phase 12 Stage 2: the list carries each conversation's policy topic
       * identity so history reopened on any device can render the correct card
       * without a second round trip. It never carries the snapshot text of a
       * conversation the caller does not own (the repository filters by owner).
       */
      const bindings = deps.repository.listPolicyBindings
        ? await deps.repository.listPolicyBindings({
            userId: access.userId,
            chatIds: page.conversations.map((item) => item.chatId),
          })
        : new Map<string, ConversationPolicyBindingView>();
      return jsonResponse({
        conversations: page.conversations.map((item) => ({
          ...conversationFields(item),
          policyBinding: bindings.get(item.chatId) ?? null,
        })),
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
      let policySlug: string | null = null;
      let policyLaunchId: string | null = null;
      try {
        const body = await request.json();
        if (typeof body?.title === "string" && body.title.trim()) {
          title = body.title.trim().slice(0, 120);
        }
        if (typeof body?.policySlug === "string") {
          policySlug = body.policySlug.trim();
        }
        if (typeof body?.policyLaunchId === "string") {
          policyLaunchId = body.policyLaunchId.trim();
        }
      } catch {
        // Empty body is allowed.
      }
      /**
       * A policy launch is only a *request*: the server resolves the slug
       * against the trusted published policy read and stores its own snapshot.
       * A slug that cannot be resolved fails explicitly instead of silently
       * producing an unbound conversation that looks policy-launched.
       */
      const created = await deps.repository.createConversation({
        userId: access.userId,
        title,
        policySlug: policySlug?.length ? policySlug : null,
        policyLaunchId: policyLaunchId?.length ? policyLaunchId : null,
      });
      if (!created.ok) {
        return jsonResponse(
          {
            error:
              created.code === "policy_launch_in_progress"
                ? "Policy launch is already in progress."
                : "Policy topic is unavailable.",
            code: created.code,
            retryable: created.retryable,
          },
          created.status
        );
      }
      return jsonResponse({
        ...conversationFields(created.conversation),
        policyBinding: created.policyBinding,
      });
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
      /**
       * Phase 12 Stage 2: the detail response is the authoritative recovery path
       * for the policy topic card — reload, history reopening and a second
       * device all read it from here rather than from client state.
       */
      const policyBinding = deps.repository.getPolicyBinding
        ? await deps.repository.getPolicyBinding({
            chatId,
            userId: access.userId,
          })
        : null;

      return jsonResponse({
        ...conversationFields(conversation),
        policyBinding,
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
