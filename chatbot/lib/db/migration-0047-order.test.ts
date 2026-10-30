import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * Phase 13 M5.2 — deterministic Migration 0047 statement ordering and shape.
 *
 * PostgreSQL rejects a foreign key whose referenced columns have no unique
 * constraint or unique index yet, so every index must be created before any
 * foreign key that depends on it. This test validates that ordering structurally
 * (offline, no database) and fails if the migration is regenerated or
 * hand-edited into an order that cannot apply.
 */

const migrationUrl = new URL(
  "./migrations/0047_phase13_m5_2_school_admissions.sql",
  import.meta.url
);

const BREAKPOINT = "--> statement-breakpoint";

const M5_2_TABLES = [
  "SchoolAdmissionCase",
  "SchoolAdmissionPreparation",
  "SchoolAdmissionOutcome",
  "SchoolAdmissionExternalAction",
  "SchoolAdmissionException",
  "SchoolAdmissionOperation",
  "SchoolAdmissionEvent",
] as const;

function statements(source: string): string[] {
  return source
    .split(BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function firstLine(statement: string): string {
  return statement.split("\n")[0] ?? "";
}

function isTable(statement: string) {
  return firstLine(statement).startsWith("CREATE TABLE");
}

function isIndex(statement: string) {
  const line = firstLine(statement);
  return (
    line.startsWith("CREATE INDEX") || line.startsWith("CREATE UNIQUE INDEX")
  );
}

function isForeignKey(statement: string) {
  return statement.includes("FOREIGN KEY");
}

function isCheck(statement: string) {
  return (
    firstLine(statement).startsWith("ALTER TABLE") &&
    statement.includes("CHECK")
  );
}

function isRoutine(statement: string) {
  const line = firstLine(statement);
  return (
    line.startsWith("CREATE FUNCTION") || line.startsWith("CREATE TRIGGER")
  );
}

test("migration 0047 creates the entire M5.2 schema exactly once", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const all = statements(source);
  for (const table of M5_2_TABLES) {
    const created = all.filter(
      (statement) =>
        isTable(statement) && firstLine(statement).includes(`"${table}"`)
    );
    assert.equal(created.length, 1, `${table} must be created exactly once`);
  }
  assert.equal(all.filter(isTable).length, M5_2_TABLES.length);
});

test("migration 0047 orders tables, indexes, FKs, CHECKs, then routines", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const all = statements(source);
  const rank: Record<string, number> = {
    check: 3,
    fk: 2,
    index: 1,
    routine: 4,
    table: 0,
  };
  const sequence = all
    .map((statement) => {
      if (isTable(statement)) {
        return "table";
      }
      if (isIndex(statement)) {
        return "index";
      }
      if (isForeignKey(statement)) {
        return "fk";
      }
      if (isCheck(statement)) {
        return "check";
      }
      if (isRoutine(statement)) {
        return "routine";
      }
      return null;
    })
    .filter((entry): entry is Exclude<typeof entry, null> => entry !== null);
  for (let index = 1; index < sequence.length; index += 1) {
    assert.ok(
      (rank[sequence[index] as string] as number) >=
        (rank[sequence[index - 1] as string] as number),
      `statement order regressed at ${sequence[index - 1]} -> ${sequence[index]}`
    );
  }
  assert.equal(sequence[0], "table");
  assert.equal(sequence.at(-1), "routine");
});

test("every composite foreign key has its referenced unique index", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const priorSource = await readFile(
    new URL(
      "./migrations/0046_phase13_m5_1_school_applications.sql",
      import.meta.url
    ),
    "utf8"
  );
  const all = statements(source);
  const indexNames = new Set(
    all.filter(isIndex).map((statement) => {
      const match = statement.match(/INDEX IF NOT EXISTS "([^"]+)"/u);
      return match?.[1] ?? "";
    })
  );
  const compositeFks = all.filter(
    (statement) =>
      isForeignKey(statement) &&
      /FOREIGN KEY \("[^"]+","[^"]+"\)/u.test(statement)
  );
  assert.ok(compositeFks.length >= 6);
  for (const foreignKey of compositeFks) {
    const target = foreignKey.match(/REFERENCES "public"\."([^"]+)"\(/u)?.[1];
    assert.ok(target, `unresolvable FK target: ${foreignKey}`);
    if (target === "SchoolApplication") {
      // Created by the accepted M5.1 migration; 0047 must not recreate it.
      assert.equal(
        priorSource.includes(
          'CREATE UNIQUE INDEX IF NOT EXISTS "SchoolApplication_project_id_unique"'
        ),
        true,
        "M5.1 composite unique index must exist for the M5.2 FK"
      );
      assert.equal(
        indexNames.has("SchoolApplication_project_id_unique"),
        false,
        "0047 must not duplicate the M5.1 index"
      );
    } else {
      assert.equal(
        indexNames.has("SchoolAdmissionCase_project_id_unique"),
        true,
        `${target} composite FK needs SchoolAdmissionCase_project_id_unique`
      );
    }
  }
});

test("the case guard pairs forward-only confirmation with supersession safety", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const all = statements(source);
  const guards = all.filter((statement) =>
    statement.includes('CREATE FUNCTION "phase13_m5_2_case_guard"')
  );
  assert.equal(guards.length, 1, "exactly one case guard routine");
  const guard = guards[0] as string;

  // Confirmation is forward-only and may never be cleared back to NULL...
  assert.match(guard, /OLD\."confirmedPreparationVersion" IS NOT NULL/u);
  assert.match(guard, /NEW\."confirmedPreparationVersion" IS NULL/u);
  assert.match(
    guard,
    /NEW\."confirmedPreparationVersion" < OLD\."confirmedPreparationVersion"/u
  );
  assert.match(guard, /SchoolAdmissionCase_confirmation_forward_only/u);
  // ...while the identity freeze must not include the confirmation column, which
  // would make legitimate v1 -> v2 confirmation impossible.
  const identityBlock = guard.slice(
    guard.indexOf('IF NEW."id" IS DISTINCT FROM OLD."id"'),
    guard.indexOf("SchoolAdmissionCase_identity_immutable")
  );
  assert.ok(identityBlock.length > 0, "identity immutability block must exist");
  assert.equal(
    identityBlock.includes("confirmedPreparationVersion"),
    false,
    "confirmation must stay outside the identity immutability freeze"
  );

  // The guard is attached to the case table for updates only.
  const triggers = all.filter(
    (statement) =>
      firstLine(statement).startsWith("CREATE TRIGGER") &&
      statement.includes('"SchoolAdmissionCase_guard"')
  );
  assert.equal(triggers.length, 1);
  assert.match(
    triggers[0] as string,
    /BEFORE UPDATE ON "SchoolAdmissionCase"/u
  );

  // Supersession must be validated at COMMIT because the successor row is
  // written after the live row it replaces.
  for (const constraint of [
    "SchoolAdmissionOutcome_superseded_fk",
    "SchoolAdmissionException_superseded_fk",
  ]) {
    const line = source
      .split("\n")
      .find((row) => row.includes(`"${constraint}"`));
    assert.ok(line, `${constraint} missing`);
    assert.match(line as string, /DEFERRABLE INITIALLY DEFERRED/u);
  }
});
