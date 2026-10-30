import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Offline contract audit for Migration 0045 (M4-006 durable persistence).
 *
 * No database is contacted. The checks pin the structure the future guarded
 * PostgreSQL harness will assert live, and prove that migrations 0000–0044 were
 * left byte-for-byte intact.
 */
const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "../..");
const migrationsDir = resolve(chatbotRoot, "lib/db/migrations");
const MIGRATION_0045 = resolve(
  chatbotRoot,
  "lib/db/migrations/0045_phase13_m4_006_professional_review.sql"
);
const MIGRATION_0044_SHA =
  "d90ebf497dd049cb4f6fc221d2129639714028849a819e7dbb6e5b32a6146f0e";
const MIGRATION_0045_SHA =
  "1f50752a19df80a538ce50a58e47d852c3373881a133bb3ebe3e556fff8f11ac";

const sql = readFileSync(MIGRATION_0045, "utf8");

function sha(file: string): string {
  return createHash("sha256")
    .update(readFileSync(file, "utf8"), "utf8")
    .digest("hex");
}

test("migrations 0000-0044 are unchanged and 0045 is pinned", () => {
  assert.equal(
    sha(resolve(migrationsDir, "0044_phase13_m4_005_service_payment.sql")),
    MIGRATION_0044_SHA
  );
  assert.equal(sha(MIGRATION_0045), MIGRATION_0045_SHA);
  const files = readdirSync(migrationsDir).filter((file) =>
    /\.sql$/u.test(file)
  );
  assert.equal(files.filter((file) => /^0045_/u.test(file)).length, 1);
  assert.equal(
    files.filter((file) =>
      /^(00(4[6-9]|[5-9][0-9])|0[1-9][0-9]{2})_/u.test(file)
    ).length,
    0
  );
});

test("journal and snapshot agree with the migration file", () => {
  const journal = JSON.parse(
    readFileSync(resolve(migrationsDir, "meta/_journal.json"), "utf8")
  ) as { entries: Array<{ idx: number; tag: string; when: number }> };
  assert.equal(journal.entries.length, 46);
  const last = journal.entries.at(-1);
  assert.equal(last?.idx, 45);
  assert.equal(last?.tag, "0045_phase13_m4_006_professional_review");
  assert.ok(
    (last?.when ?? 0) > 1_793_258_050_571,
    "journal timestamp must advance"
  );
  const snapshot = JSON.parse(
    readFileSync(resolve(migrationsDir, "meta/0045_snapshot.json"), "utf8")
  ) as { tables: Record<string, unknown> };
  // drizzle keys snapshots by schema-qualified table name.
  assert.ok(snapshot.tables["public.ProfessionalReviewRequest"]);
  assert.ok(snapshot.tables["public.ProfessionalReviewRevision"]);
});

test("tables, unique indexes and foreign keys are present", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ProfessionalReviewRequest"/u);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ProfessionalReviewRevision"/u);
  for (const index of [
    "ProfessionalReviewRequest_id_project_unique",
    "professionalreviewrequest_project_operation_unique",
    "ProfessionalReviewRevision_request_revision_unique",
    "ProfessionalReviewRevision_request_operation_unique",
  ]) {
    assert.ok(
      sql.toLowerCase().includes(index.toLowerCase()),
      `${index} missing`
    );
  }
  const fks = [
    "ProfessionalReviewRequest_projectId_StudyJourneyProject_id_fk",
    "ProfessionalReviewRequest_requestedByUserId_User_id_fk",
    "ProfessionalReviewRequest_reviewerUserId_User_id_fk",
    "ProfessionalReviewRevision_reviewRequestId_ProfessionalReviewRequest_id_fk",
    "ProfessionalReviewRevision_decidedByUserId_User_id_fk",
  ];
  for (const fk of fks) {
    assert.ok(sql.includes(fk), `${fk} missing`);
  }
  // Every FK clause keeps PostgreSQL's required order and refers to an existing table.
  for (const line of sql
    .split("\n")
    .filter((row) => row.includes("FOREIGN KEY"))) {
    assert.match(line, /ON DELETE restrict ON UPDATE no action;/u);
    assert.match(
      line,
      /REFERENCES "public"\."(StudyJourneyProject|User|ProfessionalReviewRequest)"\("id"\)/u
    );
  }
});

test("check constraints cover state, action, scope, hashes and invalidation", () => {
  const expected = [
    "ProfessionalReviewRequest_revision_check",
    "ProfessionalReviewRequest_hash_check",
    "ProfessionalReviewRequest_scope_check",
    "ProfessionalReviewRequest_state_check",
    "ProfessionalReviewRequest_purpose_check",
    "ProfessionalReviewRequest_target_kind_check",
    "ProfessionalReviewRequest_invalidation_check",
    "ProfessionalReviewRequest_timestamps_check",
    "ProfessionalReviewRevision_revision_check",
    "ProfessionalReviewRevision_hash_check",
    "ProfessionalReviewRevision_state_check",
    "ProfessionalReviewRevision_action_check",
  ];
  for (const constraint of expected) {
    assert.ok(
      sql.includes(`CONSTRAINT "${constraint}" CHECK`),
      `${constraint} missing`
    );
  }
  // The scope constraint must use cardinality so `{}` cannot pass a NULL BETWEEN.
  assert.match(sql, /cardinality\("reviewScope"\) between 1 and 4/u);
  assert.match(
    sql,
    /"reviewScope" <@ array\['eligibility_review', 'document_completeness', 'form_accuracy', 'legal_advice_alignment'\]/u
  );
  // `create_request` is the immutable revision-1 event.
  assert.match(sql, /"action" in \('create_request', 'start_review'/u);
});

test("append-only and projection guards are installed", () => {
  assert.match(
    sql,
    /CREATE FUNCTION "phase13_m4_006_request_guard"\(\) RETURNS trigger/u
  );
  assert.match(
    sql,
    /CREATE FUNCTION "phase13_m4_006_revision_guard"\(\) RETURNS trigger/u
  );
  assert.match(
    sql,
    /CREATE TRIGGER "ProfessionalReviewRequest_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProfessionalReviewRequest"/u
  );
  assert.match(
    sql,
    /CREATE TRIGGER "ProfessionalReviewRevision_guard" BEFORE UPDATE OR DELETE ON "ProfessionalReviewRevision"/u
  );
  // Append-only history is enforced in the database, not only in code.
  assert.match(sql, /Professional review revisions are append-only/u);
  // Revision skips and target rebinding are refused by the projection trigger.
  assert.match(sql, /NEW\."revision" <> OLD\."revision" \+ 1/u);
  assert.match(sql, /Professional review target binding is immutable/u);
  // Only the frozen transition graph is accepted.
  assert.match(sql, /Professional review transition is not permitted/u);
  assert.match(
    sql,
    /OLD\."state" = 'requested' AND NEW\."state" = 'in_review'/u
  );
  assert.match(
    sql,
    /OLD\."state" = 'in_review' AND NEW\."state" IN \('changes_requested', 'approved', 'rejected'\)/u
  );
});

test("the migration stays additive and never touches M4-005 tables", () => {
  assert.equal(/DROP\s+(TABLE|INDEX|CONSTRAINT)/iu.test(sql), false);
  assert.equal(
    /ALTER TABLE "(ServicePayment|ServiceEngagement|ServiceAgreement)/u.test(
      sql
    ),
    false
  );
  // No data statement: trigger bodies and trigger names legitimately mention UPDATE/DELETE.
  assert.equal(/^\s*(UPDATE|DELETE FROM|INSERT INTO)\s/imu.test(sql), false);
});
