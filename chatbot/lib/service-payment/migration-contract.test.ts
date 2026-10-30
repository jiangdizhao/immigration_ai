import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Migration-installation contract.
 *
 * PostgreSQL requires the columns referenced by a FOREIGN KEY to be covered by a
 * primary key, a non-deferrable UNIQUE constraint or a non-partial unique index that
 * **already exists** when the FK statement runs. Migration 0044 originally failed on
 * a real server for exactly this reason: drizzle emits
 * `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` before its `CREATE UNIQUE INDEX`
 * statements, and one composite target index was missing altogether.
 *
 * These tests parse the journal statement by statement, replay it in order and prove
 * coverability *at the exact statement position*. They are structural, not textual:
 * they never search for a particular index name, so renaming or regenerating the
 * migration cannot silently satisfy them.
 */

const here = dirname(fileURLToPath(import.meta.url));
const chatbotRoot = resolve(here, "../..");
const MIGRATIONS_DIRECTORY = "lib/db/migrations";
const M4_005_MIGRATION = "0044_phase13_m4_005_service_payment.sql";

type UniqueKey = {
  name: string;
  table: string;
  columns: string[];
  partial: boolean;
  file: string;
  position: number;
};

type ForeignKey = {
  name: string;
  file: string;
  position: number;
  sourceColumns: string[];
  targetColumns: string[];
  targetTable: string;
};

type UncoveredForeignKey = {
  foreignKey: ForeignKey;
  reason: "target_table_missing" | "no_matching_unique_key";
};

type MigrationAudit = {
  tables: Map<string, string>;
  uniqueKeys: UniqueKey[];
  foreignKeys: ForeignKey[];
  uncovered: UncoveredForeignKey[];
  firstIndexPositionByFile: Map<string, number>;
  firstForeignKeyPositionByFile: Map<string, number>;
  identifiers: Set<string>;
};

const IDENTIFIER = '"([A-Za-z0-9_]+)"';
const CREATE_TABLE = new RegExp(
  `CREATE TABLE IF NOT EXISTS ${IDENTIFIER} \\((.*)\\)`,
  "su"
);
const CREATE_UNIQUE_INDEX = new RegExp(
  `CREATE UNIQUE INDEX IF NOT EXISTS ${IDENTIFIER} ON ${IDENTIFIER} USING btree \\(([^)]*)\\)([^;]*);`,
  "gu"
);
const CREATE_INDEX = new RegExp(
  `CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${IDENTIFIER}`,
  "gu"
);
const ADD_UNIQUE_KEY = new RegExp(
  `ADD CONSTRAINT ${IDENTIFIER} (?:UNIQUE|PRIMARY KEY) \\(([^)]*)\\)`,
  "gu"
);
const ADD_FOREIGN_KEY = new RegExp(
  `ADD CONSTRAINT ${IDENTIFIER} FOREIGN KEY \\(([^)]*)\\) REFERENCES "public"\\.${IDENTIFIER}\\(([^)]*)\\)`,
  "gu"
);

function columnList(raw: string): string[] {
  return raw
    .split(",")
    .map((column) => column.trim().replaceAll('"', ""))
    .filter((column) => column.length > 0);
}

function sameColumnSet(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    [...left].sort().join(",") === [...right].sort().join(",")
  );
}

function withoutComments(chunk: string) {
  return chunk
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/** Parse migration bodies, replaying statements in journal order. */
function auditMigrations(migrationSql: Array<{ file: string; sql: string }>) {
  const tables = new Map<string, string>();
  const uniqueKeys: UniqueKey[] = [];
  const foreignKeys: ForeignKey[] = [];
  const uncovered: UncoveredForeignKey[] = [];
  const firstIndexPositionByFile = new Map<string, number>();
  const firstForeignKeyPositionByFile = new Map<string, number>();
  const identifiers = new Set<string>();
  let position = 0;

  for (const { file, sql } of migrationSql) {
    for (const rawChunk of sql.split("--> statement-breakpoint")) {
      position += 1;
      const chunk = withoutComments(rawChunk);
      if (chunk.trim().length === 0) {
        continue;
      }

      for (const match of chunk.matchAll(CREATE_INDEX)) {
        identifiers.add(match[1] as string);
        if (!firstIndexPositionByFile.has(file)) {
          firstIndexPositionByFile.set(file, position);
        }
      }

      const table = CREATE_TABLE.exec(chunk);
      if (table) {
        const tableName = table[1] as string;
        const body = table[2] as string;
        tables.set(tableName, file);
        identifiers.add(tableName);
        // Composite primary keys are declared inline (`CONSTRAINT "x_pk" PRIMARY
        // KEY("a","b")`), single-column ones as a column suffix. Both forms must be
        // registered, otherwise the audit reports false positives on older tables.
        const compositePrimaryKey =
          /(?:CONSTRAINT "[^"]+"\s+)?PRIMARY KEY\s*\(([^)]*)\)/iu.exec(body);
        if (compositePrimaryKey) {
          uniqueKeys.push({
            columns: columnList(compositePrimaryKey[1] as string),
            file,
            name: `${tableName}_pkey`,
            partial: false,
            position,
            table: tableName,
          });
        } else if (/\bPRIMARY KEY\b/u.test(body)) {
          // Column-level primary key: the column name is not always `id`
          // (e.g. `"chatId" uuid PRIMARY KEY NOT NULL`).
          const columnPrimaryKey =
            /"([A-Za-z0-9_]+)"[^\n]*\bPRIMARY KEY\b/u.exec(body);
          if (columnPrimaryKey) {
            uniqueKeys.push({
              columns: [columnPrimaryKey[1] as string],
              file,
              name: `${tableName}_pkey`,
              partial: false,
              position,
              table: tableName,
            });
          }
        }
        for (const match of body.matchAll(
          /(?:CONSTRAINT "[^"]+"\s+)?UNIQUE\s*\(([^)]*)\)/giu
        )) {
          uniqueKeys.push({
            columns: columnList(match[1] as string),
            file,
            name: `${tableName}_unique`,
            partial: false,
            position,
            table: tableName,
          });
        }
      }

      for (const match of chunk.matchAll(CREATE_UNIQUE_INDEX)) {
        const name = match[1] as string;
        identifiers.add(name);
        uniqueKeys.push({
          columns: columnList(match[3] as string),
          file,
          name,
          partial: /\bWHERE\b/iu.test(match[4] as string),
          position,
          table: match[2] as string,
        });
      }

      for (const match of chunk.matchAll(ADD_UNIQUE_KEY)) {
        identifiers.add(match[1] as string);
        uniqueKeys.push({
          columns: columnList(match[2] as string),
          file,
          name: match[1] as string,
          partial: false,
          position,
          table: "",
        });
      }

      for (const match of chunk.matchAll(ADD_FOREIGN_KEY)) {
        const name = match[1] as string;
        identifiers.add(name);
        if (!firstForeignKeyPositionByFile.has(file)) {
          firstForeignKeyPositionByFile.set(file, position);
        }
        const targetTable = match[3] as string;
        const targetColumns = columnList(match[4] as string);
        const foreignKey: ForeignKey = {
          file,
          name,
          position,
          sourceColumns: columnList(match[2] as string),
          targetColumns,
          targetTable,
        };
        foreignKeys.push(foreignKey);

        if (!tables.has(targetTable)) {
          uncovered.push({ foreignKey, reason: "target_table_missing" });
          continue;
        }
        const covered = uniqueKeys.some(
          (key) =>
            key.position < position &&
            !key.partial &&
            key.table === targetTable &&
            sameColumnSet(key.columns, targetColumns)
        );
        if (!covered) {
          uncovered.push({ foreignKey, reason: "no_matching_unique_key" });
        }
      }
    }
  }

  const audit: MigrationAudit = {
    firstForeignKeyPositionByFile,
    firstIndexPositionByFile,
    foreignKeys,
    identifiers,
    tables,
    uncovered,
    uniqueKeys,
  };
  return audit;
}

function journalSql() {
  const directory = resolve(chatbotRoot, MIGRATIONS_DIRECTORY);
  return readdirSync(directory)
    .filter((file) => /^\d{4}.*\.sql$/u.test(file))
    .sort()
    .map((file) => ({
      file,
      sql: readFileSync(resolve(directory, file), "utf8"),
    }));
}

const migrated = journalSql();
const audit = auditMigrations(migrated);
const m4_005Keys = audit.uniqueKeys.filter(
  (key) => key.file === M4_005_MIGRATION && !key.name.endsWith("_pkey")
);
const m4_005ForeignKeys = audit.foreignKeys.filter(
  (key) => key.file === M4_005_MIGRATION
);

test("the journal is parsed completely (guards against a vacuous audit)", () => {
  assert.equal(migrated.length, 45);
  assert.equal(migrated.at(-1)?.file, M4_005_MIGRATION);
  assert.ok(audit.tables.size > 50, "the whole schema must be parsed");
  assert.equal(m4_005ForeignKeys.length, 15);
  // 16 unique keys + 6 plain indexes = the 22 indexes the availability probe pins.
  assert.equal(m4_005Keys.length, 16);
  const totalIndexes = migrated
    .filter((entry) => entry.file === M4_005_MIGRATION)
    .reduce(
      (count, entry) => count + [...entry.sql.matchAll(CREATE_INDEX)].length,
      0
    );
  assert.equal(totalIndexes, 22);
});

test("every foreign key in the journal is covered at its statement position", () => {
  const report = audit.uncovered
    .map(
      (entry) =>
        `${entry.reason}: ${entry.foreignKey.name} -> ${entry.foreignKey.targetTable}(${entry.foreignKey.targetColumns.join(",")})`
    )
    .join("\n");
  assert.equal(audit.uncovered.length, 0, report);
  assert.ok(
    audit.foreignKeys.length > 150,
    "the audit must cover the accumulated journal, not only 0044"
  );
});

test("Migration 0044 installs every index before it adds any foreign key", () => {
  const firstIndex = audit.firstIndexPositionByFile.get(M4_005_MIGRATION);
  const firstForeignKey =
    audit.firstForeignKeyPositionByFile.get(M4_005_MIGRATION);
  assert.ok(firstIndex, "0044 must create indexes");
  assert.ok(firstForeignKey, "0044 must add foreign keys");
  assert.ok(
    firstIndex < firstForeignKey,
    "required order: tables -> indexes -> foreign keys -> integrity logic"
  );
});

test("the three previously failing composite foreign keys are now covered", () => {
  const expectations = [
    {
      name: "ServicePaymentEvidence_condition_scope_fk",
      targetColumns: [
        "id",
        "projectId",
        "engagementId",
        "agreementVersionId",
        "agreementTermsSha256",
        "amountMinor",
        "currency",
      ],
      targetTable: "ServicePaymentCondition",
    },
    {
      name: "ServicePaymentResolution_condition_fk",
      targetColumns: ["id", "projectId", "engagementId"],
      targetTable: "ServicePaymentCondition",
    },
    {
      name: "ServicePaymentResolution_evidence_fk",
      targetColumns: ["id", "conditionId"],
      targetTable: "ServicePaymentEvidence",
    },
  ];
  for (const expectation of expectations) {
    const foreignKey = m4_005ForeignKeys.find(
      (candidate) => candidate.name === expectation.name
    );
    assert.ok(foreignKey, `${expectation.name} must exist`);
    assert.equal(foreignKey.targetTable, expectation.targetTable);
    assert.deepEqual(
      [...foreignKey.targetColumns].sort(),
      [...expectation.targetColumns].sort()
    );
    const covering = audit.uniqueKeys.filter(
      (key) =>
        key.table === expectation.targetTable &&
        !key.partial &&
        key.position < foreignKey.position &&
        sameColumnSet(key.columns, expectation.targetColumns)
    );
    assert.ok(
      covering.length > 0,
      `${expectation.name} needs an earlier non-partial unique key on ${expectation.targetColumns.join(",")}`
    );
  }
});

test("the composite identity target exists, is non-partial and precedes its FK", () => {
  const target = m4_005Keys.find(
    (key) =>
      key.table === "ServicePaymentCondition" &&
      sameColumnSet(key.columns, ["id", "projectId", "engagementId"])
  );
  assert.ok(target, "the (id, projectId, engagementId) unique key is required");
  assert.equal(target.partial, false);
  assert.equal(
    target.name,
    "ServicePaymentCondition_id_project_engagement_unique"
  );
  const resolutionConditionFk = m4_005ForeignKeys.find(
    (key) => key.name === "ServicePaymentResolution_condition_fk"
  );
  assert.ok(resolutionConditionFk);
  assert.ok(target.position < resolutionConditionFk.position);
  // PostgreSQL cannot use a deferrable unique constraint as an FK target.
  assert.equal(
    /ADD CONSTRAINT "[^"]+" UNIQUE \([^)]*\)[^;]*DEFERRABLE/u.test(
      migrated.map((entry) => entry.sql).join("\n")
    ),
    false
  );
});

test("a partial unique index is never the sole support for a foreign key", () => {
  const partialKeys = m4_005Keys.filter((key) => key.partial);
  assert.ok(
    partialKeys.length >= 2,
    "live-condition and verified-evidence keys"
  );
  for (const partial of partialKeys) {
    const fullMatch = m4_005Keys.some(
      (key) =>
        key.table === partial.table &&
        !key.partial &&
        sameColumnSet(key.columns, partial.columns)
    );
    assert.equal(
      fullMatch,
      false,
      `${partial.name} must remain partial-only to preserve its semantics`
    );
    const referenced = m4_005ForeignKeys.some(
      (foreignKey) =>
        foreignKey.targetTable === partial.table &&
        sameColumnSet(foreignKey.targetColumns, partial.columns)
    );
    assert.equal(
      referenced,
      false,
      `${partial.name} is partial and cannot back a foreign key`
    );
  }
});

test("M4-005 identifiers do not collide after PostgreSQL's 63-byte truncation", () => {
  const scoped = [...audit.identifiers].filter((name) =>
    /^(ServicePayment|phase13_m4_005|ProjectOperation_|ProjectEvent_)/u.test(
      name
    )
  );
  assert.ok(scoped.length > 50);
  const buckets = new Map<string, string[]>();
  for (const name of scoped) {
    // PostgreSQL truncates identifiers to 63 bytes, so `IF NOT EXISTS` and
    // duplicate-object handling would silently target the wrong object on a clash.
    const truncated = Buffer.from(name, "utf8")
      .subarray(0, 63)
      .toString("utf8");
    buckets.set(truncated, [...(buckets.get(truncated) ?? []), name]);
  }
  assert.deepEqual(
    [...buckets.entries()].filter(([, names]) => names.length > 1),
    []
  );
});

test("the audit catches FK-before-index, missing-target and partial-only regressions", () => {
  const brokenOrdering = auditMigrations([
    {
      file: "9000_broken_order.sql",
      sql: [
        'CREATE TABLE IF NOT EXISTS "Parent" (\n\t"id" uuid PRIMARY KEY NOT NULL,\n\t"scope" text\n);',
        'DO $$ BEGIN\n ALTER TABLE "Child" ADD CONSTRAINT "Child_parent_fk" FOREIGN KEY ("parentId","scope") REFERENCES "public"."Parent"("id","scope") ON DELETE restrict ON UPDATE no action;\nEXCEPTION\n WHEN duplicate_object THEN null;\nEND $$;',
        'CREATE TABLE IF NOT EXISTS "Child" (\n\t"id" uuid PRIMARY KEY NOT NULL,\n\t"parentId" uuid NOT NULL\n);',
        'CREATE UNIQUE INDEX IF NOT EXISTS "Parent_id_scope_unique" ON "Parent" USING btree ("id","scope");',
      ].join("\n--> statement-breakpoint\n"),
    },
  ]);
  assert.equal(brokenOrdering.uncovered.length, 1);
  assert.equal(brokenOrdering.uncovered[0]?.reason, "no_matching_unique_key");
  assert.equal(brokenOrdering.uncovered[0]?.foreignKey.name, "Child_parent_fk");

  const missingTarget = auditMigrations([
    {
      file: "9001_missing_target.sql",
      sql: [
        'CREATE TABLE IF NOT EXISTS "Child" (\n\t"id" uuid PRIMARY KEY NOT NULL,\n\t"parentId" uuid NOT NULL\n);',
        'DO $$ BEGIN\n ALTER TABLE "Child" ADD CONSTRAINT "Child_missing_fk" FOREIGN KEY ("parentId") REFERENCES "public"."Absent"("id") ON DELETE restrict ON UPDATE no action;\nEXCEPTION\n WHEN duplicate_object THEN null;\nEND $$;',
      ].join("\n--> statement-breakpoint\n"),
    },
  ]);
  assert.equal(missingTarget.uncovered.length, 1);
  assert.equal(missingTarget.uncovered[0]?.reason, "target_table_missing");

  const partialOnly = auditMigrations([
    {
      file: "9002_partial_only.sql",
      sql: [
        'CREATE TABLE IF NOT EXISTS "Parent" (\n\t"id" uuid PRIMARY KEY NOT NULL,\n\t"scope" text,\n\t"live" boolean\n);',
        'CREATE UNIQUE INDEX IF NOT EXISTS "Parent_id_scope_partial" ON "Parent" USING btree ("id","scope") WHERE "Parent"."live" is true;',
        'CREATE TABLE IF NOT EXISTS "Child" (\n\t"id" uuid PRIMARY KEY NOT NULL,\n\t"parentId" uuid NOT NULL\n);',
        'DO $$ BEGIN\n ALTER TABLE "Child" ADD CONSTRAINT "Child_parent_fk" FOREIGN KEY ("parentId","scope") REFERENCES "public"."Parent"("id","scope") ON DELETE restrict ON UPDATE no action;\nEXCEPTION\n WHEN duplicate_object THEN null;\nEND $$;',
      ].join("\n--> statement-breakpoint\n"),
    },
  ]);
  assert.equal(partialOnly.uncovered.length, 1);
  assert.equal(partialOnly.uncovered[0]?.reason, "no_matching_unique_key");

  const ordered = auditMigrations([
    {
      file: "9003_ordered.sql",
      sql: [
        'CREATE TABLE IF NOT EXISTS "Parent" (\n\t"id" uuid PRIMARY KEY NOT NULL,\n\t"scope" text\n);',
        'CREATE UNIQUE INDEX IF NOT EXISTS "Parent_id_scope_unique" ON "Parent" USING btree ("id","scope");',
        'CREATE TABLE IF NOT EXISTS "Child" (\n\t"id" uuid PRIMARY KEY NOT NULL,\n\t"parentId" uuid NOT NULL\n);',
        'DO $$ BEGIN\n ALTER TABLE "Child" ADD CONSTRAINT "Child_parent_fk" FOREIGN KEY ("parentId","scope") REFERENCES "public"."Parent"("id","scope") ON DELETE restrict ON UPDATE no action;\nEXCEPTION\n WHEN duplicate_object THEN null;\nEND $$;',
      ].join("\n--> statement-breakpoint\n"),
    },
  ]);
  assert.deepEqual(ordered.uncovered, []);
  assert.equal(ordered.foreignKeys.length, 1);
});

/**
 * PostgreSQL FK grammar: referential actions must precede the deferrability clause
 * (`REFERENCES … ON DELETE … ON UPDATE … [MATCH …] [DEFERRABLE [INITIALLY …]]`).
 * Migration 0044 previously placed `DEFERRABLE INITIALLY DEFERRED` before
 * `ON DELETE`/`ON UPDATE`, which the server rejected with SQLSTATE 42601 at the
 * file's final statement. This checker is intentionally narrow: it only inspects
 * `FOREIGN KEY … REFERENCES …` definitions.
 */
function referentialClauseOrderViolations(sql: string): string[] {
  const violations: string[] = [];
  for (const rawChunk of sql.split("--> statement-breakpoint")) {
    const chunk = withoutComments(rawChunk);
    for (const match of chunk.matchAll(
      /FOREIGN KEY \([^)]*\) REFERENCES [^;]*;/gu
    )) {
      const statement = match[0].toUpperCase();
      const deferrable = statement.indexOf("DEFERRABLE");
      if (deferrable === -1) {
        continue;
      }
      for (const clause of ["MATCH", "ON DELETE", "ON UPDATE"]) {
        const at = statement.indexOf(clause);
        if (at > deferrable) {
          violations.push(`${clause} appears after DEFERRABLE`);
        }
      }
      const initially = statement.indexOf("INITIALLY");
      if (initially !== -1 && initially < deferrable) {
        violations.push("INITIALLY appears before DEFERRABLE");
      }
    }
  }
  return violations;
}

test("no migration places a deferrability clause before a referential action", () => {
  const journal = migrated.map((entry) => entry.sql).join("\n");
  assert.deepEqual(referentialClauseOrderViolations(journal), []);
  // The single deferred FK must end with its deferrability clause, after the
  // referential actions, exactly as PostgreSQL requires.
  assert.match(
    migrated.find((entry) => entry.file === M4_005_MIGRATION)?.sql ?? "",
    /ADD CONSTRAINT "ServicePaymentCondition_superseded_by_fk" FOREIGN KEY \("supersededByConditionId","projectId"\) REFERENCES "public"\."ServicePaymentCondition"\("id","projectId"\) ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;/u
  );
  // Every other M4-005 FK is a plain non-deferrable reference.
  const deferrable = m4_005ForeignKeys.filter((key) =>
    /DEFERRABLE/u.test(key.name)
  );
  assert.equal(deferrable.length, 0, "FK names never carry grammar keywords");
});

test("the clause-order checker catches the defect it was written for", () => {
  const broken =
    'DO $$ BEGIN\n ALTER TABLE "C" ADD CONSTRAINT "C_fk" FOREIGN KEY ("a","b") REFERENCES "public"."P"("id","b") DEFERRABLE INITIALLY DEFERRED ON DELETE restrict ON UPDATE no action;\nEXCEPTION\n WHEN duplicate_object THEN null;\nEND $$;';
  const brokenViolations = referentialClauseOrderViolations(broken);
  assert.ok(
    brokenViolations.length >= 2,
    "both referential actions are misordered"
  );
  assert.ok(
    brokenViolations.every((violation) => violation.includes("DEFERRABLE"))
  );

  const repaired =
    'DO $$ BEGIN\n ALTER TABLE "C" ADD CONSTRAINT "C_fk" FOREIGN KEY ("a","b") REFERENCES "public"."P"("id","b") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;\nEXCEPTION\n WHEN duplicate_object THEN null;\nEND $$;';
  assert.deepEqual(referentialClauseOrderViolations(repaired), []);

  const misplacedInitially =
    'ALTER TABLE "C" ADD CONSTRAINT "C_fk" FOREIGN KEY ("a") REFERENCES "public"."P"("id") INITIALLY DEFERRED DEFERRABLE;';
  assert.deepEqual(referentialClauseOrderViolations(misplacedInitially), [
    "INITIALLY appears before DEFERRABLE",
  ]);
});
