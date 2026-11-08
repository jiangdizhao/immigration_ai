import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * Phase 13 M9-A — deterministic Migration 0053 ordering and shape.
 *
 * PostgreSQL rejects a composite foreign key whose referenced columns have no
 * matching unique constraint, so the supporting unique index must be created before
 * the foreign key. This test validates that ordering structurally (offline, no
 * database) and fails if the migration is regenerated or hand-edited into an order
 * that cannot apply, or into a destructive statement.
 */

const BREAKPOINT = "--> statement-breakpoint";

function statements(source: string): string[] {
  return source
    .split(BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((statement) => statement.length > 0);
}

const url = new URL(
  "./migrations/0053_phase13_m9_a_project_conversation_stage.sql",
  import.meta.url
);

test("migration 0053 is purely additive", async () => {
  const source = await readFile(url, "utf8");
  const body = statements(source);
  assert.ok(body.length > 0);
  for (const statement of body) {
    assert.doesNotMatch(
      statement,
      /^\s*(DROP|TRUNCATE|DELETE)\b/iu,
      `destructive statement refused: ${statement.slice(0, 80)}`
    );
    assert.doesNotMatch(
      statement,
      /ALTER\s+COLUMN[^;]*\bTYPE\b/iu,
      "the migration must not retype an existing column"
    );
    assert.doesNotMatch(
      statement,
      /UPDATE\s+"ProjectConversation"/iu,
      "existing conversations must never be rewritten or auto-bound"
    );
  }
});

test("the supporting unique index exists before the composite foreign key", async () => {
  const source = await readFile(url, "utf8");
  const body = statements(source);
  const indexAt = body.findIndex((statement) =>
    statement.includes(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ProjectConversation_chat_project_creator_unique"'
    )
  );
  const tableAt = body.findIndex((statement) =>
    statement.includes('CREATE TABLE IF NOT EXISTS "ProjectConversationStage"')
  );
  const fkAt = body.findIndex((statement) =>
    statement.includes("ProjectConversationStage_conversation_fk")
  );
  assert.ok(indexAt >= 0, "the supporting unique index is required");
  assert.ok(tableAt >= 0, "the binding table is required");
  assert.ok(fkAt >= 0, "the composite foreign key is required");
  assert.ok(
    indexAt < fkAt,
    "the referenced unique index must be created before the foreign key"
  );
  assert.ok(tableAt < fkAt, "the table must exist before its foreign key");
  // The binding's own uniqueness is what makes find-or-create idempotent.
  assert.ok(
    body.some((statement) =>
      statement.includes(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ProjectConversationStage_owner_stage_unique"'
      )
    )
  );
});

test("the binding cannot cross a Project or an owner, and the step is a closed enum", async () => {
  const source = await readFile(url, "utf8");
  // Composite FK over (chatId, projectId, createdByUserId) → the same triple on the
  // accepted ProjectConversation table.
  assert.match(
    source,
    /FOREIGN KEY \("chatId","projectId","createdByUserId"\)\s*\n?\s*REFERENCES "ProjectConversation" \("chatId","projectId","createdByUserId"\)/u
  );
  assert.match(source, /ON DELETE RESTRICT ON UPDATE RESTRICT/u);
  // A closed step vocabulary, so no row can invent a workflow stage.
  assert.match(
    source,
    /CHECK \("stageKey" in \('school_applications','school_admissions','student500'\)\)/u
  );
  // One owner can hold exactly one conversation per step.
  assert.match(
    source,
    /"ProjectConversationStage_owner_stage_unique" ON "ProjectConversationStage" USING btree \("projectId","createdByUserId","stageKey"\)/u
  );
});
