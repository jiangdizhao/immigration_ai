import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * Phase 13 M5.1 — deterministic Migration 0046 statement ordering.
 *
 * PostgreSQL rejects a foreign key whose referenced columns have no unique
 * constraint or unique index yet, so every index must be created before any
 * foreign key that depends on it. This test validates that ordering structurally
 * (offline, no database) and will fail if the migration is regenerated or
 * hand-edited into an order that cannot apply.
 */

const migrationUrl = new URL(
  "./migrations/0046_phase13_m5_1_school_applications.sql",
  import.meta.url
);

const BREAKPOINT = "--> statement-breakpoint";

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

test("migration 0046 statements are ordered tables -> indexes -> foreign keys -> checks -> routines", async () => {
  const all = statements(await readFile(migrationUrl, "utf8"));
  assert.ok(all.length > 0, "migration is not empty");

  const classified = all.map((statement) => ({
    statement,
    kind: isTable(statement)
      ? 1
      : isIndex(statement)
        ? 2
        : isForeignKey(statement)
          ? 3
          : isCheck(statement)
            ? 4
            : isRoutine(statement)
              ? 5
              : 0,
  }));

  for (const entry of classified) {
    assert.notEqual(
      entry.kind,
      0,
      `unclassified statement cannot be placed: ${firstLine(entry.statement).slice(0, 80)}`
    );
  }

  const kinds = classified.map((entry) => entry.kind);
  const sorted = [...kinds].sort((left, right) => left - right);
  assert.deepEqual(
    kinds,
    sorted,
    "statements must appear in the order tables, indexes, foreign keys, checks, routines"
  );
});

test("migration 0046 creates every composite foreign-key target before the foreign key", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const all = statements(source);
  const position = (predicate: (statement: string) => boolean) => {
    const index = all.findIndex(predicate);
    assert.notEqual(index, -1, "expected statement is missing");
    return index;
  };

  const compositeApplicationIndex = position((statement) =>
    firstLine(statement).includes(
      'CREATE UNIQUE INDEX IF NOT EXISTS "SchoolApplication_project_id_unique"'
    )
  );
  const compositeApplicationFks = [
    "SchoolApplicationEvent_application_fk",
    "SchoolApplicationPackage_application_fk",
    "SchoolApplicationReference_application_fk",
  ];
  for (const fk of compositeApplicationFks) {
    const fkPosition = position((statement) =>
      statement.includes(`ADD CONSTRAINT "${fk}"`)
    );
    assert.ok(
      compositeApplicationIndex < fkPosition,
      `SchoolApplication_project_id_unique must precede ${fk}`
    );
  }

  // No foreign key at all may precede the first index: every referenced key must
  // already exist, including the primary key of each new table and the M1/M2
  // targets those tables point at.
  const firstIndexPosition = all.findIndex(isIndex);
  const firstForeignKeyPosition = all.findIndex(isForeignKey);
  assert.notEqual(firstIndexPosition, -1);
  assert.notEqual(firstForeignKeyPosition, -1);
  assert.ok(
    firstIndexPosition < firstForeignKeyPosition,
    "all indexes must be created before the first foreign key"
  );

  // Functions must exist before the triggers that reference them.
  const functionPositions = new Map<string, number>();
  all.forEach((statement, index) => {
    const match = statement.match(/CREATE FUNCTION "([^"]+)"/u);
    if (match) {
      functionPositions.set(match[1] as string, index);
    }
  });
  let triggerCount = 0;
  all.forEach((statement, index) => {
    const match = firstLine(statement).match(
      /CREATE TRIGGER "([^"]+)"[\s\S]*EXECUTE FUNCTION "([^"]+)"/u
    );
    if (!match) {
      return;
    }
    triggerCount += 1;
    const functionPosition = functionPositions.get(match[2] as string);
    assert.notEqual(
      functionPosition,
      undefined,
      `trigger ${match[1]} references an undefined function`
    );
    assert.ok(
      (functionPosition as number) < index,
      `function ${match[2]} must be defined before trigger ${match[1]}`
    );
  });
  assert.equal(triggerCount, 5, "all five M5.1 triggers are present");
});

test("migration 0046 never reorders into destructive or non-0046 statements", async () => {
  const all = statements(await readFile(migrationUrl, "utf8"));
  for (const statement of all) {
    const line = firstLine(statement);
    for (const forbidden of ["DROP ", "TRUNCATE", "ALTER COLUMN", "RENAME"]) {
      assert.ok(!line.includes(forbidden), `${forbidden} is not allowed`);
    }
  }
});
