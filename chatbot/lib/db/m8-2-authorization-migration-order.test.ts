/**
 * Phase 13 M8.2 - migration 0052 contract.
 *
 * PostgreSQL resolves a composite foreign key's referenced column set immediately, so
 * the referenced unique index must already exist in 0051 or 0052. Identifiers are also
 * limited to 63 bytes, which previously caused a real failure in this project, so the
 * limit is asserted here rather than rediscovered during a deployment.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const MIGRATIONS = [
  "lib/db/migrations/0051_phase13_m8_submission_packages.sql",
  "lib/db/migrations/0052_phase13_m8_2_submission_authorization.sql",
].map((path) => resolve(process.cwd(), path));
const JOURNAL = resolve(process.cwd(), "lib/db/migrations/meta/_journal.json");

type Statement = {
  readonly file: number;
  readonly position: number;
  readonly sql: string;
};

const statements: Statement[] = MIGRATIONS.flatMap((file, fileIndex) =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((sql) => sql.replace(/--[^\n]*/gu, "").trim())
    .filter((sql) => sql.length > 0)
    .map((sql, index) => ({
      file: fileIndex,
      position: fileIndex * 1000 + index,
      sql,
    }))
);

/** Only 0052 statements are this migration's own content. */
const own = statements.filter((statement) => statement.file === 1);

function columnsOf(list: string): string[] {
  return list
    .split(",")
    .map((entry) => entry.trim().replace(/^"|"$/gu, "").toLowerCase())
    .filter((entry) => entry.length > 0);
}

const CREATE_TABLE = /CREATE TABLE IF NOT EXISTS "([^"]+)"/u;
const UNIQUE_CONSTRAINT = /CONSTRAINT "([^"]+)" UNIQUE \(([^)]+)\)/gu;
const UNIQUE_INDEX =
  /CREATE UNIQUE INDEX IF NOT EXISTS "([^"]+)" ON "([^"]+)" USING btree \(([^)]+)\)/u;
const ADD_CONSTRAINT =
  /ADD CONSTRAINT "([^"]+)"\s+FOREIGN KEY \(([^)]+)\)\s+REFERENCES "([^"]+)"\s*\(([^)]+)\)/u;

const uniqueKeys: {
  readonly position: number;
  readonly table: string;
  readonly columns: readonly string[];
}[] = [];
const foreignKeys: {
  readonly position: number;
  readonly name: string;
  readonly referencedTable: string;
  readonly referencedColumns: readonly string[];
}[] = [];
const inlineForeignKeys: string[] = [];

for (const statement of statements) {
  const table = CREATE_TABLE.exec(statement.sql)?.[1];
  if (table) {
    for (const unique of statement.sql.matchAll(UNIQUE_CONSTRAINT)) {
      uniqueKeys.push({
        columns: columnsOf(unique[2] ?? ""),
        position: statement.position,
        table,
      });
    }
    if (/FOREIGN KEY/iu.test(statement.sql)) {
      inlineForeignKeys.push(table);
    }
  }
  const uniqueIndex = UNIQUE_INDEX.exec(statement.sql);
  if (uniqueIndex?.[2] && uniqueIndex[3]) {
    uniqueKeys.push({
      columns: columnsOf(uniqueIndex[3]),
      position: statement.position,
      table: uniqueIndex[2],
    });
  }
  const constraint = ADD_CONSTRAINT.exec(statement.sql);
  if (constraint) {
    foreignKeys.push({
      name: constraint[1] ?? "",
      position: statement.position,
      referencedColumns: columnsOf(constraint[4] ?? ""),
      referencedTable: constraint[3] ?? "",
    });
  }
}

test("0052 adds four tables after 0051 without inline foreign keys", () => {
  assert.deepEqual(
    own
      .map((statement) => CREATE_TABLE.exec(statement.sql)?.[1])
      .filter((name): name is string => name !== undefined)
      .sort(),
    [
      "SubmissionAuthorization",
      "SubmissionExternalRecord",
      "SubmissionHandoff",
      "SubmissionHandoffEvent",
    ]
  );
  assert.deepEqual(
    inlineForeignKeys,
    [],
    "no foreign key may be created inside CREATE TABLE"
  );
});

test("every M8.2 composite foreign key follows a matching unique key", () => {
  const firstOwnPosition = own[0]?.position ?? Number.POSITIVE_INFINITY;
  const m8_2 = foreignKeys.filter((fk) => fk.position >= firstOwnPosition);
  assert.ok(m8_2.length >= 6, "the identity chain exists");
  for (const fk of m8_2) {
    const match = uniqueKeys.find(
      (key) =>
        key.table === fk.referencedTable &&
        key.position < fk.position &&
        key.columns.length === fk.referencedColumns.length &&
        key.columns.every(
          (column, index) => column === fk.referencedColumns[index]
        )
    );
    assert.ok(
      match !== undefined,
      `FK ${fk.name} references (${fk.referencedColumns.join(", ")}) of ${fk.referencedTable} with no earlier matching unique key`
    );
  }
});

test("the exact-package identity reaches authorization, handoff and evidence", () => {
  const byName = new Map(foreignKeys.map((fk) => [fk.name, fk]));
  for (const name of [
    "SubmissionAuthorization_package_identity_fk",
    "SubmissionHandoff_package_identity_fk",
  ]) {
    const fk = byName.get(name);
    assert.ok(fk, `${name} exists`);
    assert.deepEqual(fk?.referencedColumns, [
      "projectid",
      "targetkind",
      "targetid",
      "id",
      "version",
      "manifestsha256",
    ]);
  }
  const handoffAuthorization = byName.get("SubmissionHandoff_authorization_fk");
  assert.ok(
    handoffAuthorization,
    "a handoff cannot exist without its authorization"
  );
  assert.deepEqual(handoffAuthorization?.referencedColumns, [
    "projectid",
    "id",
  ]);
  assert.ok(byName.get("SubmissionExternalRecord_handoff_fk"));
  assert.ok(byName.get("SubmissionExternalRecord_package_identity_fk"));
});

test("history is immutable and the handoff row can only follow the frozen edges", () => {
  const sql = own.map((statement) => statement.sql).join("\n");
  const triggers = [...sql.matchAll(/CREATE TRIGGER "([^"]+)"/gu)].map(
    (match) => match[1]
  );
  assert.deepEqual(triggers.sort(), [
    "SubmissionAuthorization_guard",
    "SubmissionExternalRecord_guard",
    "SubmissionHandoffEvent_guard",
    "SubmissionHandoff_guard",
  ]);
  // The handoff guard refuses identity rewrites, illegal edges and skipped revisions.
  assert.match(sql, /Handoff identity is immutable/u);
  assert.match(sql, /Illegal handoff transition/u);
  assert.match(sql, /Handoff revision must increment by one/u);
  // One live handoff per package version, enforced by the database itself.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionHandoff_live_package_unique"[\s\S]*?WHERE "status" IN \('requested','accepted'\)/u
  );
  // A verified external record must name the verifier that produced it.
  assert.match(
    sql,
    /"verification" = 'verified' AND "verifierCode" IS NOT NULL/u
  );
});

test("no M8.2 identifier exceeds the 63-byte PostgreSQL limit", () => {
  const sql = own.map((statement) => statement.sql).join("\n");
  const identifiers = new Set<string>();
  for (const match of sql.matchAll(/"([A-Za-z0-9_]+)"/gu)) {
    if (match[1]) {
      identifiers.add(match[1]);
    }
  }
  const tooLong = [...identifiers].filter(
    (identifier) => Buffer.byteLength(identifier, "utf8") > 63
  );
  assert.deepEqual(tooLong, []);
});

test("0052 is the current migration head and follows 0051", () => {
  const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  const tags = journal.entries.map((entry) => entry.tag);
  assert.equal(tags.at(-1), "0052_phase13_m8_2_submission_authorization");
  assert.equal(tags.at(-2), "0051_phase13_m8_submission_packages");
  const indexes = journal.entries.map((entry) => entry.idx);
  assert.deepEqual(
    indexes,
    indexes.map((_, position) => position),
    "journal indexes are contiguous"
  );
});
