/**
 * Phase 12 Stage 1 read-only data audit.
 *
 * Reports sanitized aggregate diagnostics about the existing conversation and
 * document persistence. It never prints customer identifiers, file names,
 * message content, emails or credentials, and it performs no writes.
 *
 * Usage:
 *   pnpm run phase12:audit -- --expect-database=chatbot
 */

import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: resolve(".env.local") });

function connectionString(): string {
  const configured = process.env.POSTGRES_URL?.trim();
  if (!configured) {
    throw new Error("POSTGRES_URL is not configured");
  }
  return configured;
}

function expectedDatabase(): string {
  const arg = process.argv.find((value) =>
    value.startsWith("--expect-database=")
  );
  const name = arg?.slice("--expect-database=".length);
  if (!name) {
    throw new Error("--expect-database=<name> is required");
  }
  return name;
}

function safeIdentity(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//u, ""),
  };
}

async function scalar(query: PromiseLike<unknown>): Promise<number> {
  const rows = (await query) as unknown as { count: string }[];
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const url = connectionString();
  const identity = safeIdentity(url);
  const expected = expectedDatabase();
  if (identity.database !== expected) {
    throw new Error(
      `configured database ${identity.database} does not match --expect-database=${expected}`
    );
  }

  const sql = postgres(url, {
    max: 1,
    connect_timeout: 5,
    connection: { TimeZone: "UTC" },
  });

  try {
    const presentRows = (await sql`
      select count(*)::text as count
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('Chat','Message_v2','ImmigrationConversation','MatterDocument')
    `) as unknown as { count: string }[];
    const requiredTables = Number(presentRows[0]?.count ?? 0);
    if (requiredTables < 4) {
      console.log(
        JSON.stringify({
          event: "phase12_stage1_audit",
          target: identity,
          readOnly: true,
          conversationTablesPresent: false,
          presentRequiredTableCount: requiredTables,
          note: "This database does not hold the conversation/document schema; nothing to audit.",
        })
      );
      return;
    }

    const turnTableRows = (await sql`
      select count(*)::text as count
      from information_schema.tables
      where table_schema = 'public' and table_name = 'ConversationTurn'
    `) as unknown as { count: string }[];
    const turnLedgerPresent = Number(turnTableRows[0]?.count ?? 0) > 0;

    const [
      chats,
      conversations,
      conversationMessages,
      legacyMessages,
      documents,
      processingRuns,
      evidenceUnits,
      conversationTurns,
      emptyConversations,
      emptyRecentConversations,
      staleEmptyWithActivity,
      messagesWithoutConversation,
      documentOwnershipMismatches,
      documentsUploading,
      documentsCleanupPending,
      documentsStorageFailed,
      documentsSoftDeleted,
      documentsWeakMetadata,
    ] = await Promise.all([
      scalar(sql`select count(*)::text as count from "Chat"`),
      scalar(
        sql`select count(*)::text as count from "ImmigrationConversation"`
      ),
      scalar(sql`select count(*)::text as count from "Message_v2"`),
      scalar(sql`select count(*)::text as count from "Message"`),
      scalar(sql`select count(*)::text as count from "MatterDocument"`),
      scalar(
        sql`select count(*)::text as count from "MatterDocumentProcessingRun"`
      ),
      scalar(
        sql`select count(*)::text as count from "MatterDocumentEvidenceUnit"`
      ),
      turnLedgerPresent
        ? scalar(sql`select count(*)::text as count from "ConversationTurn"`)
        : 0,
      scalar(sql`select count(*)::text as count from "ImmigrationConversation" c
            where not exists (select 1 from "Message_v2" m where m."chatId" = c."chatId")`),
      scalar(sql`select count(*)::text as count from "ImmigrationConversation" c
            where not exists (select 1 from "Message_v2" m where m."chatId" = c."chatId")
              and c."createdAt" > now() - interval '7 days'`),
      scalar(sql`select count(*)::text as count from "ImmigrationConversation" c
            where not exists (select 1 from "Message_v2" m where m."chatId" = c."chatId")
              and c."createdAt" <= now() - interval '7 days'
              and c."updatedAt" > c."createdAt" + interval '1 hour'`),
      scalar(sql`select count(*)::text as count from "Message_v2" m
            where not exists (
              select 1 from "ImmigrationConversation" c where c."chatId" = m."chatId"
            )`),
      scalar(sql`select count(*)::text as count from "MatterDocument" d
            join "Chat" ch on ch."id" = d."chatId"
            where d."userId" <> ch."userId"`),
      scalar(
        sql`select count(*)::text as count from "MatterDocument" where "storageStatus" = 'uploading'`
      ),
      scalar(
        sql`select count(*)::text as count from "MatterDocument" where "storageStatus" = 'cleanup_pending'`
      ),
      scalar(
        sql`select count(*)::text as count from "MatterDocument" where "storageStatus" = 'storage_failed'`
      ),
      scalar(
        sql`select count(*)::text as count from "MatterDocument" where "deletedAt" is not null`
      ),
      scalar(sql`select count(*)::text as count from "MatterDocument"
            where "byteSize" <= 0 or length("sha256") <> 64 or length("storageKey") = 0`),
    ]);

    const [
      documentsProcessingWithoutRun,
      documentsCompleteWithoutCompletedRun,
      documentsCompleteWithoutEvidence,
      completedRunsWithoutEvidence,
      duplicateMessageGroups,
      interruptedTurns,
      completedTurnsWithoutMessage,
      failedTurns,
    ] = await Promise.all([
      scalar(sql`select count(*)::text as count from "MatterDocument" d
            where d."processingStatus" = 'processing'
              and not exists (
                select 1 from "MatterDocumentProcessingRun" r where r."documentId" = d."id"
              )`),
      scalar(sql`select count(*)::text as count from "MatterDocument" d
            where d."processingStatus" = 'complete'
              and not exists (
                select 1 from "MatterDocumentProcessingRun" r
                where r."documentId" = d."id"
                  and r."status" in ('complete','partial','needs_review')
              )`),
      scalar(sql`select count(*)::text as count from "MatterDocument" d
            where d."processingStatus" = 'complete'
              and not exists (
                select 1 from "MatterDocumentEvidenceUnit" u where u."documentId" = d."id"
              )`),
      scalar(sql`select count(*)::text as count from "MatterDocumentProcessingRun" r
            where r."status" in ('complete','partial','needs_review')
              and not exists (
                select 1 from "MatterDocumentEvidenceUnit" u where u."runId" = r."id"
              )`),
      scalar(sql`select count(*)::text as count from (
              select "chatId", "role", "createdAt"
              from "Message_v2"
              group by "chatId", "role", "createdAt"
              having count(*) > 1
            ) duplicated`),
      turnLedgerPresent
        ? scalar(sql`select count(*)::text as count from "ConversationTurn"
                where "status" = 'user_persisted' and "createdAt" < now() - interval '1 hour'`)
        : 0,
      turnLedgerPresent
        ? scalar(sql`select count(*)::text as count from "ConversationTurn" t
            where t."status" = 'assistant_persisted'
              and (
                t."assistantMessageId" is null
                or not exists (
                  select 1 from "Message_v2" m where m."id" = t."assistantMessageId"
                )
              )`)
        : 0,
      turnLedgerPresent
        ? scalar(
            sql`select count(*)::text as count from "ConversationTurn" where "status" = 'failed'`
          )
        : 0,
    ]);

    const [
      chatsWithMessagesAndNoConversationRow,
      chatsWithoutConversationRowAndNoMessages,
      legacyOwnedByRegisteredUser,
      legacyOwnedByGuest,
      legacyInOtherAccount,
    ] = await Promise.all([
      scalar(sql`select count(distinct m."chatId")::text as count from "Message_v2" m
            where not exists (
              select 1 from "ImmigrationConversation" c where c."chatId" = m."chatId"
            )`),
      scalar(sql`select count(*)::text as count from "Chat" ch
            where not exists (
              select 1 from "ImmigrationConversation" c where c."chatId" = ch."id"
            )
              and not exists (
                select 1 from "Message_v2" m where m."chatId" = ch."id"
              )`),
      scalar(sql`select count(distinct m."chatId")::text as count from "Message_v2" m
            join "Chat" ch on ch."id" = m."chatId"
            join "User" u on u."id" = ch."userId"
            where not exists (
              select 1 from "ImmigrationConversation" c where c."chatId" = m."chatId"
            )
              and u."email" is not null`),
      scalar(sql`select count(distinct m."chatId")::text as count from "Message_v2" m
            join "Chat" ch on ch."id" = m."chatId"
            join "User" u on u."id" = ch."userId"
            where not exists (
              select 1 from "ImmigrationConversation" c where c."chatId" = m."chatId"
            )
              and u."email" is null`),
      scalar(sql`select count(distinct m."chatId")::text as count from "Message_v2" m
            join "Chat" ch on ch."id" = m."chatId"
            where not exists (
              select 1 from "ImmigrationConversation" c where c."chatId" = m."chatId"
            )
              and ch."userId" is null`),
    ]);

    console.log(
      JSON.stringify({
        event: "phase12_stage1_audit",
        target: identity,
        readOnly: true,
        totals: {
          chats,
          conversations,
          conversationMessages,
          legacyMessages,
          documents,
          processingRuns,
          evidenceUnits,
          conversationTurns,
        },
        conversationTurnLedgerPresent: turnLedgerPresent,
        legacyChatClassification: {
          chats,
          messagesWithoutConversationRow: messagesWithoutConversation,
          chatsWithMessagesAndNoConversationRow,
          chatsWithoutConversationRowAndNoMessages,
          messagesInWidgetChats: conversationMessages,
          messagesWithoutConversationRowOwnedByRegisteredUser:
            legacyOwnedByRegisteredUser,
          messagesWithoutConversationRowOwnedByGuest: legacyOwnedByGuest,
          messagesWithoutConversationRowInOtherAccount: legacyInOtherAccount,
          note: "Read-only classification of pre-conversation rows. Legacy chats now appear in owner history as origin=legacy_chat with legalMatterId=null; nothing is created, rewritten or backfilled.",
        },
        findings: {
          emptyConversations,
          emptyRecentConversations,
          staleEmptyConversationsWithLaterActivity: staleEmptyWithActivity,
          messagesWithoutConversationRow: messagesWithoutConversation,
          documentOwnershipMismatches,
          documentsUploading,
          documentsCleanupPending,
          documentsStorageFailed,
          documentsSoftDeleted,
          documentsWithWeakMetadata: documentsWeakMetadata,
          documentsProcessingWithoutRun,
          documentsCompleteWithoutCompletedRun,
          documentsCompleteWithoutEvidenceUnits:
            documentsCompleteWithoutEvidence,
          completedRunsWithoutEvidenceUnits: completedRunsWithoutEvidence,
          duplicateMessageGroups,
          interruptedTurnsOlderThanOneHour: interruptedTurns,
          completedTurnsWithoutStoredMessage: completedTurnsWithoutMessage,
          failedTurns,
        },
        limitations: [
          "Object-storage reachability is not probed by this read-only audit.",
          "Evidence availability is reported as unit counts, never document content.",
          "No customer identifiers, file names or message text are printed.",
        ],
      })
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "phase12_stage1_audit_failed",
      message: error instanceof Error ? error.message : "unknown_error",
    })
  );
  process.exitCode = 1;
});
