import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import { calculateVipWindow } from "../vip/entitlement";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  immigrationConversation,
  type LawyerClarificationRequest,
  lawyerClarificationRequest,
  message,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  type VipPurchase,
  vipPurchase,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db
      .select()
      .from(user)
      .where(sql`lower(btrim(${user.email})) = ${email.trim().toLowerCase()}`);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function getUserEntitlementById(userId: string) {
  const [entitlement] = await db
    .select({
      id: user.id,
      role: user.role,
      membershipTier: user.membershipTier,
      vipExpiresAt: user.vipExpiresAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return entitlement ?? null;
}

export async function listLawyerClarificationRequestsForUser({
  userId,
  chatId,
}: {
  userId: string;
  chatId?: string;
}) {
  const conditions = [eq(lawyerClarificationRequest.userId, userId)];
  if (chatId) {
    conditions.push(eq(lawyerClarificationRequest.chatId, chatId));
  }

  return await db
    .select()
    .from(lawyerClarificationRequest)
    .where(and(...conditions))
    .orderBy(desc(lawyerClarificationRequest.createdAt))
    .limit(100);
}

export async function getLawyerClarificationRequestForUser({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  const [request] = await db
    .select()
    .from(lawyerClarificationRequest)
    .where(
      and(
        eq(lawyerClarificationRequest.id, id),
        eq(lawyerClarificationRequest.userId, userId)
      )
    )
    .limit(1);
  return request ?? null;
}

export async function getLawyerClarificationRequestByUserAndAssistantMessage({
  userId,
  assistantMessageId,
}: {
  userId: string;
  assistantMessageId: string;
}) {
  const [request] = await db
    .select()
    .from(lawyerClarificationRequest)
    .where(
      and(
        eq(lawyerClarificationRequest.userId, userId),
        eq(lawyerClarificationRequest.assistantMessageId, assistantMessageId)
      )
    )
    .limit(1);
  return request ?? null;
}

export async function createLawyerClarificationRequest({
  values,
}: {
  values: typeof lawyerClarificationRequest.$inferInsert;
}) {
  const [request] = await db
    .insert(lawyerClarificationRequest)
    .values(values)
    .returning();
  return request;
}

export async function updateLawyerClarificationRequest({
  id,
  expectedStatus,
  values,
}: {
  id: string;
  expectedStatus: LawyerClarificationRequest["status"];
  values: Partial<
    Pick<
      LawyerClarificationRequest,
      | "status"
      | "reviewerUserId"
      | "lawyerResponse"
      | "correctedAnswer"
      | "reviewedAt"
      | "closedAt"
      | "updatedAt"
    >
  >;
}) {
  const [request] = await db
    .update(lawyerClarificationRequest)
    .set(values)
    .where(
      and(
        eq(lawyerClarificationRequest.id, id),
        eq(lawyerClarificationRequest.status, expectedStatus)
      )
    )
    .returning();
  return request ?? null;
}

export async function listLawyerClarificationRequestsForAdmin({
  status,
}: {
  status?: LawyerClarificationRequest["status"];
}) {
  const condition = status
    ? eq(lawyerClarificationRequest.status, status)
    : undefined;
  const query = db
    .select({
      request: lawyerClarificationRequest,
      customerEmail: user.email,
    })
    .from(lawyerClarificationRequest)
    .innerJoin(user, eq(lawyerClarificationRequest.userId, user.id));

  return condition
    ? await query
        .where(condition)
        .orderBy(desc(lawyerClarificationRequest.createdAt))
        .limit(100)
    : await query
        .orderBy(desc(lawyerClarificationRequest.createdAt))
        .limit(100);
}

export async function getLawyerClarificationRequestForAdmin(id: string) {
  const [result] = await db
    .select({
      request: lawyerClarificationRequest,
      customerEmail: user.email,
    })
    .from(lawyerClarificationRequest)
    .innerJoin(user, eq(lawyerClarificationRequest.userId, user.id))
    .where(eq(lawyerClarificationRequest.id, id))
    .limit(1);
  return result ?? null;
}

export async function createVipPurchase({
  userId,
  provider,
  providerPaymentId,
  amountMinor,
  currency,
}: Pick<
  VipPurchase,
  "userId" | "provider" | "providerPaymentId" | "amountMinor" | "currency"
>) {
  const [purchase] = await db
    .insert(vipPurchase)
    .values({
      userId,
      provider,
      providerPaymentId,
      amountMinor,
      currency,
    })
    .returning();

  return purchase;
}

export async function getVipPurchaseForUser({
  purchaseId,
  userId,
}: {
  purchaseId: string;
  userId: string;
}) {
  const [purchase] = await db
    .select()
    .from(vipPurchase)
    .where(and(eq(vipPurchase.id, purchaseId), eq(vipPurchase.userId, userId)))
    .limit(1);

  return purchase ?? null;
}

export async function settleVipPurchase({
  purchaseId,
  userId,
  provider,
  providerPaymentId,
  providerStatus,
  durationDays,
  now = new Date(),
}: {
  purchaseId: string;
  userId: string;
  provider: string;
  providerPaymentId: string;
  providerStatus: "paid" | "failed" | "cancelled";
  durationDays: number;
  now?: Date;
}) {
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT "id" FROM "VipPurchase" WHERE "id" = ${purchaseId} AND "userId" = ${userId} FOR UPDATE`
    );
    const [purchase] = await tx
      .select()
      .from(vipPurchase)
      .where(
        and(eq(vipPurchase.id, purchaseId), eq(vipPurchase.userId, userId))
      )
      .limit(1);

    if (
      !purchase ||
      purchase.provider !== provider ||
      purchase.providerPaymentId !== providerPaymentId
    ) {
      return null;
    }

    if (
      purchase.status === "paid" ||
      purchase.status === "failed" ||
      purchase.status === "cancelled"
    ) {
      return purchase;
    }

    if (providerStatus !== "paid") {
      const [settled] = await tx
        .update(vipPurchase)
        .set({ status: providerStatus, updatedAt: now })
        .where(eq(vipPurchase.id, purchase.id))
        .returning();
      return settled ?? null;
    }

    const [currentUser] = await tx
      .select({
        membershipTier: user.membershipTier,
        vipExpiresAt: user.vipExpiresAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!currentUser) {
      return null;
    }

    const { vipStartsAt, vipExpiresAt } = calculateVipWindow(
      currentUser.vipExpiresAt,
      now,
      durationDays
    );

    await tx
      .update(user)
      .set({ membershipTier: "vip", vipExpiresAt })
      .where(eq(user.id, userId));

    const [settled] = await tx
      .update(vipPurchase)
      .set({
        status: "paid",
        purchasedAt: now,
        vipStartsAt,
        vipExpiresAt,
        updatedAt: now,
      })
      .where(eq(vipPurchase.id, purchase.id))
      .returning();

    return settled ?? null;
  });
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db
      .insert(user)
      .values({ email: email.trim().toLowerCase(), password: hashedPassword });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}-${generateUUID()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
      role: user.role,
      membershipTier: user.membershipTier,
      vipExpiresAt: user.vipExpiresAt,
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function getOrCreateLocalImmigrationUserId() {
  // Compatibility helper for legacy local development/tests only. Customer
  // routes must use the authenticated Auth.js user and never this identity.
  const email = "local-immigration-user@localhost";
  const existing = await getUser(email);
  if (existing[0]?.id) {
    return existing[0].id;
  }

  const password = generateHashedPassword(generateUUID());
  const [created] = await db
    .insert(user)
    .values({ email, password })
    .returning({ id: user.id });

  return created.id;
}

export async function createImmigrationConversation({
  userId,
  title = "New immigration conversation",
}: {
  userId: string;
  title?: string;
}) {
  const id = generateUUID();
  const now = new Date();

  await db.insert(chat).values({
    id,
    createdAt: now,
    userId,
    title,
    visibility: "private",
  });

  const [conversation] = await db
    .insert(immigrationConversation)
    .values({
      chatId: id,
      legalMatterId: null,
      title,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return conversation;
}

export async function listImmigrationConversations({
  userId,
  limit = 50,
}: {
  userId: string;
  limit?: number;
}) {
  return await db
    .select({
      chatId: immigrationConversation.chatId,
      legalMatterId: immigrationConversation.legalMatterId,
      title: immigrationConversation.title,
      chatTitle: chat.title,
      createdAt: immigrationConversation.createdAt,
      updatedAt: immigrationConversation.updatedAt,
    })
    .from(immigrationConversation)
    .innerJoin(chat, eq(immigrationConversation.chatId, chat.id))
    .where(eq(chat.userId, userId))
    .orderBy(desc(immigrationConversation.updatedAt))
    .limit(Math.max(1, Math.min(limit, 100)));
}

export async function getImmigrationConversationByChatId({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}) {
  const [conversation] = await db
    .select({
      chatId: immigrationConversation.chatId,
      legalMatterId: immigrationConversation.legalMatterId,
      title: immigrationConversation.title,
      chatTitle: chat.title,
      createdAt: immigrationConversation.createdAt,
      updatedAt: immigrationConversation.updatedAt,
      userId: chat.userId,
    })
    .from(immigrationConversation)
    .innerJoin(chat, eq(immigrationConversation.chatId, chat.id))
    .where(
      and(eq(immigrationConversation.chatId, chatId), eq(chat.userId, userId))
    )
    .limit(1);

  return conversation ?? null;
}

export async function updateImmigrationConversation({
  chatId,
  userId,
  legalMatterId,
  title,
}: {
  chatId: string;
  userId: string;
  legalMatterId?: string | null;
  title?: string | null;
}) {
  const conversation = await getImmigrationConversationByChatId({
    chatId,
    userId,
  });
  if (!conversation) {
    return null;
  }

  const updates: {
    legalMatterId?: string | null;
    title?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (legalMatterId !== undefined) {
    updates.legalMatterId = legalMatterId;
  }
  if (title !== undefined) {
    updates.title = title;
    await updateChatTitleById({
      chatId,
      title: title || "Immigration conversation",
    });
  }

  const [updated] = await db
    .update(immigrationConversation)
    .set(updates)
    .where(eq(immigrationConversation.chatId, chatId))
    .returning();

  return updated ?? null;
}

export async function touchImmigrationConversation({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}) {
  const conversation = await getImmigrationConversationByChatId({
    chatId,
    userId,
  });
  if (!conversation) {
    return null;
  }

  const [updated] = await db
    .update(immigrationConversation)
    .set({ updatedAt: new Date() })
    .where(eq(immigrationConversation.chatId, chatId))
    .returning();

  return updated ?? null;
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.insert(message).values(messages);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await db.update(message).set({ parts }).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db.update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update title for chat", chatId, error);
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}
