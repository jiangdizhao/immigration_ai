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
  /** Owner chat with messages but no ImmigrationConversation row. */
  legacyChatId: string;
  legacyMessageIds: string[];
  /** Owner chat with no conversation row and no messages. */
  emptyChatId: string;
  /** Another account's legacy chat. */
  foreignLegacyChatId: string;
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
      await assertLegacyChatCompatibility(sql, queries, fixtures);
      await assertTurnDurability(queries, fixtures);
      await assertConcurrentTurnExecution(sql, queries, fixtures);
      await assertAtomicFinalizeFencing(sql, queries, fixtures);
      await assertFinalizeDatabaseErrorRecovery(sql, queries, fixtures);
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

  // Phase 12 Stage 1 R1 legacy fixtures: owner chats that hold messages but
  // have no ImmigrationConversation row, one empty chat, and a foreign legacy
  // chat. None of them may be modified by the read paths under test.
  const legacyChatId = randomUUID();
  const emptyChatId = randomUUID();
  const foreignLegacyChatId = randomUUID();
  const legacyMessageIds = [randomUUID(), randomUUID()];
  const legacyChatRows: Array<{
    id: string;
    userId: string;
    title: string;
    createdAt: Date;
  }> = [
    {
      id: legacyChatId,
      userId: ownerA.id,
      title: "Phase12 legacy chat",
      createdAt: timestamp(base, -600_000),
    },
    {
      id: emptyChatId,
      userId: ownerA.id,
      title: "Phase12 empty chat",
      createdAt: timestamp(base, -500_000),
    },
    {
      id: foreignLegacyChatId,
      userId: ownerB.id,
      title: "Phase12 foreign legacy chat",
      createdAt: timestamp(base, -400_000),
    },
  ];
  for (const row of legacyChatRows) {
    await sql`
      insert into "Chat" ("id", "createdAt", "title", "userId", "visibility")
      values (${row.id}, ${row.createdAt}, ${row.title}, ${row.userId}, 'private')
    `;
  }
  for (const [index, messageId] of legacyMessageIds.entries()) {
    await sql`
      insert into "Message_v2" ("id", "chatId", "role", "parts", "attachments", "createdAt")
      values (
        ${messageId},
        ${legacyChatId},
        ${index === 0 ? "user" : "assistant"},
        ${sql.json([{ type: "text", text: `phase12 legacy message ${index}` }])},
        ${sql.json([])},
        ${timestamp(base, -600_000 + index * 1000)}
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
    legacyChatId,
    legacyMessageIds,
    emptyChatId,
    foreignLegacyChatId,
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

  const eligible = [...fixtures.conversations, fixtures.legacyChatId];
  assert.equal(seen.length, eligible.length);
  assert.equal(new Set(seen).size, eligible.length);
  assert.ok(
    seen.includes(fixtures.legacyChatId),
    "a legacy chat with messages must stay visible in history"
  );
  assert.ok(
    !seen.includes(fixtures.emptyChatId),
    "a chat with no conversation row and no messages is not history"
  );
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
    eligible.length,
    "totalCount must describe the same eligible set as the list"
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
  const ownerId = "phase12-owner-a";
  const acquired = await queries.acquireConversationTurnExecution({
    turnId,
    ownerId,
    leaseMs: 60_000,
    now,
  });
  assert.equal(acquired?.executionOwnerId, ownerId);
  assert.equal(acquired?.executionAttempt, 1);
  const attempt = acquired?.executionAttempt as number;

  // A second owner cannot take a live lease, and a foreign fence cannot write.
  assert.equal(
    await queries.acquireConversationTurnExecution({
      turnId,
      ownerId: "phase12-owner-b",
      leaseMs: 60_000,
      now,
    }),
    null
  );
  assert.equal(
    await queries.storeConversationTurnPendingAssistantParts({
      turnId,
      ownerId: "phase12-owner-b",
      executionAttempt: attempt,
      parts: [{ type: "text", text: "injected" }],
      now,
    }),
    null
  );

  const pending = await queries.storeConversationTurnPendingAssistantParts({
    turnId,
    ownerId,
    executionAttempt: attempt,
    parts: [{ type: "text", text: "phase12 pending answer" }],
    now,
  });
  assert.equal(Array.isArray(pending?.pendingAssistantParts), true);

  // A foreign owner may not finalize or fail this turn.
  const assistantMessageId = randomUUID();
  const foreignFinalize = await queries.finalizeConversationTurnAtomic({
    turnId,
    ownerId: "phase12-owner-b",
    executionAttempt: attempt,
    chatId: fixtures.chatId,
    assistantMessageId,
    parts: [{ type: "text", text: "foreign answer" }],
    createdAt: new Date(now.getTime() + 1),
    now,
  });
  assert.equal(foreignFinalize.outcome, "fence_lost");
  assert.equal(
    await queries.failConversationTurn({
      turnId,
      ownerId: "phase12-owner-b",
      executionAttempt: attempt,
      errorCode: "foreign_attempt",
      now,
    }),
    null
  );

  const completed = await queries.finalizeConversationTurnAtomic({
    turnId,
    ownerId,
    executionAttempt: attempt,
    chatId: fixtures.chatId,
    assistantMessageId,
    parts: [{ type: "text", text: "phase12 integration answer" }],
    createdAt: new Date(now.getTime() + 1),
    now,
  });
  assert.equal(completed.outcome, "completed");
  const storedAssistant = await queries.getMessageForChat({
    chatId: fixtures.chatId,
    messageId: assistantMessageId,
  });
  assert.equal(storedAssistant?.role, "assistant");

  // An obsolete attempt can never re-complete or overwrite the turn.
  const staleComplete = await queries.finalizeConversationTurnAtomic({
    turnId,
    ownerId: "phase12-owner-b",
    executionAttempt: 99,
    chatId: fixtures.chatId,
    assistantMessageId,
    parts: [{ type: "text", text: "obsolete answer" }],
    createdAt: new Date(now.getTime() + 2),
    now,
  });
  assert.equal(staleComplete.outcome, "already_completed");
  const storedAfterStale = await queries.getMessageForChat({
    chatId: fixtures.chatId,
    messageId: assistantMessageId,
  });
  assert.deepEqual(storedAfterStale?.parts, [
    { type: "text", text: "phase12 integration answer" },
  ]);
  assert.equal(
    staleComplete.outcome === "already_completed"
      ? staleComplete.turn.assistantMessageId
      : null,
    completed.outcome === "completed" ? completed.turn.assistantMessageId : null
  );
  assert.equal(completed.outcome, "completed");
  assert.equal(completed.turn.pendingAssistantParts, null);

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

/**
 * Phase 12 Stage 1 R1 historical compatibility: a chat that holds messages but
 * has no `ImmigrationConversation` row stays visible and readable, an empty chat
 * without a conversation row stays hidden, and no read path mutates the data.
 */
/**
 * Phase 12 Stage 1 R1 historical compatibility: a chat that holds messages but
 * has no `ImmigrationConversation` row stays visible and readable, an empty chat
 * without a conversation row stays hidden, and no read path mutates the data.
 */
async function assertLegacyChatCompatibility(
  sql: ReturnType<typeof postgres>,
  queries: typeof import("@/lib/db/queries"),
  fixtures: Fixtures
) {
  const listed = await queries.listImmigrationConversationsPage({
    userId: fixtures.ownerA,
    limit: 200,
    cursor: null,
  });
  const legacyEntry = listed.conversations.find(
    (conversation) => conversation.chatId === fixtures.legacyChatId
  );
  assert.ok(legacyEntry, "the legacy chat must be listed");
  assert.equal(legacyEntry.origin, "legacy_chat");
  assert.equal(legacyEntry.legalMatterId, null);
  assert.equal(legacyEntry.chatTitle, "Phase12 legacy chat");
  assert.ok(
    listed.conversations.every(
      (conversation) => conversation.chatId !== fixtures.emptyChatId
    ),
    "an empty chat without a conversation row must not be listed"
  );
  const widgetEntry = listed.conversations.find(
    (conversation) => conversation.chatId === fixtures.chatId
  );
  assert.equal(widgetEntry?.origin, "immigration");

  // Owner-authorized read of the legacy chat; another account is refused.
  const legacySummary = await queries.getOwnedLegacyChatSummary({
    chatId: fixtures.legacyChatId,
    userId: fixtures.ownerA,
  });
  assert.equal(legacySummary?.origin, "legacy_chat");
  assert.equal(legacySummary?.legalMatterId, null);
  assert.equal(
    await queries.getOwnedLegacyChatSummary({
      chatId: fixtures.legacyChatId,
      userId: fixtures.ownerB,
    }),
    null,
    "another account must never read this legacy chat"
  );
  assert.equal(
    await queries.getOwnedLegacyChatSummary({
      chatId: fixtures.foreignLegacyChatId,
      userId: fixtures.ownerA,
    }),
    null
  );

  const messages = await queries.listMessagesForChatPage({
    chatId: fixtures.legacyChatId,
    userId: fixtures.ownerA,
    limit: 50,
    olderThan: null,
  });
  assert.deepEqual(
    messages.messages.map((message) => message.id).sort(),
    [...fixtures.legacyMessageIds].sort(),
    "legacy message identifiers must be preserved"
  );
  const foreignMessages = await queries.listMessagesForChatPage({
    chatId: fixtures.legacyChatId,
    userId: fixtures.ownerB,
    limit: 50,
    olderThan: null,
  });
  assert.equal(foreignMessages.messages.length, 0);

  // No read path may create or modify conversation rows or messages.
  const [row] = (await sql`
    select count(*)::int as total
    from "ImmigrationConversation" c
    join "Chat" ch on ch."id" = c."chatId"
    where ch."userId" = ${fixtures.ownerA}
  `) as unknown as { total: number }[];
  assert.equal(
    Number(row?.total ?? -1),
    fixtures.conversations.length,
    "reads must never backfill a missing conversation row"
  );
}

/**
 * Phase 12 Stage 1 R1 exclusive execution: real concurrent requests against real
 * PostgreSQL. Exactly one request may own the model stage for a client turn, so
 * exactly one model invocation and exactly one assistant message can result.
 */
async function assertConcurrentTurnExecution(
  sql: ReturnType<typeof postgres>,
  queries: typeof import("@/lib/db/queries"),
  fixtures: Fixtures
) {
  const runtime = await import("@/lib/conversations/runtime");
  const { deterministicMessageId } = await import(
    "@/lib/conversations/turn-ledger"
  );
  const service = runtime.getConversationTurnService();
  const clientTurnId = `phase12-concurrency-${randomUUID()}`;
  const question = "phase12 concurrency question";
  const parts = [
    { type: "text", text: "phase12 concurrency answer" },
    { type: "metadata", citations: [], compactSources: [] },
  ];

  // Four simultaneous route-equivalent requests for the same client turn.
  const attempts = await Promise.all(
    Array.from({ length: 4 }, () =>
      service.beginTurn({
        userId: fixtures.ownerA,
        chatId: fixtures.chatId,
        clientTurnId,
        question,
        assistantMode: "default",
      })
    )
  );

  const executable = attempts.filter((attempt) => attempt.ok);
  assert.equal(
    executable.length,
    1,
    "exactly one concurrent request may execute the model"
  );
  assert.equal(
    attempts.filter((attempt) => attempt.kind === "in_progress").length,
    3
  );

  // The model stage runs only for the lease holder.
  let modelInvocations = 0;
  for (const attempt of attempts) {
    if (!attempt.ok) {
      continue;
    }
    modelInvocations += 1;
    const completed = await service.completeTurn({
      userId: fixtures.ownerA,
      chatId: fixtures.chatId,
      clientTurnId,
      parts,
      executionOwnerId: attempt.executionOwnerId as string,
      executionAttempt: attempt.executionAttempt as number,
    });
    assert.equal(completed.saved, true);
    assert.equal(completed.linkVerified, true);
    assert.equal(
      completed.assistantMessageId,
      deterministicMessageId(`assistant:${attempt.turnId as string}`)
    );
  }
  assert.equal(modelInvocations, 1);

  const turn = await queries.getConversationTurnRecord({
    chatId: fixtures.chatId,
    clientTurnId,
  });
  assert.equal(turn?.status, "assistant_persisted");
  assert.equal(turn?.executionAttempt, 1);
  const userMessageId = turn?.userMessageId as string;
  const assistantMessageId = turn?.assistantMessageId as string;

  const storedRows = (await sql`
    select "id", "role" from "Message_v2"
    where "chatId" = ${fixtures.chatId}
      and "id" in (${userMessageId}, ${assistantMessageId})
  `) as unknown as { id: string; role: string }[];
  assert.equal(
    storedRows.filter((row) => row.role === "user").length,
    1,
    "exactly one durable user message"
  );
  assert.equal(
    storedRows.filter((row) => row.role === "assistant").length,
    1,
    "exactly one durable assistant message"
  );

  // A retry replays the stored answer instead of generating another one.
  const replay = await service.beginTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId,
    question,
    assistantMode: "default",
  });
  assert.equal(replay.kind, "replayed");
  assert.equal(replay.replay?.assistantMessageId, assistantMessageId);
  assert.equal(modelInvocations, 1);

  // A late completion from an obsolete attempt may not overwrite the answer.
  const obsolete = await service.completeTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId,
    parts: [{ type: "text", text: "obsolete answer that must not win" }],
    executionOwnerId: "phase12-obsolete-attempt",
    executionAttempt: 99,
  });
  assert.equal(obsolete.assistantMessageId, assistantMessageId);
  const afterObsolete = await queries.getMessageForChat({
    chatId: fixtures.chatId,
    messageId: assistantMessageId,
  });
  assert.deepEqual(
    afterObsolete?.parts,
    parts,
    "the stored answer must never be replaced by an obsolete attempt"
  );

  // Stale-lease recovery on real PostgreSQL: a live lease cannot be stolen, an
  // expired (crashed) lease can be taken over, and the obsolete attempt can no
  // longer write anything for that turn.
  const staleTurnId = `phase12-stale-${randomUUID()}`;
  const stalled = await service.beginTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId: staleTurnId,
    question,
    assistantMode: "default",
  });
  assert.equal(stalled.ok, true);
  assert.equal(
    await queries.acquireConversationTurnExecution({
      turnId: stalled.turnId as string,
      ownerId: "phase12-newer-attempt",
      leaseMs: 60_000,
      now: new Date(),
    }),
    null,
    "a live lease must not be stolen before it expires"
  );

  await sql`
    update "ConversationTurn"
    set "executionLeaseExpiresAt" = now() - interval '1 minute'
    where "id" = ${stalled.turnId as string}
  `;
  const takeover = await service.beginTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId: staleTurnId,
    question,
    assistantMode: "default",
  });
  assert.equal(takeover.ok, true);
  assert.notEqual(takeover.executionOwnerId, stalled.executionOwnerId);

  const stolenWrite = await service.completeTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId: staleTurnId,
    parts: [{ type: "text", text: "stale answer" }],
    executionOwnerId: stalled.executionOwnerId as string,
    executionAttempt: stalled.executionAttempt as number,
  });
  assert.equal(stolenWrite.assistantTurnPersisted, false);
  assert.equal(stolenWrite.saved, false);
  assert.equal(stolenWrite.errorCode, "turn_execution_lease_lost");

  const takeoverWrite = await service.completeTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId: staleTurnId,
    parts: [{ type: "text", text: "takeover answer" }],
    executionOwnerId: takeover.executionOwnerId as string,
    executionAttempt: takeover.executionAttempt as number,
  });
  assert.equal(takeoverWrite.saved, true);
}

/**
 * Phase 12 Stage 1 R2: the mandated deterministic interleaving for atomic
 * assistant persistence.
 *
 * A acquires the lease and reaches the persistence boundary (its pending payload
 * is stored), then A's lease expires, B takes over, and only then does A resume.
 * A must not insert or finalize anything, B must persist exactly one correct
 * assistant message, and a later retry must replay that same result.
 */
async function assertAtomicFinalizeFencing(
  sql: ReturnType<typeof postgres>,
  queries: typeof import("@/lib/db/queries"),
  fixtures: Fixtures
) {
  const runtime = await import("@/lib/conversations/runtime");
  const { deterministicMessageId } = await import(
    "@/lib/conversations/message-identity"
  );
  const { requestHashForQuestion } = await import(
    "@/lib/conversations/turn-ledger"
  );
  const service = runtime.getConversationTurnService();
  const clientTurnId = `phase12-atomic-${randomUUID()}`;
  const question = "phase12 atomic finalization question";
  const userMessageId = randomUUID();
  const now = new Date();
  const aParts = [{ type: "text", text: "answer generated by attempt A" }];
  const bParts = [{ type: "text", text: "answer generated by attempt B" }];

  // A claims the turn and owns the lease.
  const claims = await queries.claimConversationTurn({
    chatId: fixtures.chatId,
    userId: fixtures.ownerA,
    clientTurnId,
    assistantMode: "default",
    requestHash: requestHashForQuestion(question),
    userMessageId,
    now,
  });
  const turnId = claims.turn.id;
  await queries.insertMessageIdempotent({
    chatId: fixtures.chatId,
    messageId: userMessageId,
    role: "user",
    parts: [{ type: "text", text: question }],
    createdAt: now,
  });
  const attemptA = await queries.acquireConversationTurnExecution({
    turnId,
    ownerId: "phase12-atomic-a",
    leaseMs: 60_000,
    now,
  });
  assert.equal(attemptA?.executionAttempt, 1);

  // A reaches the persistence boundary: payload stored, message not yet written.
  const payloadA = await queries.storeConversationTurnPendingAssistantParts({
    turnId,
    ownerId: "phase12-atomic-a",
    executionAttempt: 1,
    parts: aParts,
    now,
  });
  assert.deepEqual(payloadA?.pendingAssistantParts, aParts);

  // A's lease expires (crashed/stalled attempt), and B takes over.
  await sql`
    update "ConversationTurn"
    set "executionLeaseExpiresAt" = now() - interval '1 minute'
    where "id" = ${turnId}
  `;
  const attemptB = await queries.acquireConversationTurnExecution({
    turnId,
    ownerId: "phase12-atomic-b",
    leaseMs: 60_000,
    now: new Date(),
  });
  assert.equal(attemptB?.executionAttempt, 2);
  assert.equal(attemptB?.executionOwnerId, "phase12-atomic-b");

  const assistantMessageId = deterministicMessageId(`assistant:${turnId}`);

  // A resumes after the takeover: it must not insert an assistant message,
  // finalize the turn, or clear B's ownership of the payload.
  const staleFinalize = await queries.finalizeConversationTurnAtomic({
    turnId,
    ownerId: "phase12-atomic-a",
    executionAttempt: 1,
    chatId: fixtures.chatId,
    assistantMessageId,
    parts: aParts,
    createdAt: new Date(now.getTime() + 1),
    now: new Date(),
  });
  assert.equal(staleFinalize.outcome, "fence_lost");
  const afterStaleRows = (await sql`
    select count(*)::int as total from "Message_v2" where "id" = ${assistantMessageId}
  `) as unknown as { total: number }[];
  assert.equal(
    Number(afterStaleRows[0]?.total ?? -1),
    0,
    "the stale attempt must not insert an assistant message"
  );
  // B finalizes its own answer: exactly one assistant message, correct content.
  const completedB = await queries.finalizeConversationTurnAtomic({
    turnId,
    ownerId: "phase12-atomic-b",
    executionAttempt: 2,
    chatId: fixtures.chatId,
    assistantMessageId,
    parts: bParts,
    createdAt: new Date(now.getTime() + 1),
    now: new Date(),
  });
  assert.equal(completedB.outcome, "completed");
  if (completedB.outcome !== "completed") {
    throw new Error("attempt B must be able to finalize the turn");
  }
  assert.equal(completedB.linkVerified, true);
  const storedB = await queries.getMessageForChat({
    chatId: fixtures.chatId,
    messageId: assistantMessageId,
  });
  assert.deepEqual(storedB?.parts, bParts);
  const messageRows = (await sql`
    select count(*)::int as total from "Message_v2"
    where "chatId" = ${fixtures.chatId}
      and "role" = 'assistant'
      and "id" = ${assistantMessageId}
  `) as unknown as { total: number }[];
  assert.equal(Number(messageRows[0]?.total ?? -1), 1);

  // A late A finalization can never overwrite B's answer.
  const lateFinalize = await queries.finalizeConversationTurnAtomic({
    turnId,
    ownerId: "phase12-atomic-a",
    executionAttempt: 1,
    chatId: fixtures.chatId,
    assistantMessageId,
    parts: aParts,
    createdAt: new Date(now.getTime() + 2),
    now: new Date(),
  });
  assert.equal(lateFinalize.outcome, "already_completed");
  const storedAfterLate = await queries.getMessageForChat({
    chatId: fixtures.chatId,
    messageId: assistantMessageId,
  });
  assert.deepEqual(
    storedAfterLate?.parts,
    bParts,
    "the stored answer must never be replaced by the obsolete attempt"
  );

  // A retry replays the same result without generating anything again.
  const replay = await service.beginTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId,
    question,
    assistantMode: "default",
  });
  assert.equal(replay.kind, "replayed");
  assert.equal(replay.replay?.assistantMessageId, assistantMessageId);

  // A stale attempt cannot clear the finalized state either.
  const lateFailure = await service.failTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId,
    errorCode: "obsolete_attempt",
    executionOwnerId: "phase12-atomic-a",
    executionAttempt: 1,
  });
  assert.equal(lateFailure, false);
  const finalTurn = await queries.getConversationTurnRecord({
    chatId: fixtures.chatId,
    clientTurnId,
  });
  assert.equal(finalTurn?.status, "assistant_persisted");
  assert.equal(finalTurn?.assistantMessageId, assistantMessageId);
  assert.equal(finalTurn?.executionAttempt, 2);
}

/**
 * Phase 12 Stage 1 R2: a database error between the pending-payload write and
 * terminal persistence must roll back completely, and the retry must resume the
 * stored answer without another model call.
 */
async function assertFinalizeDatabaseErrorRecovery(
  sql: ReturnType<typeof postgres>,
  queries: typeof import("@/lib/db/queries"),
  fixtures: Fixtures
) {
  const runtime = await import("@/lib/conversations/runtime");
  const { deterministicMessageId } = await import(
    "@/lib/conversations/message-identity"
  );
  const { requestHashForQuestion } = await import(
    "@/lib/conversations/turn-ledger"
  );
  const service = runtime.getConversationTurnService();
  const clientTurnId = `phase12-atomic-error-${randomUUID()}`;
  const question = "phase12 error question";
  const userMessageId = randomUUID();
  const now = new Date();
  const parts = [{ type: "text", text: "phase12 error answer" }];

  const claim = await queries.claimConversationTurn({
    chatId: fixtures.chatId,
    userId: fixtures.ownerA,
    clientTurnId,
    assistantMode: "default",
    requestHash: requestHashForQuestion(question),
    userMessageId,
    now,
  });
  await queries.insertMessageIdempotent({
    chatId: fixtures.chatId,
    messageId: userMessageId,
    role: "user",
    parts: [{ type: "text", text: question }],
    createdAt: now,
  });
  await queries.acquireConversationTurnExecution({
    turnId: claim.turn.id,
    ownerId: "phase12-atomic-error",
    leaseMs: 60_000,
    now,
  });
  await queries.storeConversationTurnPendingAssistantParts({
    turnId: claim.turn.id,
    ownerId: "phase12-atomic-error",
    executionAttempt: 1,
    parts,
    now,
  });

  // A non-existent chat id makes the message insert fail inside the
  // transaction, so the whole finalization must roll back.
  const dbError = await queries.finalizeConversationTurnAtomic({
    turnId: claim.turn.id,
    ownerId: "phase12-atomic-error",
    executionAttempt: 1,
    chatId: randomUUID(),
    assistantMessageId: deterministicMessageId(`assistant:${claim.turn.id}`),
    parts,
    createdAt: new Date(now.getTime() + 1),
    now,
  });
  assert.equal(dbError.outcome, "write_failed");

  const afterError = await queries.getConversationTurnRecord({
    chatId: fixtures.chatId,
    clientTurnId,
  });
  assert.equal(afterError?.status, "user_persisted");
  assert.deepEqual(afterError?.pendingAssistantParts, parts);
  const orphanRows = (await sql`
    select count(*)::int as total from "Message_v2"
    where "id" = ${deterministicMessageId(`assistant:${claim.turn.id}`)}
  `) as unknown as { total: number }[];
  assert.equal(
    Number(orphanRows[0]?.total ?? -1),
    0,
    "a failed finalization must not leave a message behind"
  );

  // The stalled attempt's lease expires (as it would after a crashed process),
  // and the retry acquires a fresh fence and resumes the stored payload.
  await sql`
    update "ConversationTurn"
    set "executionLeaseExpiresAt" = now() - interval '1 minute'
    where "id" = ${claim.turn.id}
  `;
  const retry = await service.beginTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId,
    question,
    assistantMode: "default",
  });
  assert.equal(retry.kind, "resumed");
  assert.equal(retry.executionAttempt, 2);
  const finalized = await service.completeTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId,
    parts: retry.pendingAssistantParts ?? [],
    executionOwnerId: retry.executionOwnerId as string,
    executionAttempt: retry.executionAttempt as number,
  });
  assert.equal(finalized.saved, true);
  assert.equal(finalized.alreadyPersisted, false);

  // A duplicate completion of the same turn is idempotent.
  const duplicate = await service.completeTurn({
    userId: fixtures.ownerA,
    chatId: fixtures.chatId,
    clientTurnId,
    parts: retry.pendingAssistantParts ?? [],
    executionOwnerId: retry.executionOwnerId as string,
    executionAttempt: retry.executionAttempt as number,
  });
  assert.equal(duplicate.alreadyPersisted, true);
  assert.equal(duplicate.assistantMessageId, finalized.assistantMessageId);
  assert.equal(duplicate.saved, true);
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
