import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationUrl = new URL(
  "./migrations/0035_phase13_m2_a2_b_facts.sql",
  import.meta.url
);

test("migration 0035 creates every composite FK target before its foreign key", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const required = [
    {
      index:
        'CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocumentEvidenceUnit_project_run_id_unique"',
      fk: 'ADD CONSTRAINT "ProjectEvidenceRef_unit_fk"',
    },
    {
      index:
        'CREATE UNIQUE INDEX IF NOT EXISTS "ProjectEvidenceRef_project_id_unique"',
      fk: 'ADD CONSTRAINT "ProjectFactAssertionEvidence_evidence_fk"',
    },
    {
      index:
        'CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFactAssertion_project_id_version_unique"',
      fk: 'ADD CONSTRAINT "ProjectFactUseGrant_assertion_fk"',
    },
    {
      index:
        'CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocRun_project_version_generation_id_unique"',
      fk: 'ADD CONSTRAINT "ProjectDocumentEvidenceUnit_run_fk"',
    },
  ];
  const firstForeignKey = migration.indexOf("ADD CONSTRAINT");
  for (const item of required) {
    const index = migration.indexOf(item.index);
    assert.notEqual(index, -1, `${item.index} exists`);
    assert.ok(
      index < firstForeignKey,
      `${item.index} precedes all foreign keys`
    );
    assert.ok(
      index < migration.indexOf(item.fk),
      `${item.index} precedes ${item.fk}`
    );
  }
  assert.equal(
    migration.split(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFactAssertion_project_id_version_unique"'
    ).length - 1,
    1
  );
});
