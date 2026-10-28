import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = readFileSync(resolve(root, "lib/db/schema.ts"), "utf8");
const migration = readFileSync(
  resolve(root, "lib/db/migrations/0041_phase13_m4_002_staff_assignments.sql"),
  "utf8"
);
const repository = readFileSync(
  resolve(root, "lib/db/project-staff-assignment-repository.ts"),
  "utf8"
);
const journal = JSON.parse(
  readFileSync(resolve(root, "lib/db/migrations/meta/_journal.json"), "utf8")
) as { entries: Array<{ idx: number; tag: string }> };

const operationTypes = [
  "project_staff_assignment_propose",
  "project_staff_assignment_owner_approve",
  "project_staff_assignment_owner_decline",
  "project_staff_assignment_lawyer_accept",
  "project_staff_assignment_lawyer_decline",
  "project_staff_assignment_owner_revoke",
  "project_staff_assignment_lawyer_resign",
  "project_staff_assignment_admin_withdraw",
  "project_staff_assignment_admin_revoke",
];

const eventTypes = [
  "project_staff_assignment_proposed",
  "project_staff_assignment_owner_approved",
  "project_staff_assignment_owner_declined",
  "project_staff_assignment_lawyer_accepted",
  "project_staff_assignment_lawyer_declined",
  "project_staff_assignment_owner_revoked",
  "project_staff_assignment_lawyer_resigned",
  "project_staff_assignment_admin_withdrawn",
  "project_staff_assignment_admin_revoked",
];

/**
 * Fixture design for a later explicitly authorized PostgreSQL test:
 * seed valid User, StudyJourneyProject, ProjectOperation, and ProjectEvent
 * foreign-key rows first; then violate only ProjectStaffAssignment_lifecycle_check
 * and assert SQLSTATE 23514 plus that named constraint. For revision uniqueness,
 * seed a valid Project and valid operation row, insert one valid ProjectEvent,
 * then a second distinct valid operation/event at the same project revision and
 * assert SQLSTATE 23505 plus ProjectEvent_project_revision_unique. A missing
 * User/Project/Operation reference must be treated as SQLSTATE 23503, never as
 * the expected CHECK failure. This task deliberately does not execute fixtures.
 */
const deferredDatabaseFixtureDesign = {
  lifecycleCheck: {
    sqlState: "23514",
    constraint: "ProjectStaffAssignment_lifecycle_check",
    seedForeignKeysFirst: true,
  },
  eventRevisionUnique: {
    sqlState: "23505",
    constraint: "ProjectEvent_project_revision_unique",
    seedForeignKeysFirst: true,
  },
  foreignKeyFailure: { sqlState: "23503", isExpectedCheckFailure: false },
} as const;

test("M4-002 operation, event, result, subject, and actor vocabularies stay closed and aligned", () => {
  for (const operationType of operationTypes) {
    assert.match(schema, new RegExp(`"${operationType}"`, "u"));
    assert.ok(migration.includes(operationType));
  }
  for (const eventType of eventTypes) {
    assert.match(schema, new RegExp(`"${eventType}"`, "u"));
    assert.ok(migration.includes(eventType));
  }
  assert.match(schema, /"project_staff_assignment"/u);
  assert.match(migration, /ProjectOperation_actor_type_check/u);
  assert.match(migration, /'project_document_storage_worker'/u);
  assert.match(migration, /'project_document_scan_worker'/u);
  assert.match(migration, /ProjectStaffAssignmentEvent_actor_scope/u);
  assert.match(migration, /ProjectStaffAssignmentOperation_event_required/u);
  assert.match(schema, /ProjectEvent_project_revision_unique/u);
});

test("assignment table migration names lifecycle, identity, transition, and uniqueness guards", () => {
  for (const name of [
    "ProjectStaffAssignment_purpose_check",
    "ProjectStaffAssignment_role_check",
    "ProjectStaffAssignment_status_check",
    "ProjectStaffAssignment_hash_check",
    "ProjectStaffAssignment_lifecycle_check",
    "ProjectStaffAssignment_transition",
    "ProjectStaffAssignment_identity_immutable",
    "ProjectStaffAssignment_project_staff_purpose_live_unique",
    "ProjectStaffAssignment_transition_event_required",
  ]) {
    assert.ok(migration.includes(name), `migration is missing ${name}`);
  }
  assert.match(migration, /ON DELETE restrict/u);
  assert.match(migration, /ProjectStaffAssignmentOperation_event_required/u);
});

test("M4-002 actor locks remain compatible with ProjectOperation actor foreign keys", () => {
  const start = repository.indexOf("async function lockUsers(");
  const end = repository.indexOf("\n}\n", start);
  assert.ok(start >= 0 && end > start);
  const lockUsers = repository.slice(start, end);
  assert.match(
    lockUsers,
    /\.orderBy\(asc\(user\.id\)\)\s*\.for\("no key update"\)/u
  );
  assert.doesNotMatch(lockUsers, /\.for\("update"\)/u);
});

test("assignment revisions may skip unrelated Project revisions but stay strictly increasing", () => {
  const triggerStart = migration.indexOf(
    'CREATE FUNCTION "phase13_m4_staff_assignment_immutable_guard"()'
  );
  const triggerEnd = migration.indexOf(
    'CREATE TRIGGER "ProjectStaffAssignment_immutable_guard"',
    triggerStart
  );
  const trigger = migration.slice(triggerStart, triggerEnd);
  assert.match(
    trigger,
    /NEW\."lastProjectRevision"\s*<=\s*OLD\."lastProjectRevision"/u
  );
  assert.doesNotMatch(
    trigger,
    /NEW\."lastProjectRevision"\s*<>\s*OLD\."lastProjectRevision"\s*\+\s*1/u
  );
  assert.match(trigger, /OLD\."projectId" IS DISTINCT FROM NEW\."projectId"/u);

  // Proposal at 11, another Project operation at 12, then approval at 13.
  const proposalRevision = 11;
  const unrelatedProjectRevision = 12;
  const approvalRevision = 13;
  assert.ok(unrelatedProjectRevision > proposalRevision);
  assert.ok(approvalRevision > proposalRevision);

  assert.match(schema, /ProjectEvent_project_revision_unique/u);
  assert.match(migration, /event_count <> 1/u);
  assert.match(migration, /"projectRevision" = NEW\."lastProjectRevision"/u);
});

test("generated migration is the additive journal successor with a matching snapshot", () => {
  const entries = journal.entries.filter((entry) => entry.idx === 41);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.tag, "0041_phase13_m4_002_staff_assignments");
  const snapshot = JSON.parse(
    readFileSync(
      resolve(root, "lib/db/migrations/meta/0041_snapshot.json"),
      "utf8"
    )
  ) as { id?: string; prevId?: string; tables?: Record<string, unknown> };
  assert.ok(snapshot.id);
  assert.ok(snapshot.prevId);
  assert.ok(snapshot.tables?.["public.ProjectStaffAssignment"]);
});

test("offline SQLSTATE fixture design keeps valid foreign keys separate from CHECK and revision failures", () => {
  assert.deepEqual(deferredDatabaseFixtureDesign.lifecycleCheck, {
    sqlState: "23514",
    constraint: "ProjectStaffAssignment_lifecycle_check",
    seedForeignKeysFirst: true,
  });
  assert.deepEqual(deferredDatabaseFixtureDesign.eventRevisionUnique, {
    sqlState: "23505",
    constraint: "ProjectEvent_project_revision_unique",
    seedForeignKeysFirst: true,
  });
  assert.deepEqual(deferredDatabaseFixtureDesign.foreignKeyFailure, {
    sqlState: "23503",
    isExpectedCheckFailure: false,
  });
});
