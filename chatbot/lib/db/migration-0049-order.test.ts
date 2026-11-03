import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Phase 13 M6.2 - deterministic Migration 0049 shape and ordering.
 *
 * PostgreSQL rejects a foreign key whose referenced columns lack a unique index,
 * so indexes must precede the composite foreign keys that depend on them (the
 * M6.1 defect class). This test validates that structurally, offline.
 */

const source = readFileSync(
  new URL(
    "./migrations/0049_phase13_m6_2_student500_preparation.sql",
    import.meta.url
  ),
  "utf8"
);
const statements = source
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0);
const firstLine = (statement: string) => statement.split("\n")[0] ?? "";

const isTable = (s: string) => firstLine(s).startsWith("CREATE TABLE");
const isIndex = (s: string) =>
  firstLine(s).startsWith("CREATE INDEX") ||
  firstLine(s).startsWith("CREATE UNIQUE INDEX");
const isForeignKey = (s: string) => s.includes("FOREIGN KEY");
const isCheck = (s: string) =>
  firstLine(s).startsWith("ALTER TABLE") && s.includes("CHECK");
const isRoutine = (s: string) =>
  firstLine(s).startsWith("CREATE FUNCTION") ||
  firstLine(s).startsWith("CREATE TRIGGER");

const TABLES = [
  "Student500FactReference",
  "Student500GsDraft",
  "Student500PreparationSnapshot",
  "Student500SchoolContext",
] as const;

test("migration 0049 creates the four M6.2 tables exactly once", () => {
  for (const table of TABLES) {
    const created = statements.filter(
      (s) => isTable(s) && firstLine(s).includes(`"${table}"`)
    );
    assert.equal(created.length, 1, table);
  }
  assert.equal(statements.filter(isTable).length, TABLES.length);
  // 0048 stays untouched: 0049 never re-creates an M6.1 table.
  for (const table of [
    "Student500Application",
    "Student500ApplicationEvent",
    "Student500ApplicationOperation",
  ]) {
    assert.equal(
      statements.filter(
        (s) => isTable(s) && firstLine(s).includes(`"${table}"`)
      ).length,
      0,
      table
    );
  }
});

test("indexes precede every foreign key that depends on them", () => {
  const rank: Record<string, number> = {
    check: 3,
    fk: 2,
    index: 1,
    routine: 4,
    table: 0,
  };
  const sequence = statements
    .map((s) =>
      isTable(s)
        ? "table"
        : isIndex(s)
          ? "index"
          : isForeignKey(s)
            ? "fk"
            : isCheck(s)
              ? "check"
              : isRoutine(s)
                ? "routine"
                : null
    )
    .filter((entry) => typeof entry === "string") as string[];
  for (let i = 1; i < sequence.length; i += 1) {
    assert.ok(
      rank[sequence[i] as string] >= rank[sequence[i - 1] as string],
      `out of order at ${i}`
    );
  }
});

test("the M6.2 wide operation and result-kind checks are widened additively", () => {
  assert.match(
    source,
    /DROP CONSTRAINT IF EXISTS "Student500ApplicationOperation_operation_type_check"/u
  );
  assert.match(
    source,
    /DROP CONSTRAINT IF EXISTS "Student500ApplicationOperation_result_kind_check"/u
  );
  for (const value of [
    "student_500_select_fact",
    "student_500_unselect_fact",
    "student_500_set_school_context",
    "student_500_create_gs_draft",
    "student_500_save_gs_draft",
    "student_500_create_preparation_snapshot",
    "student_500_fact_reference",
    "student_500_school_context",
    "student_500_gs_draft",
    "student_500_preparation_snapshot",
  ]) {
    assert.ok(source.includes(`'${value}'`), value);
  }
  // The M6.1 values remain accepted.
  for (const value of [
    "student_500_create",
    "student_500_update",
    "student_500_archive",
    "student_500_application",
  ]) {
    assert.ok(source.includes(`'${value}'`), value);
  }
});

test("versions and audit rows are protected at the database level", () => {
  for (const table of ["Student500GsDraft", "Student500PreparationSnapshot"]) {
    assert.match(
      source,
      new RegExp(
        `CREATE TRIGGER "${table}_immutable" BEFORE UPDATE OR DELETE ON "${table}"`,
        "u"
      )
    );
    assert.match(
      source,
      new RegExp(
        `CREATE TRIGGER "${table}_insert_guard" BEFORE INSERT ON "${table}"`,
        "u"
      )
    );
    assert.match(
      source,
      new RegExp(
        `CREATE UNIQUE INDEX IF NOT EXISTS "${table}_application_version_unique"`,
        "u"
      )
    );
  }
  assert.match(
    source,
    /CREATE TRIGGER "Student500FactReference_guard" BEFORE UPDATE OR DELETE/u
  );
  assert.match(
    source,
    /CREATE TRIGGER "Student500SchoolContext_guard" BEFORE UPDATE/u
  );
  assert.match(source, /application_status = 'archived'/u);
  assert.match(source, /project_status IS DISTINCT FROM 'active'/u);
  // The school-context guard advances the revision by exactly one.
  assert.match(source, /NEW\."revision" <> OLD\."revision" \+ 1/u);
});

test("0049 keeps revoked fact-reference history re-selectable", () => {
  const unique = statements.filter((s) =>
    firstLine(s).includes(
      "Student500FactReference_application_fact_version_unique"
    )
  );
  assert.equal(unique.length, 1);
  // The uniqueness is partial: only an ACTIVE reference blocks re-selection, so a
  // revoked reference stays immutable history and the same fact can be re-selected.
  assert.match(unique[0] ?? "", /WHERE "revokedAt" is null/u);
});

test("0049 outcome coherence accepts every legitimate school-context kind", () => {
  const check = statements.filter((s) =>
    s.includes("Student500SchoolContext_outcome_coherence_check")
  );
  assert.equal(check.length, 1);
  const sql = check[0] ?? "";
  // A present bundle must be fully non-null: SQL UNKNOWN must not satisfy the CHECK.
  assert.match(sql, /"admissionOutcomeVersion" is not null/u);
  assert.match(sql, /"admissionOutcomeProvenance" is not null/u);
  assert.match(sql, /"admissionOutcomeVerified" is not null/u);
  assert.match(
    sql,
    /"admissionOutcomeVerified" = \("admissionOutcomeProvenance" in \('source_reviewed', 'provider_confirmed'\)\)/u
  );
  // A direct customer-reported CoE stays representable and never verified.
  assert.match(sql, /"kind" = 'customer_reported_coe'/u);
  assert.match(sql, /"admissionOutcomeProvenance" = 'customer_reported'/u);
  // An admission case may legitimately have no current Offer/CoE outcome.
  assert.match(
    sql,
    /"kind" = 'admission_case' and "admissionCaseId" is not null/u
  );
});
