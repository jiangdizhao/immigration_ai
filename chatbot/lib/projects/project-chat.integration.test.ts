// biome-ignore-all lint/suspicious/noMisplacedAssertion: helpers are scoped to the guarded disposable-database test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { test } from "node:test";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: resolve(".env.local"), override: false });

const TEST_DATABASE_URL =
  process.env.PHASE13_M1_1_TEST_DATABASE_URL?.trim() ?? "";
const EXPECTED_DATABASE = "immigration_ai_phase13_m1_1_test";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE13_M1_1_TEST_DATABASE_URL is not configured (isolated database required)";

function assertConfiguredTarget(value: string) {
  const url = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.equal(url.pathname.replace(/^\//u, ""), EXPECTED_DATABASE);
  assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname));
}

function operationId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function clientTurnId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

async function insertUser(
  sql: ReturnType<typeof postgres>,
  label: string,
  role = "user"
) {
  const email = `${label}-${randomUUID().replaceAll("-", "").slice(0, 20)}@example.test`;
  const [row] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password", "role")
    values (${email}, ${"x".repeat(64)}, ${role})
    returning "id"
  `;
  return row.id;
}

async function setActiveMembership(
  sql: ReturnType<typeof postgres>,
  input: { projectId: string; ownerId: string; userId: string }
) {
  const at = new Date();
  await sql`
    insert into "ProjectMembership" (
      "projectId", "userId", "status", "invitedByUserId",
      "createdAt", "updatedAt", "acceptedAt", "revokedAt"
    ) values (
      ${input.projectId}, ${input.userId}, 'active', ${input.ownerId},
      ${at.toISOString()}, ${at.toISOString()}, ${at.toISOString()}, null
    )
  `;
}

async function cleanup(
  sql: ReturnType<typeof postgres>,
  input: { users: string[]; projects: string[]; chats: string[] }
) {
  if (input.chats.length) {
    await sql`delete from "Message_v2" where "chatId" = any(${sql.array(input.chats)}::uuid[])`;
    await sql`delete from "ConversationTurn" where "chatId" = any(${sql.array(input.chats)}::uuid[])`;
  }
  if (input.projects.length) {
    await sql`delete from "ProjectEvent" where "projectId" = any(${sql.array(input.projects)}::uuid[])`;
  }
  if (input.users.length) {
    await sql`delete from "ProjectOperation" where "actorUserId" = any(${sql.array(input.users)}::uuid[])`;
  }
  if (input.projects.length) {
    await sql`delete from "ProjectConversation" where "projectId" = any(${sql.array(input.projects)}::uuid[])`;
    await sql`delete from "ProjectMembership" where "projectId" = any(${sql.array(input.projects)}::uuid[])`;
  }
  if (input.chats.length) {
    await sql`delete from "ImmigrationConversation" where "chatId" = any(${sql.array(input.chats)}::uuid[])`;
    await sql`delete from "Chat" where "id" = any(${sql.array(input.chats)}::uuid[])`;
  }
  if (input.projects.length) {
    await sql`delete from "StudyJourneyProject" where "id" = any(${sql.array(input.projects)}::uuid[])`;
  }
  if (input.users.length) {
    await sql`delete from "User" where "id" = any(${sql.array(input.users)}::uuid[])`;
  }
}

test(
  "M1.3 Project Chat history and turn admission enforce current creator and membership state",
  { skip: skipReason },
  async () => {
    assertConfiguredTarget(TEST_DATABASE_URL);
    process.env.POSTGRES_URL = TEST_DATABASE_URL;
    const previousFeatureFlag = process.env.PHASE13_PROJECT_CHAT_ENABLED;
    process.env.PHASE13_PROJECT_CHAT_ENABLED = "true";
    const sql = postgres(TEST_DATABASE_URL, {
      max: 12,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
      onnotice: () => undefined,
    });
    const ids = {
      users: [] as string[],
      projects: [] as string[],
      chats: [] as string[],
    };
    let stage = "fixture setup";

    try {
      const [identity] = await sql<{ database: string }[]>`
        select current_database() as database
      `;
      assert.equal(identity?.database, EXPECTED_DATABASE);

      const foundation = await import("@/lib/db/project-foundation");
      const queries = await import("@/lib/db/queries");
      const availability = await import(
        "@/lib/db/project-foundation-schema-availability"
      );
      const repository = foundation.createProjectFoundationRepository();
      assert.equal(await availability.projectFoundationSchemaAvailable(), true);

      const ownerId = await insertUser(sql, "m13-owner");
      const memberId = await insertUser(sql, "m13-member");
      const outsiderId = await insertUser(sql, "m13-outsider");
      const staffId = await insertUser(sql, "m13-staff", "lawyer");
      ids.users.push(ownerId, memberId, outsiderId, staffId);

      const createdProject = await repository.createProject({
        actorUserId: ownerId,
        operationId: operationId("m13-project"),
      });
      const projectId = createdProject.project.id;
      ids.projects.push(projectId);
      await setActiveMembership(sql, { projectId, ownerId, userId: memberId });

      const ownerChat = await repository.createProjectChat({
        actorUserId: ownerId,
        projectId,
        operationId: operationId("m13-owner-chat"),
        title: "Owner project chat",
      });
      const memberChat = await repository.createProjectChat({
        actorUserId: memberId,
        projectId,
        operationId: operationId("m13-member-chat"),
        title: "Member project chat",
      });
      ids.chats.push(ownerChat.chatId, memberChat.chatId);

      const standaloneChatId = randomUUID();
      ids.chats.push(standaloneChatId);
      const standaloneCreatedAt = new Date();
      await sql`
        insert into "Chat" ("id", "createdAt", "title", "userId", "visibility")
        values (
          ${standaloneChatId}, ${standaloneCreatedAt.toISOString()},
          'Standalone history', ${ownerId}, 'private'
        )
      `;
      await sql`
        insert into "ImmigrationConversation" (
          "chatId", "legalMatterId", "title", "createdAt", "updatedAt"
        ) values (
          ${standaloneChatId}, null, 'Standalone history',
          ${standaloneCreatedAt.toISOString()}, ${standaloneCreatedAt.toISOString()}
        )
      `;
      await sql`
        insert into "Message_v2" ("id", "chatId", "role", "parts", "attachments", "createdAt")
        values (
          ${randomUUID()}, ${standaloneChatId}, 'user',
          ${sql.json([{ type: "text", text: "standalone history message" }])},
          ${sql.json([])}, ${standaloneCreatedAt.toISOString()}
        )
      `;

      await sql`
        insert into "Message_v2" ("id", "chatId", "role", "parts", "attachments", "createdAt")
        values (
          ${randomUUID()}, ${ownerChat.chatId}, 'user',
          ${sql.json([{ type: "text", text: "owner project message" }])},
          ${sql.json([])}, ${new Date().toISOString()}
        )
      `;

      await sql`
        insert into "Message_v2" ("id", "chatId", "role", "parts", "attachments", "createdAt")
        values (
          ${randomUUID()}, ${memberChat.chatId}, 'user',
          ${sql.json([{ type: "text", text: "member-only message" }])},
          ${sql.json([])}, ${new Date().toISOString()}
        )
      `;

      stage = "Project widget ingress security boundary";
      const ingress = await import("@/lib/projects/chat-ingress");
      assert.equal(
        (await ingress.guardProjectChatIngress({ id: ownerChat.chatId }))
          ?.status,
        404,
        "a Project Chat id without matching scoped ingress is rejected"
      );
      assert.equal(
        await ingress.guardProjectChatIngress({
          id: ownerChat.chatId,
          frontendChatId: ownerChat.chatId,
        }),
        null,
        "the matching scoped Project Chat id passes the ingress guard"
      );
      assert.equal(
        (
          await ingress.guardProjectChatIngress({
            id: ownerChat.chatId,
            frontendChatId: memberChat.chatId,
          })
        )?.status,
        404,
        "a mismatched scoped Project Chat id is rejected"
      );
      assert.equal(
        await ingress.guardProjectChatIngress({ id: standaloneChatId }),
        null,
        "Standalone ingress behavior remains unchanged"
      );

      const voteHttp = await import("@/lib/conversations/vote-http");
      const projectVoteHandlers = voteHttp.createVoteHandlers({
        authenticate: async () => ({ user: { id: ownerId } }),
        getChatById: queries.getChatById,
        isProjectChat: async (chatId) =>
          Boolean(await repository.getProjectChatOrigin(chatId)),
        getVotesByChatId: queries.getVotesByChatId,
        voteMessage: queries.voteMessage,
      });
      const projectVoteGet = await projectVoteHandlers.GET(
        new Request(`http://localhost/api/vote?chatId=${ownerChat.chatId}`)
      );
      const projectVotePatch = await projectVoteHandlers.PATCH(
        new Request("http://localhost/api/vote", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chatId: ownerChat.chatId,
            messageId: randomUUID(),
            type: "up",
          }),
        })
      );
      assert.equal(projectVoteGet.status, 404);
      assert.equal(projectVotePatch.status, 404);

      stage = "member history summary";
      const memberHistory = await queries.getOwnedProjectChatHistorySummary({
        chatId: memberChat.chatId,
        userId: memberId,
      });
      assert.equal(memberHistory?.origin, "project");
      assert.equal(memberHistory?.readOnly, false);
      assert.equal(
        await queries.getOwnedProjectChatHistorySummary({
          chatId: memberChat.chatId,
          userId: ownerId,
        }),
        null,
        "Project membership must not grant another member's transcript"
      );
      stage = "owner Project Chat list";
      const ownerPage = await repository.listOwnedProjectChats({
        actorUserId: ownerId,
        projectId,
        limit: 20,
        cursor: null,
      });
      const memberPage = await repository.listOwnedProjectChats({
        actorUserId: memberId,
        projectId,
        limit: 20,
        cursor: null,
      });
      assert.deepEqual(
        ownerPage.conversations.map((row) => row.chatId),
        [ownerChat.chatId]
      );
      assert.deepEqual(
        memberPage.conversations.map((row) => row.chatId),
        [memberChat.chatId]
      );

      stage = "Project-aware history page";
      const historyList = await queries.listImmigrationConversationsPage({
        userId: ownerId,
        limit: 20,
        cursor: null,
        projectSchemaAvailable: true,
      });
      assert.deepEqual(
        historyList.conversations.map((row) => row.chatId).sort(),
        [ownerChat.chatId, standaloneChatId].sort()
      );
      stage = "Project-aware history count";
      assert.equal(
        await queries.countImmigrationConversations({
          userId: ownerId,
          projectSchemaAvailable: true,
        }),
        historyList.conversations.length
      );
      assert.equal(
        (
          await queries.listMessagesForChatPage({
            chatId: ownerChat.chatId,
            userId: ownerId,
            limit: 20,
            olderThan: null,
            projectSchemaAvailable: true,
          })
        ).messages.length,
        1,
        "an active customer can read their own Project Chat messages"
      );

      stage = "current customer eligibility on Project history";
      const [ownerAccount] = await sql<{ email: string }[]>`
        select "email" from "User" where "id" = ${ownerId}
      `;
      assert.ok(ownerAccount?.email);
      await sql`update "User" set "role" = 'lawyer' where "id" = ${ownerId}`;
      assert.equal(
        await queries.getOwnedProjectChatHistorySummary({
          chatId: ownerChat.chatId,
          userId: ownerId,
        }),
        null,
        "a staff account cannot read a Project Chat it canonically owns"
      );
      assert.deepEqual(
        (
          await queries.listMessagesForChatPage({
            chatId: ownerChat.chatId,
            userId: ownerId,
            limit: 20,
            olderThan: null,
            projectSchemaAvailable: true,
          })
        ).messages,
        [],
        "staff role change removes Project Chat message history access"
      );
      const staffHistoryPage = await queries.listImmigrationConversationsPage({
        userId: ownerId,
        limit: 20,
        cursor: null,
        projectSchemaAvailable: true,
      });
      assert.deepEqual(
        staffHistoryPage.conversations.map((row) => row.chatId),
        [standaloneChatId],
        "staff role change hides Project history but preserves Standalone history"
      );
      assert.equal(
        await queries.countImmigrationConversations({
          userId: ownerId,
          projectSchemaAvailable: true,
        }),
        1,
        "history count retains only the eligible Standalone row"
      );
      assert.equal(
        (
          await queries.listMessagesForChatPage({
            chatId: standaloneChatId,
            userId: ownerId,
            limit: 20,
            olderThan: null,
            projectSchemaAvailable: true,
          })
        ).messages.length,
        1,
        "Standalone message history does not gain the Project eligibility guard"
      );
      assert.equal(
        (
          await repository.listOwnedProjectChats({
            actorUserId: ownerId,
            projectId,
            limit: 20,
            cursor: null,
          })
        ).conversations.length,
        0,
        "Project-specific listing also checks current customer eligibility"
      );
      await assert.rejects(
        repository.withProjectChatTurnAdmission({
          actorUserId: ownerId,
          chatId: ownerChat.chatId,
          claim: async () => true,
        }),
        (error: unknown) =>
          error instanceof foundation.ProjectFoundationError &&
          error.code === "project_forbidden"
      );

      const guestClassifiedEmail = `guest-${Date.now()}`;
      await sql`
        update "User" set "role" = 'user', "email" = ${guestClassifiedEmail}
        where "id" = ${ownerId}
      `;
      assert.equal(
        await queries.getOwnedProjectChatHistorySummary({
          chatId: ownerChat.chatId,
          userId: ownerId,
        }),
        null,
        "guest-classified identity cannot read Project history"
      );
      assert.deepEqual(
        (
          await queries.listMessagesForChatPage({
            chatId: ownerChat.chatId,
            userId: ownerId,
            limit: 20,
            olderThan: null,
            projectSchemaAvailable: true,
          })
        ).messages,
        [],
        "guest-classified identity cannot page Project messages"
      );
      assert.deepEqual(
        (
          await queries.listImmigrationConversationsPage({
            userId: ownerId,
            limit: 20,
            cursor: null,
            projectSchemaAvailable: true,
          })
        ).conversations.map((row) => row.chatId),
        [standaloneChatId],
        "guest-classified identity retains only its Standalone history"
      );
      assert.equal(
        (
          await repository.listOwnedProjectChats({
            actorUserId: ownerId,
            projectId,
            limit: 20,
            cursor: null,
          })
        ).conversations.length,
        0,
        "guest-classified identity cannot list Project Chats"
      );
      await assert.rejects(
        repository.withProjectChatTurnAdmission({
          actorUserId: ownerId,
          chatId: ownerChat.chatId,
          claim: async () => true,
        }),
        (error: unknown) =>
          error instanceof foundation.ProjectFoundationError &&
          error.code === "project_forbidden"
      );
      await sql`
        update "User" set "role" = 'user', "email" = ${ownerAccount.email}
        where "id" = ${ownerId}
      `;

      stage = "turn admission versus revocation";
      const turnInput = {
        chatId: memberChat.chatId,
        userId: memberId,
        clientTurnId: clientTurnId("m13-turn-race"),
        assistantMode: "default",
        requestHash: "a".repeat(64),
        userMessageId: randomUUID(),
        now: new Date(),
      };
      let signalEntered!: () => void;
      const entered = new Promise<void>((resolveEntered) => {
        signalEntered = resolveEntered;
      });
      let releaseClaim!: () => void;
      const claimGate = new Promise<void>((resolveClaim) => {
        releaseClaim = resolveClaim;
      });
      const admitted = repository.withProjectChatTurnAdmission({
        actorUserId: memberId,
        chatId: memberChat.chatId,
        async claim(tx) {
          const claim = await queries.claimConversationTurnInTransaction(
            tx,
            turnInput
          );
          signalEntered();
          await claimGate;
          return claim;
        },
      });
      await entered;
      let revokeCommitted = false;
      const revoke = sql.begin(async (tx) => {
        await tx`select "id" from "StudyJourneyProject" where "id" = ${projectId} for update`;
        await tx`
          update "ProjectMembership"
          set "status" = 'revoked', "revokedAt" = now(), "updatedAt" = now()
          where "projectId" = ${projectId} and "userId" = ${memberId}
        `;
        revokeCommitted = true;
      });
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
      assert.equal(
        revokeCommitted,
        false,
        "revocation waits behind Project turn admission"
      );
      releaseClaim();
      const [admittedClaim] = await Promise.all([admitted, revoke]);
      assert.equal(admittedClaim.created, true);
      assert.equal(revokeCommitted, true);

      await assert.rejects(
        repository.withProjectChatTurnAdmission({
          actorUserId: memberId,
          chatId: memberChat.chatId,
          claim: (tx) =>
            queries.claimConversationTurnInTransaction(tx, {
              ...turnInput,
              clientTurnId: clientTurnId("m13-after-revoke"),
            }),
        }),
        (error: unknown) =>
          error instanceof foundation.ProjectFoundationError &&
          error.code === "project_forbidden"
      );
      assert.equal(
        await queries.getOwnedProjectChatHistorySummary({
          chatId: memberChat.chatId,
          userId: memberId,
        }),
        null
      );
      const revokedMessages = await queries.listMessagesForChatPage({
        chatId: memberChat.chatId,
        userId: memberId,
        limit: 20,
        olderThan: null,
        projectSchemaAvailable: true,
      });
      assert.deepEqual(revokedMessages.messages, []);
      const memberAfterRevocation =
        await queries.listImmigrationConversationsPage({
          userId: memberId,
          limit: 20,
          cursor: null,
          projectSchemaAvailable: true,
        });
      assert.equal(
        memberAfterRevocation.conversations.some(
          (row) => row.chatId === memberChat.chatId
        ),
        false
      );
      const revokedVoteHandlers = voteHttp.createVoteHandlers({
        authenticate: async () => ({ user: { id: memberId } }),
        getChatById: queries.getChatById,
        isProjectChat: async (chatId) =>
          Boolean(await repository.getProjectChatOrigin(chatId)),
        getVotesByChatId: queries.getVotesByChatId,
        voteMessage: queries.voteMessage,
      });
      assert.equal(
        (
          await revokedVoteHandlers.GET(
            new Request(`http://localhost/api/vote?chatId=${memberChat.chatId}`)
          )
        ).status,
        404,
        "a revoked member cannot read votes for a Project Chat"
      );
      assert.equal(
        (
          await revokedVoteHandlers.PATCH(
            new Request("http://localhost/api/vote", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                chatId: memberChat.chatId,
                messageId: randomUUID(),
                type: "up",
              }),
            })
          )
        ).status,
        404,
        "a revoked member cannot write votes for a Project Chat"
      );

      stage = "turn admission versus Project closure";
      const closeRaceProject = await repository.createProject({
        actorUserId: ownerId,
        operationId: operationId("m13-close-race-project"),
      });
      ids.projects.push(closeRaceProject.project.id);
      const closeRaceChat = await repository.createProjectChat({
        actorUserId: ownerId,
        projectId: closeRaceProject.project.id,
        operationId: operationId("m13-close-race-chat"),
      });
      ids.chats.push(closeRaceChat.chatId);
      const closeRaceTurnInput = {
        ...turnInput,
        chatId: closeRaceChat.chatId,
        userId: ownerId,
        clientTurnId: clientTurnId("m13-close-race-turn"),
        userMessageId: randomUUID(),
      };
      let closeRaceEntered!: () => void;
      const closeRaceTurnEntered = new Promise<void>((resolveEntered) => {
        closeRaceEntered = resolveEntered;
      });
      let releaseCloseRaceTurn!: () => void;
      const closeRaceTurnGate = new Promise<void>((resolveClaim) => {
        releaseCloseRaceTurn = resolveClaim;
      });
      const closeRaceAdmission = repository.withProjectChatTurnAdmission({
        actorUserId: ownerId,
        chatId: closeRaceChat.chatId,
        async claim(tx) {
          const claim = await queries.claimConversationTurnInTransaction(
            tx,
            closeRaceTurnInput
          );
          closeRaceEntered();
          await closeRaceTurnGate;
          return claim;
        },
      });
      await closeRaceTurnEntered;
      let closeRaceCommitted = false;
      let signalCloseRace!: () => void;
      const closeRaceStarted = new Promise<void>((resolveStarted) => {
        signalCloseRace = resolveStarted;
      });
      const closeRace = sql.begin(async (tx) => {
        signalCloseRace();
        await tx`select "id" from "StudyJourneyProject" where "id" = ${closeRaceProject.project.id} for update`;
        await tx`
          update "StudyJourneyProject"
          set "status" = 'closed', "closedAt" = now(), "updatedAt" = now()
          where "id" = ${closeRaceProject.project.id}
        `;
        closeRaceCommitted = true;
      });
      await closeRaceStarted;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
      assert.equal(
        closeRaceCommitted,
        false,
        "Project closure waits behind turn admission's Project row lock"
      );
      releaseCloseRaceTurn();
      const [closeRaceClaim] = await Promise.all([
        closeRaceAdmission,
        closeRace,
      ]);
      assert.equal(closeRaceClaim.created, true);
      assert.equal(closeRaceCommitted, true);
      await assert.rejects(
        repository.withProjectChatTurnAdmission({
          actorUserId: ownerId,
          chatId: closeRaceChat.chatId,
          claim: (tx) =>
            queries.claimConversationTurnInTransaction(tx, {
              ...closeRaceTurnInput,
              clientTurnId: clientTurnId("m13-close-race-after"),
              userMessageId: randomUUID(),
            }),
        }),
        (error: unknown) =>
          error instanceof foundation.ProjectFoundationError &&
          error.code === "project_closed"
      );

      stage = "turn replay and request hash conflict";
      const ownerTurnId = clientTurnId("m13-owner-turn");
      const ownerTurnInput = {
        ...turnInput,
        chatId: ownerChat.chatId,
        userId: ownerId,
        clientTurnId: ownerTurnId,
        userMessageId: randomUUID(),
      };
      const firstClaim = await repository.withProjectChatTurnAdmission({
        actorUserId: ownerId,
        chatId: ownerChat.chatId,
        claim: (tx) =>
          queries.claimConversationTurnInTransaction(tx, ownerTurnInput),
      });
      const replayClaim = await repository.withProjectChatTurnAdmission({
        actorUserId: ownerId,
        chatId: ownerChat.chatId,
        claim: (tx) =>
          queries.claimConversationTurnInTransaction(tx, ownerTurnInput),
      });
      assert.equal(firstClaim.created, true);
      assert.equal(replayClaim.created, false);
      assert.equal(replayClaim.turn.id, firstClaim.turn.id);
      assert.equal(replayClaim.requestHashMismatch, false);
      const conflictClaim = await repository.withProjectChatTurnAdmission({
        actorUserId: ownerId,
        chatId: ownerChat.chatId,
        claim: (tx) =>
          queries.claimConversationTurnInTransaction(tx, {
            ...ownerTurnInput,
            requestHash: "b".repeat(64),
          }),
      });
      assert.equal(conflictClaim.requestHashMismatch, true);

      stage = "turn admission rollback";
      const rollbackTurnId = clientTurnId("m13-rollback");
      await assert.rejects(
        repository.withProjectChatTurnAdmission({
          actorUserId: ownerId,
          chatId: ownerChat.chatId,
          async claim(tx) {
            await queries.claimConversationTurnInTransaction(tx, {
              ...ownerTurnInput,
              clientTurnId: rollbackTurnId,
              userMessageId: randomUUID(),
            });
            throw new Error("injected admission rollback");
          },
        }),
        /injected admission rollback/u
      );
      assert.equal(
        await queries.getConversationTurnRecord({
          chatId: ownerChat.chatId,
          clientTurnId: rollbackTurnId,
        }),
        null
      );

      stage = "closed Project and staff access denial";
      const closedProject = await repository.createProject({
        actorUserId: ownerId,
        operationId: operationId("m13-closed-project"),
      });
      ids.projects.push(closedProject.project.id);
      const closedChat = await repository.createProjectChat({
        actorUserId: ownerId,
        projectId: closedProject.project.id,
        operationId: operationId("m13-closed-chat"),
      });
      ids.chats.push(closedChat.chatId);
      await sql`
        insert into "Message_v2" ("id", "chatId", "role", "parts", "attachments", "createdAt")
        values (
          ${randomUUID()}, ${closedChat.chatId}, 'user',
          ${sql.json([{ type: "text", text: "closed Project history" }])},
          ${sql.json([])}, ${new Date().toISOString()}
        )
      `;
      const closedOutcome = await repository.closeProject({
        actorUserId: ownerId,
        projectId: closedProject.project.id,
        expectedRevision: closedChat.project.revision,
        operationId: operationId("m13-close-project"),
      });
      assert.equal(closedOutcome.project.status, "closed");
      const closedHistory = await queries.getOwnedProjectChatHistorySummary({
        chatId: closedChat.chatId,
        userId: ownerId,
      });
      assert.equal(closedHistory?.origin, "project");
      assert.equal(closedHistory?.readOnly, true);
      const closedMessages = await queries.listMessagesForChatPage({
        chatId: closedChat.chatId,
        userId: ownerId,
        limit: 20,
        olderThan: null,
        projectSchemaAvailable: true,
      });
      assert.equal(closedMessages.messages.length, 1);
      assert.deepEqual(
        (
          await repository.listOwnedProjectChats({
            actorUserId: ownerId,
            projectId: closedProject.project.id,
            limit: 20,
            cursor: null,
          })
        ).conversations.map((row) => row.readOnly),
        [true]
      );
      await assert.rejects(
        repository.withProjectChatTurnAdmission({
          actorUserId: ownerId,
          chatId: closedChat.chatId,
          claim: (tx) =>
            queries.claimConversationTurnInTransaction(tx, {
              ...ownerTurnInput,
              chatId: closedChat.chatId,
              clientTurnId: clientTurnId("m13-closed-turn"),
              userMessageId: randomUUID(),
            }),
        }),
        (error: unknown) =>
          error instanceof foundation.ProjectFoundationError &&
          error.code === "project_closed"
      );

      await assert.rejects(
        repository.withProjectChatTurnAdmission({
          actorUserId: staffId,
          chatId: ownerChat.chatId,
          claim: (tx) =>
            queries.claimConversationTurnInTransaction(tx, {
              ...ownerTurnInput,
              userId: staffId,
              clientTurnId: clientTurnId("m13-staff-turn"),
              userMessageId: randomUUID(),
            }),
        }),
        (error: unknown) =>
          error instanceof foundation.ProjectFoundationError &&
          error.code === "project_forbidden"
      );

      stage = "emergency read-only fallback";
      process.env.PHASE13_PROJECT_CHAT_ENABLED = "false";
      const emergencyHistory = await queries.getOwnedProjectChatHistorySummary({
        chatId: ownerChat.chatId,
        userId: ownerId,
      });
      assert.equal(emergencyHistory?.origin, "project");
      assert.equal(emergencyHistory?.readOnly, true);
      await assert.rejects(
        repository.withProjectChatTurnAdmission({
          actorUserId: ownerId,
          chatId: ownerChat.chatId,
          claim: (tx) =>
            queries.claimConversationTurnInTransaction(tx, {
              ...ownerTurnInput,
              clientTurnId: clientTurnId("m13-disabled-turn"),
              userMessageId: randomUUID(),
            }),
        }),
        (error: unknown) =>
          error instanceof foundation.ProjectFoundationError &&
          error.code === "project_forbidden"
      );
      process.env.PHASE13_PROJECT_CHAT_ENABLED = "true";
    } catch (error) {
      throw new Error(`M1.3 integration failed during ${stage}`, {
        cause: error,
      });
    } finally {
      await cleanup(sql, ids).catch(() => undefined);
      await sql.end({ timeout: 5 });
      const foundation = await import(
        "@/lib/db/project-foundation-schema-availability"
      );
      const runtime = await import("@/lib/db/runtime-client");
      await foundation.closeProjectFoundationSchemaClient();
      await runtime.closeLazyDatabase();
      if (previousFeatureFlag === undefined) {
        process.env.PHASE13_PROJECT_CHAT_ENABLED = undefined;
      } else {
        process.env.PHASE13_PROJECT_CHAT_ENABLED = previousFeatureFlag;
      }
    }
  }
);
