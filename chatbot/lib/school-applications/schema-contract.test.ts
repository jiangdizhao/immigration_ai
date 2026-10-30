import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCHOOL_APPLICATION_EVENT_SUBJECT_KIND_VALUES,
  SCHOOL_APPLICATION_EVENT_TYPE_VALUES,
  SCHOOL_APPLICATION_OPERATION_RESULT_KIND_VALUES,
  SCHOOL_APPLICATION_OPERATION_TYPE_VALUES,
  SCHOOL_APPLICATION_PACKAGE_STATUS_VALUES,
  SCHOOL_APPLICATION_REFERENCE_KIND_VALUES,
  SCHOOL_APPLICATION_SOURCE_STATUS_VALUES,
  SCHOOL_APPLICATION_STATUS_VALUES,
} from "@/lib/db/schema";
import {
  SCHOOL_APPLICATION_EVENT_SUBJECT_KINDS,
  SCHOOL_APPLICATION_EVENT_TYPES,
  SCHOOL_APPLICATION_OPERATION_RESULT_KINDS,
  SCHOOL_APPLICATION_OPERATION_TYPES,
  SCHOOL_APPLICATION_PACKAGE_STATUSES,
  SCHOOL_APPLICATION_REFERENCE_KINDS,
  SCHOOL_APPLICATION_SOURCE_STATUSES,
  SCHOOL_APPLICATION_STATUSES,
} from "./contracts";

const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "../..");
const MIGRATION = resolve(
  chatbotRoot,
  "lib/db/migrations/0046_phase13_m5_1_school_applications.sql"
);
const SNAPSHOT = resolve(
  chatbotRoot,
  "lib/db/migrations/meta/0046_snapshot.json"
);
const PREVIOUS_SNAPSHOT = resolve(
  chatbotRoot,
  "lib/db/migrations/meta/0045_snapshot.json"
);
const JOURNAL = resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json");
const SCHEMA = resolve(chatbotRoot, "lib/db/schema.ts");

const TABLES = [
  "SchoolApplication",
  "SchoolApplicationPackage",
  "SchoolApplicationReference",
  "SchoolApplicationOperation",
  "SchoolApplicationEvent",
] as const;

const sql = readFileSync(MIGRATION, "utf8");
const schemaSource = readFileSync(SCHEMA, "utf8");

function statements(source: string): string[] {
  return source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

test("runtime contract enums and database enums cannot drift", () => {
  assert.deepEqual(
    [...SCHOOL_APPLICATION_STATUS_VALUES],
    [...SCHOOL_APPLICATION_STATUSES]
  );
  assert.deepEqual(
    [...SCHOOL_APPLICATION_SOURCE_STATUS_VALUES],
    [...SCHOOL_APPLICATION_SOURCE_STATUSES]
  );
  assert.deepEqual(
    [...SCHOOL_APPLICATION_REFERENCE_KIND_VALUES],
    [...SCHOOL_APPLICATION_REFERENCE_KINDS]
  );
  assert.deepEqual(
    [...SCHOOL_APPLICATION_PACKAGE_STATUS_VALUES],
    [...SCHOOL_APPLICATION_PACKAGE_STATUSES]
  );
  assert.deepEqual(
    [...SCHOOL_APPLICATION_OPERATION_TYPE_VALUES],
    [...SCHOOL_APPLICATION_OPERATION_TYPES]
  );
  assert.deepEqual(
    [...SCHOOL_APPLICATION_OPERATION_RESULT_KIND_VALUES],
    [...SCHOOL_APPLICATION_OPERATION_RESULT_KINDS]
  );
  assert.deepEqual(
    [...SCHOOL_APPLICATION_EVENT_TYPE_VALUES],
    [...SCHOOL_APPLICATION_EVENT_TYPES]
  );
  assert.deepEqual(
    [...SCHOOL_APPLICATION_EVENT_SUBJECT_KIND_VALUES],
    [...SCHOOL_APPLICATION_EVENT_SUBJECT_KINDS]
  );
});

test("migration 0046 creates only the five additive M5.1 tables", () => {
  for (const table of TABLES) {
    assert.ok(
      sql.includes(`CREATE TABLE IF NOT EXISTS "${table}"`),
      `${table} must be created additively`
    );
  }
  // No destructive or non-additive statements anywhere in the migration.
  for (const forbidden of [
    "DROP TABLE",
    "DROP COLUMN",
    "TRUNCATE",
    "DELETE FROM",
    "ALTER COLUMN",
    "RENAME TO",
    "SET NOT NULL",
  ]) {
    assert.ok(!sql.toUpperCase().includes(forbidden), forbidden);
  }
  // Frozen M1/M2/M3/M4 structures are untouched.
  for (const frozen of [
    '"StudyJourneyProject"',
    '"ProjectMembership"',
    '"ProjectOperation"',
    '"ProjectEvent"',
    '"ProjectFactAssertion"',
    '"ProjectDocumentAsset"',
    '"EducationProvider"',
    '"ProfessionalReviewRequest"',
    '"ProfessionalReviewRevision"',
    '"ServicePaymentCondition"',
    '"ServiceEngagement"',
  ]) {
    assert.ok(
      !new RegExp(`ALTER TABLE "${frozen.replaceAll('"', "")}"`).test(sql),
      `${frozen} must not be altered`
    );
  }
});

test("migration segments into complete statements for the runtime migrator", () => {
  assert.ok(!sql.includes("--->"));
  const parts = statements(sql);
  assert.ok(parts.length > 40, `unexpected statement count ${parts.length}`);
  for (const part of parts) {
    assert.ok(
      /;\s*$/u.test(part),
      `statement must end with a semicolon: ${part.slice(0, 60)}`
    );
    assert.ok(
      (part.match(/\$fn\$/g) ?? []).length % 2 === 0,
      "dollar quoting must balance"
    );
    assert.ok(
      (part.match(/\$\$/g) ?? []).length % 2 === 0,
      "anonymous dollar quoting must balance"
    );
    assert.ok(
      (part.match(/'/g) ?? []).length % 2 === 0,
      "single quotes must balance"
    );
  }
});

test("every declared CHECK constraint exists in the migration", () => {
  const declared = [...schemaSource.matchAll(/check\(\s*"([^"]+)"/gu)]
    .map((match) => match[1])
    .filter((name): name is string =>
      Boolean(name?.startsWith("SchoolApplication"))
    );
  assert.ok(
    declared.length >= 30,
    `expected many checks, got ${declared.length}`
  );
  for (const name of declared) {
    assert.ok(
      sql.includes(`ADD CONSTRAINT "${name}" CHECK`),
      `${name} must be appended to the migration (Drizzle does not emit checks)`
    );
  }
  // Every migration CHECK is declared in the schema, so the two cannot diverge.
  const migrated = [
    ...sql.matchAll(/ADD CONSTRAINT "(SchoolApplication[^"]+)" CHECK/gu),
  ].map((match) => match[1]);
  assert.deepEqual([...migrated].sort(), [...declared].sort());
});

test("integrity indexes and triggers are present and M5.1-only", () => {
  for (const index of [
    "SchoolApplicationPackage_current_application_unique",
    "SchoolApplicationPackage_application_version_unique",
    "SchoolApplicationReference_active_unique",
    "SchoolApplicationOperation_actor_operation_unique",
    "SchoolApplicationEvent_revision_event_unique",
  ]) {
    assert.ok(sql.includes(`"${index}"`), index);
  }
  assert.ok(
    sql.includes(
      `CREATE UNIQUE INDEX IF NOT EXISTS "SchoolApplicationPackage_current_application_unique" ON "SchoolApplicationPackage" USING btree ("applicationId") WHERE "SchoolApplicationPackage"."status" = 'current'`
    ),
    "one current package per application"
  );
  assert.ok(
    sql.includes(`WHERE "SchoolApplicationReference"."revokedAt" is null`),
    "one active binding per M2 identity"
  );
  for (const trigger of [
    "SchoolApplication_guard",
    "SchoolApplicationPackage_guard",
    "SchoolApplicationReference_guard",
    "SchoolApplicationOperation_append_only",
    "SchoolApplicationEvent_append_only",
  ]) {
    assert.ok(
      sql.includes(`CREATE TRIGGER "${trigger}"`),
      `${trigger} must exist`
    );
  }
  for (const fn of [
    "phase13_m5_1_application_guard",
    "phase13_m5_1_package_guard",
    "phase13_m5_1_reference_guard",
    "phase13_m5_1_append_only_guard",
  ]) {
    assert.ok(sql.includes(`CREATE FUNCTION "${fn}"`), fn);
  }
});

test("the journal and snapshot record migration 0046 as the unapplied head", () => {
  const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as {
    entries: { idx: number; tag: string; when: number }[];
  };
  const head = journal.entries.at(-1);
  assert.equal(head?.idx, 46);
  assert.equal(head?.tag, "0046_phase13_m5_1_school_applications");
  assert.equal(journal.entries.length, 47);

  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as {
    prevId: string;
    tables: Record<string, { columns: Record<string, unknown> }>;
  };
  const previous = JSON.parse(readFileSync(PREVIOUS_SNAPSHOT, "utf8")) as {
    id: string;
    tables: Record<string, unknown>;
  };
  assert.equal(snapshot.prevId, previous.id);
  for (const table of TABLES) {
    assert.ok(snapshot.tables[`public.${table}`], `${table} in snapshot`);
    assert.ok(!(table in previous.tables), `${table} must not pre-exist`);
  }
  assert.equal(
    Object.keys(snapshot.tables["public.SchoolApplication"]?.columns ?? {})
      .length,
    18
  );
  assert.equal(
    Object.keys(
      snapshot.tables["public.SchoolApplicationPackage"]?.columns ?? {}
    ).length,
    18
  );
  assert.equal(
    Object.keys(
      snapshot.tables["public.SchoolApplicationReference"]?.columns ?? {}
    ).length,
    10
  );
  assert.equal(
    Object.keys(
      snapshot.tables["public.SchoolApplicationOperation"]?.columns ?? {}
    ).length,
    8
  );
  assert.equal(
    Object.keys(snapshot.tables["public.SchoolApplicationEvent"]?.columns ?? {})
      .length,
    10
  );
});

test("no M5.1 statement can create professional review, payment or submission authority", () => {
  for (const forbidden of [
    "ProfessionalReview",
    "ServicePayment",
    "ServiceAgreement",
    "ServiceSignature",
    "VipPurchase",
    "submissionReceipt",
    "offerReceived",
    "coeIssued",
  ]) {
    assert.ok(!sql.includes(forbidden), forbidden);
  }
});
