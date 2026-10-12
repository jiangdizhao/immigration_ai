// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertion helpers are invoked only from tests.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";

/**
 * Phase 12 Stage 2 PostgreSQL integration coverage for the durable
 * policy-to-conversation binding.
 *
 * Destructive work runs only against the isolated disposable database created by
 * `scripts/phase12-stage1-test-db.ts`. Without `PHASE12_TEST_DATABASE_URL` the
 * test is skipped with an explicit reason, never reported as passed.
 *
 * Run with:
 *   PHASE12_TEST_DATABASE_URL=… pnpm run test:phase12:stage2:integration
 */

const TEST_DATABASE_URL = process.env.PHASE12_TEST_DATABASE_URL?.trim() ?? "";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE12_TEST_DATABASE_URL is not configured (isolated test database required)";

const OWNER_A_EMAIL = `p12s2a-${randomUUID()}@example.test`;
const OWNER_B_EMAIL = `p12s2b-${randomUUID()}@example.test`;

const SLUG = "evisitor-application-arrangements-lin-26-061";

type Fixtures = { ownerA: string; ownerB: string };

async function seed(sql: ReturnType<typeof postgres>): Promise<Fixtures> {
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
  return { ownerA: ownerA.id, ownerB: ownerB.id };
}

async function cleanup(sql: ReturnType<typeof postgres>, fixtures: Fixtures) {
  for (const userId of [fixtures.ownerA, fixtures.ownerB]) {
    await sql`delete from "ConversationPolicyBinding" where "userId" = ${userId}`;
    await sql`delete from "ConversationTurn" where "userId" = ${userId}`;
    await sql`delete from "Message_v2" where "chatId" in (select "id" from "Chat" where "userId" = ${userId})`;
    await sql`delete from "ImmigrationConversation" where "chatId" in (select "id" from "Chat" where "userId" = ${userId})`;
    await sql`delete from "Chat" where "userId" = ${userId}`;
    await sql`delete from "User" where "id" = ${userId}`;
  }
}

function draft(launchId: string, revisionNumber = 2, titleZh = "政策主题快照") {
  return {
    policySlug: SLUG,
    policyOrigin: "automated" as const,
    policyItemId: "item-1",
    policyRevisionNumber: revisionNumber,
    policyPublishedAt: "2026-10-01T02:01:00.000Z",
    policySourceStatus: "announced",
    policyRevisionToken: `${SLUG}@r${revisionNumber}@2026-10-01T02:01:00.000Z`,
    titleZh,
    titleEn: "eVisitor application arrangements",
    officialTitle: "eVisitor application arrangements",
    officialUrl: "https://immi.homeaffairs.gov.au/visas/evisitor",
    launchId,
  };
}

test(
  "durable policy bindings are owner-scoped, idempotent and snapshot-stable",
  { skip: skipReason },
  async () => {
    process.env.POSTGRES_URL = TEST_DATABASE_URL;
    const sql = postgres(TEST_DATABASE_URL, {
      max: 4,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
    });

    const queries = await import("@/lib/db/queries");
    let fixtures: Fixtures | null = null;
    try {
      fixtures = await seed(sql);
      const { ownerA, ownerB } = fixtures;

      // The binding table exists in this migrated database.
      const [{ present }] = await sql<{ present: boolean }[]>`
        select to_regclass('public."ConversationPolicyBinding"') is not null as present
      `;
      assert.equal(present, true);

      // 1. A binding is written atomically with its conversation.
      const created = await queries.createImmigrationConversationWithPolicyBinding({
        userId: ownerA,
        title: "Policy question: eVisitor",
        binding: draft("launch-0001"),
      });
      assert.equal(created.binding.policySlug, SLUG);
      assert.equal(created.binding.userId, ownerA);
      assert.equal(created.binding.chatId, created.conversation.chatId);
      assert.equal(created.binding.titleZh, "政策主题快照");

      // 2. The owner reads the snapshot back through the owner-scoped lookup.
      const owned = await queries.getOwnedConversationPolicyBinding({
        chatId: created.conversation.chatId,
        userId: ownerA,
      });
      assert.ok(owned);
      assert.equal(owned.policyRevisionToken, `${SLUG}@r2@2026-10-01T02:01:00.000Z`);

      // 3. Another account can never read that binding.
      assert.equal(
        await queries.getOwnedConversationPolicyBinding({
          chatId: created.conversation.chatId,
          userId: ownerB,
        }),
        null
      );
      assert.deepEqual(
        await queries.listOwnedConversationPolicyBindings({
          userId: ownerB,
          chatIds: [created.conversation.chatId],
        }),
        []
      );

      // 4. A repeated launch id resolves to the same conversation instead of
      //    creating a second empty one, and the unique index enforces it even
      //    for a racing insert.
      const repeated = await queries.findOwnedConversationByPolicyLaunchId({
        userId: ownerA,
        launchId: "launch-0001",
      });
      assert.equal(repeated?.chatId, created.conversation.chatId);
      await assert.rejects(
        () =>
          queries.createImmigrationConversationWithPolicyBinding({
            userId: ownerA,
            title: "Duplicate launch",
            binding: draft("launch-0001"),
          }),
        (error: { code?: string }) => error.code === "23505"
      );
      // The rejected duplicate left no orphan conversation behind.
      const [{ count: orphanCount }] = await sql<{ count: number }[]>`
        select count(*)::int as count from "ImmigrationConversation" c
        join "Chat" ch on ch."id" = c."chatId"
        where ch."userId" = ${ownerA} and c."title" = 'Duplicate launch'
      `;
      assert.equal(orphanCount, 0);

      // Another account may use the same launch value: uniqueness is per owner.
      const otherLaunch = await queries.createImmigrationConversationWithPolicyBinding({
        userId: ownerB,
        title: "Other account policy question",
        binding: draft("launch-0001"),
      });
      assert.equal(otherLaunch.binding.userId, ownerB);

      // 5. A later policy revision never rewrites an existing snapshot.
      const newerRevision = await queries.createImmigrationConversationWithPolicyBinding({
        userId: ownerA,
        title: "Policy question: eVisitor (new revision)",
        binding: draft("launch-0002", 7, "新版本主题"),
      });
      const originalAgain = await queries.getOwnedConversationPolicyBinding({
        chatId: created.conversation.chatId,
        userId: ownerA,
      });
      assert.equal(originalAgain?.policyRevisionNumber, 2);
      assert.equal(originalAgain?.titleZh, "政策主题快照");
      assert.equal(newerRevision.binding.policyRevisionNumber, 7);

      // 6. The owner's list read returns exactly their own bindings.
      const listed = await queries.listOwnedConversationPolicyBindings({
        userId: ownerA,
        chatIds: [
          created.conversation.chatId,
          newerRevision.conversation.chatId,
          otherLaunch.conversation.chatId,
        ],
      });
      assert.equal(listed.length, 2);
      assert.deepEqual(listed.map((row) => row.chatId).sort(), [
        created.conversation.chatId,
        newerRevision.conversation.chatId,
      ].sort());

      // 7. Deleting the chat removes the binding (no orphan topic identity).
      await sql`delete from "Chat" where "id" = ${newerRevision.conversation.chatId}`;
      const [{ count: remaining }] = await sql<{ count: number }[]>`
        select count(*)::int as count from "ConversationPolicyBinding"
        where "chatId" = ${newerRevision.conversation.chatId}
      `;
      assert.equal(remaining, 0);

      // 8. An unresolvable policy slug creates nothing at all.
      const bindingService = await import(
        "@/lib/policy-intelligence/conversation-policy-binding-service"
      );
      bindingService.resetConversationBindingSchemaCache();
      const outcome = await bindingService.createPolicyBoundConversation({
        userId: ownerA,
        title: "Unknown policy",
        slug: "no-such-published-policy",
        launchId: "launch-0003",
      });
      assert.equal(outcome.status, "resolve_failed");
      const [{ count: unknownCount }] = await sql<{ count: number }[]>`
        select count(*)::int as count from "ImmigrationConversation" c
        join "Chat" ch on ch."id" = c."chatId"
        where ch."userId" = ${ownerA} and c."title" = 'Unknown policy'
      `;
      assert.equal(unknownCount, 0);

      // 9. The context resolver keeps another account's policy scope empty.
      const resolver = await import("@/lib/workspace/context-resolver");
      const foreignContext = await resolver.resolveWorkspaceContext({
        userId: ownerB,
        chatId: created.conversation.chatId,
        clientPolicySlug: SLUG,
      });
      assert.equal(foreignContext.conversation, null);
      assert.equal(foreignContext.policyBinding, null);
      assert.equal(foreignContext.policyTopic.slug, null);
      assert.equal(foreignContext.scope.projectId, null);

      const ownedContext = await resolver.resolveWorkspaceContext({
        userId: ownerA,
        chatId: created.conversation.chatId,
        clientPolicySlug: "a-different-claim",
      });
      assert.equal(ownedContext.conversation?.authorized, true);
      assert.equal(ownedContext.policyTopic.source, "binding");
      assert.equal(ownedContext.policyTopic.slug, SLUG);
      assert.deepEqual(ownedContext.documents.evidence.documents, []);
      assert.equal(ownedContext.documents.status.total, 0);
    } finally {
      if (fixtures) {
        await cleanup(sql, fixtures);
      }
      await sql.end({ timeout: 5 });
      // The schema probe and the lazy application client must both be closed, or
      // an idle connection keeps the test process alive.
      const bindingSchema = await import(
        "@/lib/policy-intelligence/conversation-policy-binding-schema"
      );
      await bindingSchema.closeConversationBindingSchemaClient();
      const runtimeClient = await import("@/lib/db/runtime-client");
      await runtimeClient.closeLazyDatabase();
    }
  }
);
