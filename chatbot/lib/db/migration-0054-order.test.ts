import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * Phase 14 Project naming — deterministic Migration 0054 contract.
 *
 * The migration must stay purely additive: one nullable column, one defensive
 * name CHECK, and the enum CHECK rebuilds PostgreSQL requires for the new
 * `project_rename` operation and `project_renamed` event. Historical migrations,
 * data and indexes must never be touched. The enum value sets are compared with the
 * committed schema arrays so a future schema edit cannot silently diverge.
 */

const BREAKPOINT = "--> statement-breakpoint";

function statements(source: string): string[] {
  return source
    .split(BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter((statement) => statement.length > 0);
}

function schemaArray(source: string, name: string): string[] {
  const start = source.indexOf(`export const ${name} = [`);
  assert.ok(start >= 0, `${name} must exist in the schema`);
  const end = source.indexOf("] as const;", start);
  assert.ok(end > start);
  return [...source.slice(start, end).matchAll(/"([a-z0-9_]+)"/gu)].map(
    (match) => match[1] as string
  );
}

function quotedValues(statement: string): string[] {
  return [...statement.matchAll(/'([a-z0-9_]+)'/gu)].map(
    (match) => match[1] as string
  );
}

test("migration 0054 is additive and never rewrites history", async () => {
  const source = await readFile(
    new URL(
      "./migrations/0054_phase14_project_display_name.sql",
      import.meta.url
    ),
    "utf8"
  );
  const body = statements(source);
  assert.equal(body.length, 8);
  for (const statement of body) {
    assert.match(
      statement,
      /^ALTER TABLE "(StudyJourneyProject|ProjectOperation|ProjectEvent)"/u
    );
    assert.doesNotMatch(statement, /^\s*(DROP|TRUNCATE|DELETE)\b/iu);
    assert.doesNotMatch(statement, /\bDROP\s+(TABLE|INDEX|COLUMN)\b/iu);
    assert.doesNotMatch(statement, /ALTER\s+COLUMN[^;]*\bTYPE\b/iu);
  }

  const column = body.find((statement) =>
    statement.includes('ADD COLUMN "displayName"')
  );
  assert.ok(column);
  assert.match(column, /varchar\(100\)/u);
  // Nullable with no default: existing Projects keep NULL and the legacy label.
  assert.doesNotMatch(column, /NOT NULL|DEFAULT/iu);

  const drops = body.filter((statement) =>
    statement.includes("DROP CONSTRAINT")
  );
  assert.deepEqual(
    drops.map(
      (statement) => statement.match(/DROP CONSTRAINT "([A-Za-z_]+)"/u)?.[1]
    ),
    [
      "ProjectOperation_type_check",
      "ProjectOperation_actor_type_check",
      "ProjectEvent_type_check",
    ],
    "only the three enum CHECK constraints may be rebuilt"
  );

  const displayNameCheck = body.find((statement) =>
    statement.includes('"StudyJourneyProject_display_name_check"')
  );
  assert.ok(displayNameCheck);
  assert.match(
    displayNameCheck,
    /char_length\("displayName"\) between 1 and 100/u
  );
  assert.match(displayNameCheck, /btrim\("displayName"\)/u);
  assert.match(displayNameCheck, /!~ '\[\[:cntrl:\]\]'/u);
});

test("the enum CHECK value sets match the committed schema exactly", async () => {
  const schema = await readFile(
    new URL("./schema.ts", import.meta.url),
    "utf8"
  );
  const operations = schemaArray(schema, "PROJECT_OPERATION_TYPES");
  const events = schemaArray(schema, "PROJECT_EVENT_TYPES");
  assert.ok(operations.includes("project_rename"));
  assert.ok(events.includes("project_renamed"));

  const body = statements(
    await readFile(
      new URL(
        "./migrations/0054_phase14_project_display_name.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  const operationCheck = body.find(
    (statement) =>
      statement.includes('ADD CONSTRAINT "ProjectOperation_type_check"') &&
      !statement.includes("actor")
  );
  assert.ok(operationCheck);
  assert.deepEqual(quotedValues(operationCheck), operations);

  const actorCheck = body.find((statement) =>
    statement.includes('ADD CONSTRAINT "ProjectOperation_actor_type_check"')
  );
  assert.ok(actorCheck);
  // R1-01: the user branch authorizes ordinary user operations only. The document
  // worker operations are SERVICE-only and must remain absent from it.
  const serviceOnlyOperations = [
    "project_document_storage_finalize",
    "project_document_storage_fail",
    "project_document_scan_finalize",
  ] as const;
  const userOperations = operations.filter(
    (value) => !(serviceOnlyOperations as readonly string[]).includes(value)
  );
  const actorValues = quotedValues(actorCheck);
  assert.deepEqual(actorValues, [
    ...userOperations,
    "user",
    "project_document_storage_finalize",
    "project_document_storage_fail",
    "service",
    "project_document_storage_worker",
    "project_document_scan_finalize",
    "service",
    "project_document_scan_worker",
  ]);
  const userBranch = actorValues.slice(0, actorValues.indexOf("user"));
  assert.ok(userBranch.includes("project_rename"));
  for (const serviceOnly of serviceOnlyOperations) {
    assert.equal(
      userBranch.includes(serviceOnly),
      false,
      `${serviceOnly} must never be authorized for actorKind='user'`
    );
    // It stays permitted, but only inside a service-principal branch: the branch's
    // `service` kind and its matching principal appear with the operation type.
    const serviceOffset = actorValues.indexOf(serviceOnly);
    assert.ok(serviceOffset > actorValues.indexOf("user"));
    const expectedPrincipal =
      serviceOnly === "project_document_scan_finalize"
        ? "project_document_scan_worker"
        : "project_document_storage_worker";
    const serviceTail = actorValues.slice(serviceOffset);
    assert.ok(
      serviceTail.includes("service"),
      `${serviceOnly} must sit inside a service-principal branch`
    );
    assert.ok(
      serviceTail.includes(expectedPrincipal),
      `${serviceOnly} must stay bound to ${expectedPrincipal}`
    );
    // The operation TYPE check still lists every type, including worker operations.
    assert.ok(operationCheck.includes(`'${serviceOnly}'`));
  }

  const eventCheck = body.find((statement) =>
    statement.includes('ADD CONSTRAINT "ProjectEvent_type_check"')
  );
  assert.ok(eventCheck);
  assert.deepEqual(quotedValues(eventCheck), events);
});

test("the journal and snapshot chain follow the committed convention", async () => {
  const journal = JSON.parse(
    await readFile(
      new URL("./migrations/meta/_journal.json", import.meta.url),
      "utf8"
    )
  ) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.length, 55);
  journal.entries.forEach((entry, index) => assert.equal(entry.idx, index));
  assert.equal(
    journal.entries.at(-2)?.tag,
    "0053_phase13_m9_a_project_conversation_stage"
  );
  assert.equal(
    journal.entries.at(-1)?.tag,
    "0054_phase14_project_display_name"
  );

  const snapshot = JSON.parse(
    await readFile(
      new URL("./migrations/meta/0054_snapshot.json", import.meta.url),
      "utf8"
    )
  ) as {
    id: string;
    prevId: string;
    dialect: string;
    tables: Record<string, { columns: Record<string, unknown> }>;
  };
  assert.equal(snapshot.dialect, "postgresql");
  assert.ok(snapshot.tables["public.StudyJourneyProject"]?.columns.displayName);
  // 0050-0053 were hand-authored without Drizzle snapshots; 0054 resumes the
  // generated chain from the last committed snapshot (0049) and therefore absorbs
  // their schema state instead of re-emitting it.
  const previous = JSON.parse(
    await readFile(
      new URL("./migrations/meta/0049_snapshot.json", import.meta.url),
      "utf8"
    )
  ) as { id: string };
  assert.equal(snapshot.prevId, previous.id);
});
