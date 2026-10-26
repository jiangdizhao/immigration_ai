import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationUrl = new URL(
  "./migrations/0034_phase13_m2_c_requirement_registry.sql",
  import.meta.url
);

test("migration 0034 creates composite unique indexes before their foreign keys", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const requiredOrders = [
    {
      index:
        'CREATE UNIQUE INDEX IF NOT EXISTS "RequirementTemplateVersion_id_template_unique" ON "RequirementTemplateVersion" USING btree ("id","templateId")',
      foreignKey:
        'ADD CONSTRAINT "ProjectRequirementState_template_version_fk"',
    },
    {
      index:
        'CREATE UNIQUE INDEX IF NOT EXISTS "ProjectRequirementState_project_id_unique" ON "ProjectRequirementState" USING btree ("projectId","id")',
      foreignKey: 'ADD CONSTRAINT "ProjectRequirementStateEvent_state_fk"',
    },
  ];
  const lastTable = migration.lastIndexOf("CREATE TABLE IF NOT EXISTS");
  const firstForeignKey = migration.indexOf("ADD CONSTRAINT");

  for (const { index, foreignKey } of requiredOrders) {
    const indexPosition = migration.indexOf(index);
    assert.equal(migration.split(index).length - 1, 1, `${index} occurs once`);
    assert.ok(
      indexPosition > lastTable,
      `${index} follows all four CREATE TABLE statements`
    );
    assert.ok(
      indexPosition < firstForeignKey &&
        indexPosition < migration.indexOf(foreignKey),
      `${index} must precede ${foreignKey}`
    );
  }
});
