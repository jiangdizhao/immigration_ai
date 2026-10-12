// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertion helpers are invoked only from tests.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";

/**
 * Phase 12 Stage 2 R1 PostgreSQL integration coverage for conversation document
 * context on a long-lived conversation.
 *
 * Reviewer finding R1-3: a conversation with more than 64 stored files produced
 * a summary the legal-service schema rejected, so an ordinary legal question
 * failed validation. This test proves, against a real database, that:
 *
 *   * every stored file is counted (70 documents, mixed usable/unusable);
 *   * only a bounded subset is packaged into the model evidence packet;
 *   * the packaged count never exceeds the usable count or the packet bounds;
 *   * an unreadable file is reported rather than concealed.
 *
 * Destructive work runs only against the isolated disposable database created by
 * `scripts/phase12-stage1-test-db.ts`. Without `PHASE12_TEST_DATABASE_URL` the
 * test is skipped with an explicit reason, never reported as passed.
 *
 * Run with:
 *   PHASE12_TEST_DATABASE_URL=… pnpm run test:phase12:stage2:documents:integration
 */

const TEST_DATABASE_URL = process.env.PHASE12_TEST_DATABASE_URL?.trim() ?? "";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE12_TEST_DATABASE_URL is not configured (isolated test database required)";

const OWNER_EMAIL = `p12s2docs-${randomUUID()}@example.test`;

const USABLE_DOCUMENTS = 66;
const EMPTY_DOCUMENTS = 2;
const FAILED_DOCUMENTS = 2;

type Fixtures = { ownerId: string; chatId: string };

async function insertDocument(
  sql: ReturnType<typeof postgres>,
  userId: string,
  chatId: string,
  index: number,
  input: { processingStatus: string; runStatus: string; units: number }
) {
  const filename = `file-${String(index).padStart(3, "0")}.pdf`;
  const [document] = await sql<{ id: string }[]>`
    insert into "MatterDocument" (
      "userId", "chatId", "originalFilename", "storageKey", "mimeType",
      "byteSize", "sha256", "processingStatus", "securityStatus", "storageStatus"
    ) values (
      ${userId}, ${chatId}, ${filename}, ${`test/${randomUUID()}`}, ${"application/pdf"},
      ${1024}, ${"a".repeat(64)}, ${input.processingStatus}, ${"clean"}, ${"stored"}
    )
    returning "id"
  `;
  const [run] = await sql<{ id: string }[]>`
    insert into "MatterDocumentProcessingRun" (
      "documentId", "extractorVersion", "status", "extractionMethod", "unitCount"
    ) values (
      ${document.id}, ${"r1-test"}, ${input.runStatus}, ${"native"}, ${input.units}
    )
    returning "id"
  `;
  for (let ordinal = 0; ordinal < input.units; ordinal += 1) {
    await sql`
      insert into "MatterDocumentEvidenceUnit" (
        "documentId", "runId", "ordinal", "locator", "extractionMethod", "extractedText"
      ) values (
        ${document.id}, ${run.id}, ${ordinal}, ${JSON.stringify({ page: ordinal + 1 })},
        ${"native"}, ${`extracted text for ${filename} unit ${ordinal}`}
      )
    `;
  }
}

async function seed(sql: ReturnType<typeof postgres>): Promise<Fixtures> {
  const [owner] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password")
    values (${OWNER_EMAIL}, ${"x".repeat(64)})
    returning "id"
  `;
  const [chat] = await sql<{ id: string }[]>`
    insert into "Chat" ("userId", "title", "visibility", "createdAt")
    values (${owner.id}, ${"Stage 2 R1 document context"}, ${"private"}, now())
    returning "id"
  `;
  await sql`
    insert into "ImmigrationConversation" ("chatId", "createdAt", "updatedAt")
    values (${chat.id}, now(), now())
  `;

  let index = 0;
  for (let usable = 0; usable < USABLE_DOCUMENTS; usable += 1) {
    index += 1;
    await insertDocument(sql, owner.id, chat.id, index, {
      processingStatus: "complete",
      runStatus: "complete",
      units: 2,
    });
  }
  for (let empty = 0; empty < EMPTY_DOCUMENTS; empty += 1) {
    index += 1;
    await insertDocument(sql, owner.id, chat.id, index, {
      processingStatus: "complete",
      runStatus: "complete",
      units: 0,
    });
  }
  for (let failed = 0; failed < FAILED_DOCUMENTS; failed += 1) {
    index += 1;
    await insertDocument(sql, owner.id, chat.id, index, {
      processingStatus: "failed",
      runStatus: "failed",
      units: 0,
    });
  }
  return { ownerId: owner.id, chatId: chat.id };
}

async function cleanup(
  sql: ReturnType<typeof postgres>,
  fixtures: Fixtures | null
) {
  if (!fixtures) {
    return;
  }
  await sql`delete from "MatterDocument" where "userId" = ${fixtures.ownerId}`;
  await sql`delete from "ImmigrationConversation" where "chatId" = ${fixtures.chatId}`;
  await sql`delete from "Chat" where "userId" = ${fixtures.ownerId}`;
  await sql`delete from "User" where "id" = ${fixtures.ownerId}`;
}

test(
  "a 70-file conversation is summarized fully and packaged within bounds",
  { skip: skipReason },
  async () => {
    process.env.POSTGRES_URL = TEST_DATABASE_URL;
    const sql = postgres(TEST_DATABASE_URL, { max: 4, connect_timeout: 5 });
    let fixtures: Fixtures | null = null;
    try {
      fixtures = await seed(sql);
      const { buildConversationDocumentContext } = await import(
        "@/lib/matter-documents/ai-evidence"
      );
      const context = await buildConversationDocumentContext({
        userId: fixtures.ownerId,
        chatId: fixtures.chatId,
      });

      // Every stored file is counted, including the unusable ones.
      assert.equal(
        context.status.total,
        USABLE_DOCUMENTS + EMPTY_DOCUMENTS + FAILED_DOCUMENTS
      );
      assert.equal(context.status.usable, USABLE_DOCUMENTS);
      assert.equal(context.status.noUsableContent, EMPTY_DOCUMENTS);
      assert.equal(context.status.failed, FAILED_DOCUMENTS);
      assert.equal(
        context.status.packaged,
        context.evidence.documents.length,
        "the packaged count must describe the packet actually built"
      );
      assert.ok(context.status.packaged > 0);
      assert.ok(context.status.usable - context.status.packaged > 0);
      assert.ok(
        context.status.total > 64,
        "the old 64-file schema bound would have rejected this conversation"
      );

      // The packet respects its documented bounds.
      assert.ok(context.evidence.documents.length <= 8);
      const units = context.evidence.documents.flatMap(
        (document) => document.units
      );
      assert.ok(units.length <= 64);
      assert.ok(
        units.reduce((total, unit) => total + unit.text.length, 0) <= 64_000
      );
      assert.equal(context.manifest.length, context.evidence.documents.length);

      // An unreadable file is named, not concealed.
      assert.ok(context.status.unusableFilenames.length > 0);

      // The summary is exactly what the widget sends to the legal service, so
      // this fixture is the regression case for the removed 64-file bound.
      const summary = context.status;
      assert.ok(summary.total > 64);
    } finally {
      await cleanup(sql, fixtures);
      await sql.end({ timeout: 5 });
      // The lazy application client must be closed, or an idle connection keeps
      // the test process alive after the assertions have finished.
      const runtimeClient = await import("@/lib/db/runtime-client");
      await runtimeClient.closeLazyDatabase();
    }
  }
);
