import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCHOOL_ADMISSION_AUDIT_EVENT_VALUES,
  SCHOOL_ADMISSION_AUDIT_SUBJECT_VALUES,
  SCHOOL_ADMISSION_COE_STATE_VALUES,
  SCHOOL_ADMISSION_EXCEPTION_STATE_VALUES,
  SCHOOL_ADMISSION_EXTERNAL_ACTION_VALUES,
  SCHOOL_ADMISSION_OFFER_STATE_VALUES,
  SCHOOL_ADMISSION_ORIGIN_VALUES,
  SCHOOL_ADMISSION_OUTCOME_KIND_VALUES,
  SCHOOL_ADMISSION_PREPARATION_STATE_VALUES,
  SCHOOL_ADMISSION_PROVENANCE_VALUES,
  SCHOOL_ADMISSION_READINESS_VALUES,
  SCHOOL_ADMISSION_SERVICE_MODE_VALUES,
} from "@/lib/db/schema";
import {
  SCHOOL_ADMISSIONS_COE_STATES,
  SCHOOL_ADMISSIONS_EXCEPTION_STATES,
  SCHOOL_ADMISSIONS_EXTERNAL_ACTION_KINDS,
  SCHOOL_ADMISSIONS_OFFER_STATES,
  SCHOOL_ADMISSIONS_ORIGIN_KINDS,
  SCHOOL_ADMISSIONS_OUTCOME_KINDS,
  SCHOOL_ADMISSIONS_OUTCOME_PROVENANCES,
  SCHOOL_ADMISSIONS_PREPARATION_STATES,
  SCHOOL_ADMISSIONS_READINESS_STATUSES,
  SCHOOL_ADMISSIONS_SERVICE_MODES,
} from "./contracts";
import { SCHOOL_ADMISSIONS_OPERATION_TYPES } from "./ports";

const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "../..");
const MIGRATION = resolve(
  chatbotRoot,
  "lib/db/migrations/0047_phase13_m5_2_school_admissions.sql"
);
const SNAPSHOT = resolve(
  chatbotRoot,
  "lib/db/migrations/meta/0047_snapshot.json"
);
const PRESERVED_PREVIOUS_SNAPSHOT = resolve(
  chatbotRoot,
  "lib/db/migrations/meta/0046_snapshot.json"
);
const JOURNAL = resolve(chatbotRoot, "lib/db/migrations/meta/_journal.json");

const TABLES = [
  "SchoolAdmissionCase",
  "SchoolAdmissionPreparation",
  "SchoolAdmissionOutcome",
  "SchoolAdmissionExternalAction",
  "SchoolAdmissionException",
  "SchoolAdmissionOperation",
  "SchoolAdmissionEvent",
] as const;

const INDEXES = [
  "SchoolAdmissionCase_project_id_unique",
  "SchoolAdmissionCase_project_application_unique",
  "SchoolAdmissionCase_project_owner_created_idx",
  "SchoolAdmissionPreparation_case_version_unique",
  "SchoolAdmissionPreparation_case_created_idx",
  "SchoolAdmissionOutcome_case_kind_version_unique",
  "SchoolAdmissionOutcome_current_unique",
  "SchoolAdmissionOutcome_case_recorded_idx",
  "SchoolAdmissionExternalAction_case_recorded_idx",
  "SchoolAdmissionException_case_version_unique",
  "SchoolAdmissionException_current_unique",
  "SchoolAdmissionOperation_actor_operation_unique",
  "SchoolAdmissionOperation_actor_created_idx",
  "SchoolAdmissionEvent_case_revision_event_unique",
  "SchoolAdmissionEvent_case_created_idx",
] as const;

const TRIGGERS = [
  "SchoolAdmissionCase_guard",
  "SchoolAdmissionPreparation_guard",
  "SchoolAdmissionOutcome_guard",
  "SchoolAdmissionException_guard",
  "SchoolAdmissionExternalAction_append_only",
  "SchoolAdmissionOperation_append_only",
  "SchoolAdmissionEvent_append_only",
] as const;

const FUNCTIONS = [
  "phase13_m5_2_case_guard",
  "phase13_m5_2_preparation_guard",
  "phase13_m5_2_outcome_guard",
  "phase13_m5_2_exception_guard",
  "phase13_m5_2_append_only_guard",
] as const;

const migration = readFileSync(MIGRATION, "utf8");
const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as {
  tables: Record<
    string,
    { columns: Record<string, unknown>; indexes: Record<string, unknown> }
  >;
};
const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as {
  entries: { idx: number; tag: string }[];
};

test("migration 0047, snapshot and journal agree on the M5.2 schema", () => {
  for (const table of TABLES) {
    assert.equal(
      migration.includes(`CREATE TABLE IF NOT EXISTS "${table}"`),
      true,
      `${table} missing from migration`
    );
    assert.ok(
      snapshot.tables[`public.${table}`],
      `${table} missing from snapshot`
    );
  }
  const head = journal.entries.at(-1);
  assert.equal(head?.idx, 47);
  assert.equal(head?.tag, "0047_phase13_m5_2_school_admissions");
  assert.doesNotThrow(() => readFileSync(PRESERVED_PREVIOUS_SNAPSHOT, "utf8"));
});

test("every M5.2 table closes over its expected indexes and triggers", () => {
  for (const index of INDEXES) {
    assert.equal(
      migration.includes(`"${index}"`),
      true,
      `${index} missing from migration`
    );
  }
  for (const trigger of TRIGGERS) {
    assert.equal(
      migration.includes(`CREATE TRIGGER "${trigger}"`),
      true,
      `${trigger} missing from migration`
    );
  }
  for (const fn of FUNCTIONS) {
    assert.equal(
      migration.includes(`CREATE FUNCTION "${fn}"`),
      true,
      `${fn} missing from migration`
    );
  }
});

test("partial unique indexes keep exactly one live outcome and exception", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionOutcome_current_unique" ON "SchoolAdmissionOutcome" USING btree \("caseId","kind"\) WHERE "SchoolAdmissionOutcome"\."supersededById" is null/u
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionException_current_unique" ON "SchoolAdmissionException" USING btree \("caseId"\) WHERE "SchoolAdmissionException"\."supersededById" is null/u
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS "SchoolAdmissionCase_project_application_unique" ON "SchoolAdmissionCase" USING btree \("projectId","applicationId"\) WHERE "SchoolAdmissionCase"\."applicationId" is not null/u
  );
});

test("the domain vocabulary and the database vocabulary are identical", () => {
  assert.deepEqual(
    [...SCHOOL_ADMISSION_ORIGIN_VALUES],
    [...SCHOOL_ADMISSIONS_ORIGIN_KINDS]
  );
  assert.deepEqual(
    [...SCHOOL_ADMISSION_SERVICE_MODE_VALUES],
    [...SCHOOL_ADMISSIONS_SERVICE_MODES]
  );
  assert.deepEqual(
    [...SCHOOL_ADMISSION_PREPARATION_STATE_VALUES],
    [...SCHOOL_ADMISSIONS_PREPARATION_STATES]
  );
  assert.deepEqual(
    [...SCHOOL_ADMISSION_READINESS_VALUES],
    [...SCHOOL_ADMISSIONS_READINESS_STATUSES]
  );
  assert.deepEqual(
    [...SCHOOL_ADMISSION_OUTCOME_KIND_VALUES],
    [...SCHOOL_ADMISSIONS_OUTCOME_KINDS]
  );
  assert.deepEqual(
    [...SCHOOL_ADMISSION_OFFER_STATE_VALUES],
    [...SCHOOL_ADMISSIONS_OFFER_STATES]
  );
  assert.deepEqual(
    [...SCHOOL_ADMISSION_COE_STATE_VALUES],
    [...SCHOOL_ADMISSIONS_COE_STATES]
  );
  assert.deepEqual(
    [...SCHOOL_ADMISSION_PROVENANCE_VALUES],
    [...SCHOOL_ADMISSIONS_OUTCOME_PROVENANCES]
  );
  assert.deepEqual(
    [...SCHOOL_ADMISSION_EXTERNAL_ACTION_VALUES],
    [...SCHOOL_ADMISSIONS_EXTERNAL_ACTION_KINDS]
  );
  assert.deepEqual(
    [...SCHOOL_ADMISSION_EXCEPTION_STATE_VALUES],
    [...SCHOOL_ADMISSIONS_EXCEPTION_STATES]
  );
  for (const operationType of SCHOOL_ADMISSIONS_OPERATION_TYPES) {
    assert.equal(
      migration.includes(`'${operationType}'`),
      true,
      `${operationType} missing from the operation CHECK`
    );
  }
  for (const event of SCHOOL_ADMISSION_AUDIT_EVENT_VALUES) {
    assert.equal(migration.includes(`'${event}'`), true, `${event} missing`);
  }
  for (const subject of SCHOOL_ADMISSION_AUDIT_SUBJECT_VALUES) {
    assert.equal(
      migration.includes(`'${subject}'`),
      true,
      `${subject} missing`
    );
  }
});

test("the supersession foreign keys are deferred and confirmation is forward-only", () => {
  // The partial unique index is immediate, so a successor is inserted only after
  // the live row is superseded; the pointer must therefore be validated at COMMIT.
  for (const constraint of [
    "SchoolAdmissionOutcome_superseded_fk",
    "SchoolAdmissionException_superseded_fk",
  ]) {
    const line = migration
      .split("\n")
      .find((row) => row.includes(`"${constraint}"`));
    assert.ok(line, `${constraint} missing`);
    assert.match(line as string, /DEFERRABLE INITIALLY DEFERRED/u);
  }
  // A confirmed preparation version may advance to a newer version, never back.
  assert.match(migration, /SchoolAdmissionCase_confirmation_forward_only/u);
  assert.match(
    migration,
    /Preparation confirmation may only advance to a newer version/u
  );
  {
    // The guard must reject BOTH a backwards move and a clear-to-NULL; a
    // NULL-tolerant check would let a settled confirmation silently disappear.
    const guard = migration.slice(
      migration.indexOf('CREATE FUNCTION "phase13_m5_2_case_guard"'),
      migration.indexOf('CREATE TRIGGER "SchoolAdmissionCase_guard"')
    );
    assert.ok(guard.length > 0, "case guard routine must exist");
    assert.match(guard, /OLD\."confirmedPreparationVersion" IS NOT NULL/u);
    assert.match(guard, /NEW\."confirmedPreparationVersion" IS NULL/u);
    assert.match(
      guard,
      /NEW\."confirmedPreparationVersion" < OLD\."confirmedPreparationVersion"/u
    );
    // A first confirmation (OLD NULL) must stay legal, so the NULL rejection may
    // not be reachable while the previous version is still unconfirmed.
    assert.equal(
      /IF NEW\."confirmedPreparationVersion" IS NULL\s+AND/.test(guard),
      false
    );
  }
  assert.equal(
    /A confirmed preparation version is final/u.test(migration),
    false,
    "the permanent confirmation freeze must be gone"
  );
});

test("the migration encodes the authority boundaries in SQL, not only in code", () => {
  assert.match(
    migration,
    /"SchoolAdmissionExternalAction_provenance_check" CHECK \("provenance" = 'customer_reported'\)/u
  );
  assert.match(migration, /SchoolAdmissionException_decision_check/u);
  assert.match(migration, /"SchoolAdmissionOutcome_document_backed_check"/u);
  assert.match(migration, /SchoolAdmissionCase_application_consistency_check/u);
  assert.match(migration, /SchoolAdmissionCase_readiness_observation_check/u);
  assert.match(
    migration,
    /"SchoolAdmissionExternalAction_acknowledged_check" CHECK \("acknowledged"\)/u
  );
});
