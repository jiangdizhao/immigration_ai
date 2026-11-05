/**
 * Phase 13 M8.1-R2 - migration 0051 declaration-order contract.
 *
 * PostgreSQL resolves the referenced column set of a foreign key immediately, so a
 * composite foreign key may only be declared once a matching unique constraint or
 * unique index already exists. This test parses the real statement order out of the
 * migration and proves the dependency ordering, rather than merely looking for SQL
 * fragments.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const MIGRATION = resolve(
  process.cwd(),
  "lib/db/migrations/0051_phase13_m8_submission_packages.sql"
);
const JOURNAL = resolve(process.cwd(), "lib/db/migrations/meta/_journal.json");

const statements = readFileSync(MIGRATION, "utf8")
  .split("--> statement-breakpoint")
  .map((statement) => statement.replace(/--[^\n]*/gu, "").trim())
  .filter((statement) => statement.length > 0);

function columnsOf(list: string): string[] {
  return list
    .split(",")
    .map((entry) => entry.trim().replace(/^"|"$/gu, "").toLowerCase())
    .filter((entry) => entry.length > 0);
}

type UniqueKey = {
  readonly index: number;
  readonly table: string;
  readonly columns: readonly string[];
};

type ForeignKey = {
  readonly index: number;
  readonly name: string;
  readonly table: string;
  readonly referencedTable: string;
  readonly referencedColumns: readonly string[];
};

const uniqueKeys: UniqueKey[] = [];
const foreignKeys: ForeignKey[] = [];
const tables: string[] = [];
const inlineForeignKeys: string[] = [];

const CREATE_TABLE = /CREATE TABLE IF NOT EXISTS "([^"]+)"/u;
const UNIQUE_CONSTRAINT = /CONSTRAINT "([^"]+)" UNIQUE \(([^)]+)\)/gu;
const UNIQUE_INDEX =
  /CREATE UNIQUE INDEX IF NOT EXISTS "([^"]+)" ON "([^"]+)" USING btree \(([^)]+)\)/u;
const ALTER_TABLE = /ALTER TABLE "([^"]+)"/u;
const ADD_CONSTRAINT =
  /ADD CONSTRAINT "([^"]+)"\s+FOREIGN KEY \(([^)]+)\)\s+REFERENCES "([^"]+)"\s*\(([^)]+)\)/u;
const CREATE_TRIGGER = /CREATE TRIGGER "([^"]+)"/gu;

statements.forEach((statement, index) => {
  const table = CREATE_TABLE.exec(statement)?.[1];
  if (table) {
    tables.push(table);
    for (const unique of statement.matchAll(UNIQUE_CONSTRAINT)) {
      uniqueKeys.push({ columns: columnsOf(unique[2] ?? ""), index, table });
    }
    if (/FOREIGN KEY/iu.test(statement)) {
      inlineForeignKeys.push(table);
    }
  }

  const uniqueIndex = UNIQUE_INDEX.exec(statement);
  if (uniqueIndex?.[2] && uniqueIndex[3]) {
    uniqueKeys.push({
      columns: columnsOf(uniqueIndex[3]),
      index,
      table: uniqueIndex[2],
    });
  }

  const constraint = ADD_CONSTRAINT.exec(statement);
  if (constraint) {
    foreignKeys.push({
      index,
      name: constraint[1] ?? "",
      referencedColumns: columnsOf(constraint[4] ?? ""),
      referencedTable: constraint[3] ?? "",
      table: ALTER_TABLE.exec(statement)?.[1] ?? "unknown",
    });
  } else if (!table && /FOREIGN KEY/iu.test(statement)) {
    inlineForeignKeys.push(`statement ${index}`);
  }
});

test("the migration head advanced from 0051 to 0052 in order", () => {
  const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as {
    entries: { tag: string }[];
  };
  const tags = journal.entries.map((entry) => entry.tag);
  const head = tags.at(-1) ?? "";
  // M8.2 adds exactly one additive migration after the M8.1 head; the M8.1 order
  // contract above still applies to 0051 itself.
  assert.equal(head, "0052_phase13_m8_2_submission_authorization");
  assert.equal(tags.at(-2) ?? "", "0051_phase13_m8_submission_packages");
  assert.equal(new Set(tags).size, tags.length, "migration tags are unique");
});

test("0051 declares its four immutable history tables without inline FKs", () => {
  assert.deepEqual(tables.slice().sort(), [
    "SubmissionPackage",
    "SubmissionPackageConfirmation",
    "SubmissionPackageConfirmationFinalization",
    "SubmissionPackageInvalidation",
  ]);
  assert.deepEqual(
    inlineForeignKeys,
    [],
    "no foreign key may be declared inside CREATE TABLE"
  );
});

test("every composite foreign key follows its referenced unique key", () => {
  assert.ok(foreignKeys.length >= 3, "the composite identity keys exist");
  for (const fk of foreignKeys) {
    const match = uniqueKeys.find(
      (key) =>
        key.table === fk.referencedTable &&
        key.index < fk.index &&
        key.columns.length === fk.referencedColumns.length &&
        key.columns.every(
          (column, position) => column === fk.referencedColumns[position]
        )
    );
    assert.ok(
      match !== undefined,
      `FK ${fk.name} references (${fk.referencedColumns.join(", ")}) of ${fk.referencedTable} with no earlier matching unique key`
    );
  }
});

test("the exact-identity chain covers package, confirmation and finalization", () => {
  const byName = new Map(foreignKeys.map((fk) => [fk.name, fk]));
  const parent = byName.get("SubmissionPackageConfirmation_parent_identity_fk");
  assert.ok(parent, "the confirmation->package composite FK exists");
  assert.deepEqual(parent.referencedColumns, [
    "projectid",
    "targetkind",
    "targetid",
    "id",
    "version",
    "manifestsha256",
  ]);
  assert.ok(
    byName.get("SubmissionPackageInvalidation_confirmation_identity_fk"),
    "invalidation is bound to its confirmation identity"
  );
  assert.ok(
    byName.get("SubmissionPackageConfirmationFinalization_identity_fk"),
    "finalization is bound to its confirmation identity"
  );
});

test("immutable-history triggers cover every history table", () => {
  const guarded = statements
    .flatMap((statement) => [...statement.matchAll(CREATE_TRIGGER)])
    .map((match) => match[1])
    .sort();
  assert.deepEqual(guarded, [
    "SubmissionPackageConfirmationFinalization_guard",
    "SubmissionPackageConfirmation_guard",
    "SubmissionPackageInvalidation_guard",
    "SubmissionPackage_guard",
  ]);
});
