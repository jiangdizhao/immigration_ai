// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions live in helpers used by tests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeStudent500Context,
  type Student500ContextInput,
  Student500Error,
  student500RequestSha256,
} from "./contracts";
import { createInMemoryStudent500Store } from "./in-memory-store";
import type { Student500OperationStamp } from "./ports";

/**
 * M6.1-R1: create-path idempotency and write-order regressions.
 *
 * Migration 0048 gives `Student500ApplicationOperation` an *immediate* composite
 * foreign key to `Student500Application(projectId, id)`. The operation row can
 * therefore only be written after its application exists, and an exact retry must
 * resolve the recorded operation's **persisted** result id - never a freshly
 * generated one.
 *
 * The behavioural scenarios run against the in-memory store (the offline mirror of
 * the SQL adapter invariants); the guarded PostgreSQL suite asserts the same
 * scenarios against real SQL, and the structural contract below pins the SQL
 * adapter's statement order so the two cannot drift.
 */

const OWNER = "11111111-1111-4111-8111-111111111101";
const PROJECT = "22222222-2222-4222-8222-222222222201";
const OTHER_PROJECT = "22222222-2222-4222-8222-222222222202";

const context: Student500ContextInput = {
  applicationPlace: "offshore",
  asOfDate: "2026-11-03",
  coeStatus: "reported_not_held",
  entryRoute: "offer_only",
};

function harness() {
  const store = createInMemoryStudent500Store();
  store.seedActor(OWNER, { registeredCustomer: true });
  store.seedProject(PROJECT, { ownerUserId: OWNER, status: "active" });
  store.seedProject(OTHER_PROJECT, { ownerUserId: OWNER, status: "active" });
  const normalized = normalizeStudent500Context(context);
  const stamp = (
    operationId: string,
    projectId = PROJECT
  ): Student500OperationStamp => ({
    actorUserId: OWNER,
    operationId,
    operationType: "student_500_create",
    requestSha256: student500RequestSha256({
      context: normalized,
      operationType: "student_500_create",
      projectId,
    }),
  });
  return { normalized, stamp, store };
}

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof Student500Error, String(error));
    return error.code;
  }
  throw new Error("expected a Student500Error");
}

test("a first create writes exactly one application, operation and event", async () => {
  const { normalized, stamp, store } = harness();
  const created = await store.createApplication({
    operation: stamp("op-create"),
    projectId: PROJECT,
    values: { applicantUserId: OWNER, context: normalized, ownerUserId: OWNER },
  });
  assert.equal(created.replayed, false);
  assert.equal(created.value.revision, 1);
  assert.equal(store.writes.length, 1);

  const listed = await store.listApplications({
    ownerUserId: OWNER,
    projectId: PROJECT,
  });
  assert.equal(listed.length, 1);
  const events = await store.listEvents({ applicationId: created.value.id });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "student_500_created");
});

test("an exact retry replays the persisted application instead of creating a second", async () => {
  const { normalized, stamp, store } = harness();
  const first = await store.createApplication({
    operation: stamp("op-replay"),
    projectId: PROJECT,
    values: { applicantUserId: OWNER, context: normalized, ownerUserId: OWNER },
  });
  const second = await store.createApplication({
    operation: stamp("op-replay"),
    projectId: PROJECT,
    values: { applicantUserId: OWNER, context: normalized, ownerUserId: OWNER },
  });
  assert.equal(second.replayed, true);
  assert.equal(second.value.id, first.value.id);
  assert.equal(
    (await store.listApplications({ ownerUserId: OWNER, projectId: PROJECT }))
      .length,
    1
  );
  assert.equal(
    (await store.listEvents({ applicationId: first.value.id })).length,
    1
  );
  assert.equal(store.writes.length, 1);
});

test("a changed payload under the same operation id is a conflict with no side effects", async () => {
  const { normalized, stamp, store } = harness();
  const first = await store.createApplication({
    operation: stamp("op-conflict"),
    projectId: PROJECT,
    values: { applicantUserId: OWNER, context: normalized, ownerUserId: OWNER },
  });
  const changed = normalizeStudent500Context({
    ...context,
    applicationPlace: "onshore",
    currentVisaSubclass: "500",
  });
  assert.equal(
    await code(() =>
      store.createApplication({
        operation: {
          ...stamp("op-conflict"),
          requestSha256: student500RequestSha256({
            context: changed,
            operationType: "student_500_create",
            projectId: PROJECT,
          }),
        },
        projectId: PROJECT,
        values: {
          applicantUserId: OWNER,
          context: changed,
          ownerUserId: OWNER,
        },
      })
    ),
    "idempotency_conflict"
  );
  assert.equal(
    (await store.listApplications({ ownerUserId: OWNER, projectId: PROJECT }))
      .length,
    1
  );
  assert.equal(
    (await store.listEvents({ applicationId: first.value.id })).length,
    1
  );
});

test("concurrent identical creates converge on one persisted application", async () => {
  const { normalized, stamp, store } = harness();
  const results = await Promise.all([
    store.createApplication({
      operation: stamp("op-concurrent"),
      projectId: PROJECT,
      values: {
        applicantUserId: OWNER,
        context: normalized,
        ownerUserId: OWNER,
      },
    }),
    store.createApplication({
      operation: stamp("op-concurrent"),
      projectId: PROJECT,
      values: {
        applicantUserId: OWNER,
        context: normalized,
        ownerUserId: OWNER,
      },
    }),
  ]);
  const ids = new Set(results.map((result) => result.value.id));
  assert.equal(ids.size, 1, "both callers must observe the same application");
  assert.equal(results.filter((result) => result.replayed === false).length, 1);
  assert.equal(
    (await store.listApplications({ ownerUserId: OWNER, projectId: PROJECT }))
      .length,
    1
  );
  const [id] = [...ids];
  assert.equal(
    (await store.listEvents({ applicationId: id as string })).length,
    1
  );
});

test("no orphan application, operation or event can survive a rejected create", async () => {
  const { normalized, stamp, store } = harness();
  const created = await store.createApplication({
    operation: stamp("op-orphan-check"),
    projectId: PROJECT,
    values: { applicantUserId: OWNER, context: normalized, ownerUserId: OWNER },
  });
  // A cross-Project reuse of the same operation id must be rejected...
  assert.equal(
    await code(() =>
      store.createApplication({
        operation: stamp("op-orphan-check", OTHER_PROJECT),
        projectId: OTHER_PROJECT,
        values: {
          applicantUserId: OWNER,
          context: normalized,
          ownerUserId: OWNER,
        },
      })
    ),
    "idempotency_conflict"
  );
  // ...and must leave the other Project completely empty.
  assert.equal(
    (
      await store.listApplications({
        ownerUserId: OWNER,
        projectId: OTHER_PROJECT,
      })
    ).length,
    0
  );
  // Every operation still points at the one application that exists.
  const listed = await store.listApplications({
    ownerUserId: OWNER,
    projectId: PROJECT,
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, created.value.id);
  assert.equal(store.writes.length, 1);
});

const here = dirname(fileURLToPath(import.meta.url));
const repositorySource = readFileSync(
  resolve(here, "postgres-repository.ts"),
  "utf8"
);

function createMethodBody(): string {
  const start = repositorySource.indexOf("    createApplication(");
  assert.notEqual(start, -1, "createApplication is missing");
  const end = repositorySource.indexOf("    updateApplication(", start);
  assert.notEqual(end, -1, "updateApplication boundary is missing");
  return repositorySource.slice(start, end);
}

test("the SQL create path inserts the application before the operation row", () => {
  const body = createMethodBody();
  const applicationInsert = body.indexOf("insert(student500Application)");
  const operationClaim = body.indexOf("claimOperationForNewApplication(");
  assert.notEqual(applicationInsert, -1, "application insert missing");
  assert.notEqual(operationClaim, -1, "operation claim missing");
  assert.ok(
    applicationInsert < operationClaim,
    "the immediate composite FK requires the application row first"
  );
  // The old, invalid order claimed the operation before the application existed.
  assert.equal(
    /claimOperation\(tx/.test(body),
    false,
    "create must not use the pre-insert operation claim"
  );
});

test("the SQL create path resolves replays from the persisted result id", () => {
  const body = createMethodBody();
  // A generated id must never be used to load a previously created application.
  assert.equal(
    /lockApplication\(tx, \{\s*applicationId: applicationId,/u.test(body),
    false,
    "replay must not use a freshly generated application id"
  );
  assert.match(body, /applicationId: existing\.resultId/u);
  assert.match(body, /applicationId: winner\.resultId/u);
  // A lost claim race rolls the whole transaction back and resolves the winner.
  assert.match(body, /Student500OperationRaceSignal/u);
  assert.match(body, /idempotency_conflict/u);
});

test("the operation table is only ever written once per (actor, operation)", () => {
  assert.match(
    repositorySource,
    /onConflictDoNothing\(\{\s*target: \[\s*student500ApplicationOperation\.actorUserId,\s*student500ApplicationOperation\.operationId,\s*\],?\s*\}\)/u
  );
  const inMemory = readFileSync(resolve(here, "in-memory-store.ts"), "utf8");
  assert.match(inMemory, /function recordOperation\(/u);
  assert.match(inMemory, /readOperation\(input\.operation\)/u);
});
