// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertion helper is invoked only from tests.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";

/**
 * Real-PostgreSQL integration coverage for Phase 12 Stage 1.
 *
 * Destructive work runs only against the isolated disposable database created
 * by `scripts/phase12-stage1-test-db.ts`. The test is skipped, never silently
 * "passed", when the isolated database is not configured.
 *
 * Run with:
 *   pnpm run test:phase12:integration
 */

const TEST_DATABASE_URL = process.env.PHASE12_TEST_DATABASE_URL?.trim() ?? "";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE12_TEST_DATABASE_URL is not configured (isolated test database required)";

const OWNER_A_EMAIL = `p12a-${randomUUID()}@example.test`;
const OWNER_B_EMAIL = `p12b-${randomUUID()}@example.test`;

type Fixtures = {
  ownerA: string;
  ownerB: string;
  conversations: string[];
  messageChatId: string;
  documentIds: string[];
  chatId: string;
};

function timestamp(base: number, offsetMs: number) {
  return new Date(base + offsetMs);
}

test(
  "durable turns, complete history and account file access work on PostgreSQL",
  { skip: skipReason },
  async () => {
    process.env.POSTGRES_URL = TEST_DATABASE_URL;
    const sql = postgres(TEST_DATABASE_URL, {
      max: 4,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
    });

    const queries = await import("@/lib/db/queries");
    const base = Date.parse("2026-10-01T00:00:00.000Z");

    let fixtures: Fixtures | null = null;
    try {
      fixtures = await seed(sql, base);
      await assertConversationPagination(queries, fixtures);
      await assertMessagePagination(queries, fixtures);
      await assertDocumentHistoryPagination(queries, fixtures);
      await assertTurnDurability(queries, fixtures);
      await assertOwnershipIsolation(queries, fixtures);
    } finally {
      if (fixtures) {
        await cleanup(sql, fixtures);
      }
      await sql.end({ timeout: 5 });
      const runtimeClient = await import("@/lib/db/runtime-client");
      await runtimeClient.closeLazyDatabase();
    }
  }
);

async function seed(
  sql: ReturnType<typeof postgres>,
  base: number
): Promise<Fixtures> {
  const [ownerA] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password")
    values (${OWNER_A_EMAIL}, ${"x".repeat(64)})
    returning "id"
  `;
  const [ownerB] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password")
    values (${OWNER_B_EMAIL}, ${"x".repeat(64)})
    returning "id"
  `;

  const conversations: string[] = [];
  const conversationRows: Record<string, unknown>[] = [];
  // 120 conversations for owner A with deliberately duplicated updatedAt values
  // to force the identifier tiebreaker, and 3 for owner B.
  for (let index = 0; index < 120; index += 1) {
    const chatId = randomUUID();
    conversations.push(chatId);
    conversationRows.push({
      chatId,
      userId: ownerA.id,
      title: `Phase12 conversation ${index}`,
      createdAt: timestamp(base, index * 1000),
      updatedAt: timestamp(base, Math.floor(index / 2) * 1000),
    });
  }
  const foreignConversationRows: Record<string, unknown>[] = [];
  for (let index = 0; index < 3; index += 1) {
    const chatId = randomUUID();
    foreignConversationRows.push({
      chatId,
      userId: ownerB.id,
      title: `Phase12 foreign conversation ${index}`,
      createdAt: timestamp(base, index * 1000),
      updatedAt: timestamp(base, index * 1000),
    });
  }

  for (const row of [...conversationRows, ...foreignConversationRows]) {
    await sql`
      insert into "Chat" ("id", "createdAt", "title", "userId", "visibility")
      values (${row.chatId as string}, ${row.createdAt as Date}, ${row.title as string}, ${row.userId as string}, 'private')
    `;
    await sql`
      insert into "ImmigrationConversation" ("chatId", "legalMatterId", "title", "createdAt", "updatedAt")
      values (${row.chatId as string}, null, ${row.title as string}, ${row.createdAt as Date}, ${row.updatedAt as Date})
    `;
  }

  const messageChatId = conversations[0] as string;
  // 445 messages, most sharing one millisecond timestamp, to prove the
  // (createdAt, id) keyset boundary is exact.
  for (let index = 0; index < 445; index += 1) {
    await sql`
      insert into "Message_v2" ("id", "chatId", "role", "parts", "attachments", "createdAt")
      values (
        ${randomUUID()},
        ${messageChatId},
        ${index % 2 === 0 ? "user" : "assistant"},
        ${sql.json([{ type: "text", text: `phase12 message ${index}` }])},
        ${sql.json([])},
        ${timestamp(base, Math.floor(index / 4) * 1000)}
      )
    `;
  }

  const documentIds: string[] = [];
  const sha = "a".repeat(64);
  for (let index = 0; index < 137; index += 1) {
    const documentId = randomUUID();
    documentIds.push(documentId);
    const chatId = conversations[index % conversations.length] as string;
    // Every document shares one millisecond timestamp: the pagination boundary
    // must still cover every document exactly once.
    await sql`
      insert into "MatterDocument" (
        "id", "userId", "chatId", "legalMatterId", "originalFilename", "storageKey",
        "mimeType", "byteSize", "sha256", "processingStatus", "securityStatus",
        "storageStatus", "createdAt", "updatedAt"
      ) values (
        ${documentId}, ${ownerA.id}, ${chatId}, null, ${`phase12-evidence-${index}.pdf`},
        ${`phase12/test-key-${index}`}, 'application/pdf', ${1024}, ${sha},
        'not_started', 'clean', 'stored', ${timestamp(base, 0)}, ${timestamp(base, 0)}
      )
    `;
  }

  return {
    ownerA: ownerA.id,
    ownerB: ownerB.id,
    conversations,
    messageChatId,
    documentIds,
    chatId: conversations[0] as string,
  };
}

async function assertConversationPagination(
  queries: typeof import("@/lib/db/queries"),
  fixtures: Fixtures
) {
  const seen: string[] = [];
  let cursor: { timestamp: number; id: string } | null = null;
  for (;;) {
    const page = await queries.listImmigrationConversationsPage({
      userId: fixtures.ownerA,
      limit: 25,
      cursor,
    });
    for (const conversation of page.conversations) {
      seen.push(conversation.chatId);
    }
    const last = page.conversations.at(-1);
    if (!page.hasMore || !last) {
      break;
    }
    cursor = { timestamp: last.updatedAt.getTime(), id: last.chatId };
  }

  assert.equal(seen.length, fixtures.conversations.length);
  assert.equal(new Set(seen).size, fixtures.conversations.length);
  const timestamps = await Promise.all(
    seen.map(async (chatId) => {
      const conversation = await queries.getImmigrationConversationByChatId({
        chatId,
        userId: fixtures.ownerA,
      });
      return conversation?.updatedAt.getTime() ?? 0;
    })
  );
  for (let index = 1; index < timestamps.length; index += 1) {
    assert.ok(
      (timestamps[index] as number) <= (timestamps[index - 1] as number),
      "conversations must be ordered newest first"
    );
  }
  assert.equal(
    await queries.countImmigrationConversations({ userId: fixtures.ownerA }),
    fixtures.conversations.length
  );
}

async function assertMessagePagination(
  queries: typeof import("@/lib/db/queries"),
  fixtures: Fixtures
) {
  const pages: string[][] = [];
  let olderThan: { timestamp: number; id: string } | null = null;
  for (;;) {
    const page = await queries.listMessagesForChatPage({
      chatId: fixtures.messageChatId,
      userId: fixtures.ownerA,
      limit: 100,
      olderThan,
    });
    pages.push(page.messages.map((row) => row.id));
    const oldest = page.messages.at(0);
    if (!page.hasOlder || !oldest) {
      break;
    }
    olderThan = { timestamp: oldest.createdAt.getTime(), id: oldest.id };
  }
  const seen = [...pages].reverse().flat();
  assert.equal(seen.length, 445);
  assert.equal(new Set(seen).size, 445);

  const foreign = await queries.listMessagesForChatPage({
    chatId: fixtures.messageChatId,
    userId: fixtures.ownerB,
    limit: 100,
    olderThan: null,
  });
  assert.equal(foreign.messages.length, 0);
}

async function assertDocumentHistoryPagination(
  queries: typeof import("@/lib/db/queries"),
  fixtures: Fixtures
) {
  const seen: string[] = [];
  let cursor: { timestamp: number; id: string } | null = null;
  for (;;) {
    const page = await queries.listMatterDocumentsForUserHistoryPage({
      userId: fixtures.ownerA,
      limit: 40,
      cursor,
    });
    for (const document of page.documents) {
      seen.push(document.id);
    }
    const last = page.documents.at(-1);
    if (!page.hasMore || !last) {
      break;
    }
    cursor = { timestamp: last.createdAt.getTime(), id: last.id };
  }
  assert.equal(seen.length, fixtures.documentIds.length);
  assert.equal(new Set(seen).size, fixtures.documentIds.length);

  // Another account never sees these documents.
  const foreign = await queries.listMatterDocumentsForUserHistoryPage({
    userId: fixtures.ownerB,
    limit: 40,
    cursor: null,
  });
  assert.equal(foreign.documents.length, 0);
}

async function assertTurnDurability(
  queries: typeof import("@/lib/db/queries"),
  fixtures: Fixtures
) {
  const clientTurnId = `phase12-integration-${randomUUID()}`;
  const userMessageId = randomUUID();
  const now = new Date();

  const claims = await Promise.all([
    queries.claimConversationTurn({
      chatId: fixtures.chatId,
      userId: fixtures.ownerA,
      clientTurnId,
      assistantMode: "default",
      requestHash: "a".repeat(64),
      userMessageId,
      now,
    }),
    queries.claimConversationTurn({
      chatId: fixtures.chatId,
      userId: fixtures.ownerA,
      clientTurnId,
      assistantMode: "default",
      requestHash: "a".repeat(64),
      userMessageId,
      now,
    }),
  ]);
  assert.equal(claims.filter((claim) => claim.created).length, 1);
  assert.equal(claims[0]?.turn.id, claims[1]?.turn.id);

  const firstInsert = await queries.insertMessageIdempotent({
    chatId: fixtures.chatId,
    messageId: userMessageId,
    role: "user",
    parts: [{ type: "text", text: "phase12 integration question" }],
    createdAt: now,
  });
  assert.equal(firstInsert.inserted, true);
  const duplicateInsert = await queries.insertMessageIdempotent({
    chatId: fixtures.chatId,
    messageId: userMessageId,
    role: "user",
    parts: [{ type: "text", text: "phase12 integration question" }],
    createdAt: now,
  });
  assert.equal(duplicateInsert.inserted, false);

  const turnId = claims[0]?.turn.id as string;
  await queries.storeConversationTurnPendingAssistantParts({
    turnId,
    parts: [{ type: "text", text: "phase12 pending answer" }],
    now,
  });
  const completed = await queries.completeConversationTurn({
    turnId,
    assistantMessageId: randomUUID(),
    now,
  });
  assert.equal(completed?.status, "assistant_persisted");
  assert.equal(completed?.pendingAssistantParts, null);

  const read = await queries.getConversationTurnRecord({
    chatId: fixtures.chatId,
    clientTurnId,
  });
  assert.equal(read?.status, "assistant_persisted");
  assert.ok(read?.assistantMessageId);
}

async function assertOwnershipIsolation(
  queries: typeof import("@/lib/db/queries"),
  fixtures: Fixtures
) {
  assert.equal(
    await queries.getImmigrationConversationByChatId({
      chatId: fixtures.chatId,
      userId: fixtures.ownerB,
    }),
    null
  );
  assert.equal(
    await queries.getMessageForChat({
      chatId: fixtures.messageChatId,
      messageId: randomUUID(),
    }),
    null
  );
}

async function cleanup(sql: ReturnType<typeof postgres>, fixtures: Fixtures) {
  for (const userId of [fixtures.ownerA, fixtures.ownerB]) {
    await sql`delete from "ConversationTurn" where "userId" = ${userId}`;
    await sql`delete from "MatterDocument" where "userId" = ${userId}`;
    await sql`delete from "Message_v2" where "chatId" in (select "id" from "Chat" where "userId" = ${userId})`;
    await sql`delete from "ImmigrationConversation" where "chatId" in (select "id" from "Chat" where "userId" = ${userId})`;
    await sql`delete from "Chat" where "userId" = ${userId}`;
    await sql`delete from "User" where "id" = ${userId}`;
  }
}
