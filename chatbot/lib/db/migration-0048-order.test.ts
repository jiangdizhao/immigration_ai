import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * Phase 13 M6.1 - deterministic Migration 0048 statement ordering and shape.
 *
 * PostgreSQL rejects a foreign key whose referenced columns have no unique
 * constraint or unique index yet, so every index must be created before any
 * foreign key that depends on it. This test validates that structurally (offline,
 * no database) and fails if the migration is regenerated or hand-edited into an
 * order that cannot apply.
 */

const migrationUrl = new URL(
  "./migrations/0048_phase13_m6_1_student500_applications.sql",
  import.meta.url
);

const BREAKPOINT = "--> statement-breakpoint";

const M6_1_TABLES = [
  "Student500Application",
  "Student500ApplicationEvent",
  "Student500ApplicationOperation",
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

const isTable = (statement: string) =>
  firstLine(statement).startsWith("CREATE TABLE");
const isIndex = (statement: string) => {
  const line = firstLine(statement);
  return (
    line.startsWith("CREATE INDEX") || line.startsWith("CREATE UNIQUE INDEX")
  );
};
const isForeignKey = (statement: string) => statement.includes("FOREIGN KEY");
const isCheck = (statement: string) =>
  firstLine(statement).startsWith("ALTER TABLE") && statement.includes("CHECK");
const isRoutine = (statement: string) => {
  const line = firstLine(statement);
  return (
    line.startsWith("CREATE FUNCTION") || line.startsWith("CREATE TRIGGER")
  );
};

test("migration 0048 creates the entire M6.1 schema exactly once", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const all = statements(source);
  for (const table of M6_1_TABLES) {
    const created = all.filter(
      (statement) =>
        isTable(statement) && firstLine(statement).includes(`"${table}"`)
    );
    assert.equal(created.length, 1, `${table} must be created exactly once`);
  }
  assert.equal(all.filter(isTable).length, M6_1_TABLES.length);
});

test("migration 0048 orders tables, indexes, FKs, CHECKs, then routines", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const rank: Record<string, number> = {
    check: 3,
    fk: 2,
    index: 1,
    routine: 4,
    table: 0,
  };
  const sequence = statements(source)
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
      rank[sequence[index] as string] >= rank[sequence[index - 1] as string],
      `out of order at ${index}: ${sequence.join(",")}`
    );
  }
});

test("every composite foreign key target has a unique index first", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const all = statements(source);
  const indexNames = new Set(
    all
      .filter(isIndex)
      .map(
        (statement) =>
          statement.match(/INDEX IF NOT EXISTS "([^"]+)"/u)?.[1] ?? ""
      )
  );
  const compositeForeignKeys = all.filter(
    (statement) =>
      isForeignKey(statement) &&
      /FOREIGN KEY \("[^"]+","[^"]+"\)/u.test(statement)
  );
  assert.ok(compositeForeignKeys.length >= 2);
  for (const foreignKey of compositeForeignKeys) {
    const target = foreignKey.match(/REFERENCES "public"\."([^"]+)"\(/u)?.[1];
    assert.ok(target, `unresolvable FK target: ${foreignKey}`);
    assert.ok(
      indexNames.has(`${target}_project_id_unique`),
      `${target} composite FK needs ${target}_project_id_unique`
    );
  }
});

test("the application guard freezes identity and archived terminality", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const all = statements(source);
  const guards = all.filter((statement) =>
    statement.includes('CREATE FUNCTION "phase13_m6_1_application_guard"')
  );
  assert.equal(guards.length, 1, "exactly one application guard routine");
  const guard = guards[0] as string;
  for (const column of [
    "id",
    "projectId",
    "ownerUserId",
    "applicantUserId",
    "createdAt",
  ]) {
    assert.match(
      guard,
      new RegExp(`NEW\\."${column}" IS DISTINCT FROM OLD\\."${column}"`, "u"),
      column
    );
  }
  assert.match(guard, /OLD\."status" = 'archived'/u);
  assert.match(guard, /NEW\."revision" <> OLD\."revision" \+ 1/u);
  // The guard must not freeze the mutable screening context: legitimate edits
  // stay possible while the record is live.
  assert.equal(guard.includes('NEW."asOfDate" IS DISTINCT FROM'), false);
  const triggers = all.filter(
    (statement) =>
      firstLine(statement).startsWith("CREATE TRIGGER") &&
      statement.includes('"Student500Application_guard"')
  );
  assert.equal(triggers.length, 1);
  assert.match(
    triggers[0] as string,
    /BEFORE UPDATE ON "Student500Application"/u
  );
});

test("audit tables are append-only at the database level", async () => {
  const source = await readFile(migrationUrl, "utf8");
  for (const table of [
    "Student500ApplicationOperation",
    "Student500ApplicationEvent",
  ]) {
    assert.match(
      source,
      new RegExp(
        `CREATE TRIGGER "${table}_append_only" BEFORE UPDATE OR DELETE ON "${table}"`,
        "u"
      )
    );
  }
});
