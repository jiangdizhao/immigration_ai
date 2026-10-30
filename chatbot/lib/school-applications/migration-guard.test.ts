// biome-ignore-all lint/suspicious/noMisplacedAssertion: helpers are scoped to the structural guard test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Phase 13 M5.1 — Migration 0046 trigger semantics vs the implemented update
 * contract.
 *
 * The application update API (and the M5.1 preparation workflow) legitimately
 * edits the material target: institution name, course title, delivery, intake and
 * the catalog identifiers. The database guard must therefore freeze *identity*
 * only, while the CAS revision step and the archived-terminal rule keep the
 * lifecycle integrity that the guard exists for.
 *
 * This is a structural (offline) test: it never connects to a database, and the
 * executable PostgreSQL behaviour is covered by the prepared-only integration
 * suite.
 */

const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "../..");
const MIGRATION = resolve(
  chatbotRoot,
  "lib/db/migrations/0046_phase13_m5_1_school_applications.sql"
);
const SERVICE = resolve(chatbotRoot, "lib/school-applications/service.ts");
const REPOSITORY = resolve(
  chatbotRoot,
  "lib/school-applications/postgres-repository.ts"
);
const SCHEMA = resolve(chatbotRoot, "lib/db/schema.ts");

const sql = readFileSync(MIGRATION, "utf8");
const serviceSource = readFileSync(SERVICE, "utf8");
const repositorySource = readFileSync(REPOSITORY, "utf8");
const schemaSource = readFileSync(SCHEMA, "utf8");

function applicationGuardBody(): string {
  const start = sql.indexOf('CREATE FUNCTION "phase13_m5_1_application_guard"');
  assert.notEqual(start, -1, "application guard function is missing");
  const end = sql.indexOf("$fn$;", start);
  assert.notEqual(end, -1, "application guard function is unterminated");
  return sql.slice(start, end);
}

test("the application guard freezes identity, not the editable material target", () => {
  const body = applicationGuardBody();
  const identityBlock = body.slice(
    body.indexOf("BEGIN"),
    body.indexOf("END IF;") + "END IF;".length
  );

  for (const column of ["id", "projectId", "ownerUserId", "createdAt"]) {
    assert.ok(
      identityBlock.includes(
        `NEW."${column}" IS DISTINCT FROM OLD."${column}"`
      ),
      `${column} must be immutable`
    );
  }
  // The update API deliberately supports editing these fields; freezing them
  // would make every legitimate authorized edit fail at the database.
  for (const column of [
    "institutionName",
    "institutionId",
    "courseTitle",
    "courseId",
    "deliveryId",
    "intakeId",
    "intakeLabel",
    "sourceStatus",
    "catalogRecordClass",
    "catalogSnapshotToken",
    "status",
    "updatedAt",
  ]) {
    assert.ok(
      !identityBlock.includes(
        `NEW."${column}" IS DISTINCT FROM OLD."${column}"`
      ),
      `${column} must stay editable through the authorized CAS update path`
    );
  }
  assert.ok(
    !body.includes('institutionName" IS DISTINCT FROM'),
    "institutionName must not be frozen anywhere in the guard"
  );
  assert.ok(
    !body.includes('courseTitle" IS DISTINCT FROM'),
    "courseTitle must not be frozen anywhere in the guard"
  );
});

test("the application guard keeps revision integrity and archived-terminal state", () => {
  const body = applicationGuardBody();
  assert.ok(
    body.includes('IF NEW."revision" <> OLD."revision" + 1 THEN'),
    "a write must advance the revision by exactly one"
  );
  assert.ok(
    body.includes("SchoolApplication_revision_step"),
    "the revision-step constraint is named for operators"
  );
  assert.ok(
    body.includes("IF OLD.\"status\" = 'archived' THEN"),
    "an archived application must be terminal"
  );
  assert.ok(
    body.includes("SchoolApplication_terminal_state"),
    "the terminal-state constraint is named for operators"
  );
  // archivedAt may only transition null -> set together with archival, so the
  // archive CHECK and the guard cannot contradict each other.
  assert.ok(
    body.includes('NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt"'),
    "archivedAt may only change on archival"
  );
  assert.ok(
    body.includes("SchoolApplication_archive_transition"),
    "the archive-transition constraint is named for operators"
  );
});

test("every editable material field is actually writable by the implemented update path", () => {
  // The service resolves and passes the full target on update.
  for (const field of [
    "institutionName",
    "institutionId",
    "courseTitle",
    "courseId",
    "deliveryId",
    "intakeId",
    "intakeLabel",
  ]) {
    assert.ok(
      serviceSource.includes(`${field}: resolved.fields.${field},`),
      `service update must forward ${field}`
    );
    assert.ok(
      repositorySource.includes(`${field}: values.${field},`),
      `repository insert/update must persist ${field}`
    );
    assert.ok(
      schemaSource.includes(`${field}: varchar`),
      `schema must declare ${field}`
    );
  }
  // The update statement writes the material values and advances the revision.
  assert.ok(
    repositorySource.includes("...valuesForInsert(input.values),"),
    "update must write the material values"
  );
  assert.ok(
    repositorySource.includes(
      "eq(schoolApplication.revision, input.expectedRevision)"
    ),
    "update must remain a compare-and-set on the revision"
  );
});

test("a material edit invalidates the current package instead of reusing it", () => {
  // The transition is owned by the store transaction, together with the package
  // invalidation, so a package cannot survive the edit that invalidated it.
  assert.ok(
    repositorySource.includes("schoolApplicationStatusAfterMaterialChange"),
    "the store must apply the material-change transition"
  );
  assert.ok(
    repositorySource.includes("invalidateCurrentPackage(tx, {"),
    "the store must invalidate the current package inside the update transaction"
  );
  assert.ok(
    sql.includes('"SchoolApplicationPackage_current_application_unique"'),
    "at most one current package per application is database-enforced"
  );
});
