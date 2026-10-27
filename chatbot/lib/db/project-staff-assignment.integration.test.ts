// biome-ignore-all lint/suspicious/noMisplacedAssertion: all helpers are scoped to this guarded PostgreSQL integration suite.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import {
  assertM4MigrationLedger,
  expectedM4Migration,
  M4_002_TEST_APPROVAL,
  M4_002_TEST_TARGET,
  type M4MigrationJournal,
  parseM4DatabaseUrl,
} from "../../scripts/phase13-m4-002-db-test-guard";
import {
  PostgresProjectDocumentRepository,
  ProjectDocumentPersistenceError,
} from "../project-documents/postgres-repository";
import { ProjectStaffAssignmentError } from "../project-staff-assignments/errors";
import {
  authorizeProjectStaffDisclosure,
  PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
  type ProjectStaffAssignmentAction,
  projectStaffAssignmentsEnabled,
} from "../project-staff-assignments/policy";
import {
  createProjectFoundationRepository,
  ProjectFoundationError,
} from "./project-foundation";
import { createProjectStaffAssignmentRepository } from "./project-staff-assignment-repository";
import { closeLazyDatabase, getLazyDatabase } from "./runtime-client";

const TEST_DATABASE_URL =
  process.env.PHASE13_M4_002_TEST_DATABASE_URL?.trim() ?? "";
const isGuardedRun =
  process.env.PHASE13_M4_002_TEST_RUNNER_VERIFIED === "1" &&
  process.env.PHASE13_M4_002_TEST_APPROVAL === M4_002_TEST_APPROVAL &&
  TEST_DATABASE_URL.length > 0;
const skipReason = isGuardedRun
  ? false
  : "M4-002 PostgreSQL integration requires the guarded launcher and explicit approval token";

function operationKey(label: string) {
  return `m4-db-${label}-${randomUUID()}`;
}

function isErrorCode<T extends { code: string }>(
  error: unknown,
  ErrorClass: new (...args: never[]) => T,
  code: string
) {
  return error instanceof ErrorClass && error.code === code;
}

async function expectStaffError(
  operation: Promise<unknown>,
  code: ProjectStaffAssignmentError["code"]
) {
  await assert.rejects(operation, (error: unknown) =>
    isErrorCode(error, ProjectStaffAssignmentError, code)
  );
}

async function expectFoundationError(
  operation: Promise<unknown>,
  code: ProjectFoundationError["code"]
) {
  await assert.rejects(operation, (error: unknown) =>
    isErrorCode(error, ProjectFoundationError, code)
  );
}

async function expectPostgresConstraint(
  operation: () => Promise<unknown>,
  code: string,
  constraintName: string | readonly string[]
) {
  await assert.rejects(operation(), (error: unknown) => {
    assert.ok(error instanceof Error);
    const postgresError = error as Error & {
      code?: string;
      constraint_name?: string;
    };
    assert.equal(postgresError.code, code);
    const expectedConstraintNames =
      typeof constraintName === "string" ? [constraintName] : constraintName;
    assert.ok(
      expectedConstraintNames.includes(postgresError.constraint_name ?? ""),
      `Expected constraint ${expectedConstraintNames.join(" or ")}, received ${postgresError.constraint_name}`
    );
    return true;
  });
}

async function insertUser(
  sql: ReturnType<typeof postgres>,
  input: { label: string; role: "user" | "lawyer" | "admin" }
) {
  const email = `${input.label}-${randomUUID().replaceAll("-", "").slice(0, 20)}@example.test`;
  const [row] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password", "role", "emailVerifiedAt")
    values (
      ${email}, ${"x".repeat(64)}, ${input.role},
      ${input.role === "lawyer" ? new Date().toISOString() : null}
    )
    returning "id"
  `;
  assert.ok(row?.id);
  return { id: row.id, email };
}

async function insertOperation(
  sql: ReturnType<typeof postgres>,
  input: {
    actorUserId: string;
    resultId: string;
    operationType?: string;
    operationId?: string;
    actorKind?: "user" | "service";
    servicePrincipalCode?: string | null;
  }
) {
  const [row] = await sql<{ id: string }[]>`
    insert into "ProjectOperation" (
      "actorUserId", "actorKind", "servicePrincipalCode", "operationType",
      "operationId", "requestHash", "resultKind", "resultId"
    ) values (
      ${input.actorKind === "service" ? null : input.actorUserId},
      ${input.actorKind ?? "user"}, ${input.servicePrincipalCode ?? null},
      ${input.operationType ?? "project_staff_assignment_propose"},
      ${input.operationId ?? operationKey("constraint")}, ${"a".repeat(64)},
      'project_staff_assignment', ${input.resultId}
    ) returning "id"
  `;
  assert.ok(row?.id);
  return row.id;
}

async function projectRevision(
  sql: ReturnType<typeof postgres>,
  projectId: string
) {
  const [row] = await sql<{ revision: number }[]>`
    select "revision" from "StudyJourneyProject" where "id" = ${projectId}
  `;
  assert.ok(row);
  return row.revision;
}

async function countFor(
  sql: ReturnType<typeof postgres>,
  table: "ProjectStaffAssignment" | "ProjectOperation" | "ProjectEvent",
  where: { column: string; value: string }
) {
  const allowedColumns = {
    ProjectStaffAssignment: new Set(["projectId"]),
    ProjectOperation: new Set(["actorUserId", "operationId", "resultId"]),
    ProjectEvent: new Set(["projectId", "actorUserId"]),
  } as const;
  assert.ok(
    allowedColumns[table].has(where.column),
    `Unsupported count column "${where.column}" for table "${table}"`
  );
  const rows = (await sql.unsafe(
    `select count(*)::int as count from "${table}" where "${where.column}" = $1`,
    [where.value]
  )) as Array<{ count: number }>;
  return rows[0]?.count ?? 0;
}

async function createProjectFixture(
  sql: ReturnType<typeof postgres>,
  input?: { ownerId?: string; adminId?: string; lawyerId?: string }
) {
  const owner = input?.ownerId
    ? { id: input.ownerId }
    : await insertUser(sql, { label: "m4-owner", role: "user" });
  const admin = input?.adminId
    ? { id: input.adminId }
    : await insertUser(sql, { label: "m4-admin", role: "admin" });
  const lawyer = input?.lawyerId
    ? { id: input.lawyerId }
    : await insertUser(sql, { label: "m4-lawyer", role: "lawyer" });
  const created = await createProjectFoundationRepository().createProject({
    actorUserId: owner.id,
    operationId: operationKey("project"),
  });
  return { owner, admin, lawyer, project: created.project };
}

async function propose(
  _sql: ReturnType<typeof postgres>,
  input: {
    ownerId: string;
    adminId: string;
    lawyerId: string;
    projectId: string;
    operationId?: string;
  }
) {
  const repository = createProjectStaffAssignmentRepository();
  const operationId = input.operationId ?? operationKey("propose");
  const result = await repository.propose({
    actorUserId: input.adminId,
    projectId: input.projectId,
    staffUserId: input.lawyerId,
    operationId,
  });
  const [assignment] = await repository.listOwnerAssignments({
    actorUserId: input.ownerId,
    projectId: input.projectId,
  });
  assert.ok(assignment);
  return { result, assignment, operationId };
}

async function transition(
  sql: ReturnType<typeof postgres>,
  input: {
    actorUserId: string;
    projectId: string;
    assignmentId: string;
    action: ProjectStaffAssignmentAction;
    operationId?: string;
    expectedProjectRevision?: number;
    proposalSha256?: string;
    noticeVersion?: string;
  }
) {
  return createProjectStaffAssignmentRepository().transition({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    assignmentId: input.assignmentId,
    action: input.action,
    operationId: input.operationId ?? operationKey(input.action),
    expectedProjectRevision:
      input.expectedProjectRevision ??
      (await projectRevision(sql, input.projectId)),
    ...(input.proposalSha256 ? { proposalSha256: input.proposalSha256 } : {}),
    ...(input.noticeVersion ? { noticeVersion: input.noticeVersion } : {}),
  });
}

function approve(
  sql: ReturnType<typeof postgres>,
  input: {
    ownerId: string;
    projectId: string;
    assignment: { assignmentId: string; proposalSha256: string };
    operationId?: string;
    expectedProjectRevision?: number;
  }
) {
  return transition(sql, {
    actorUserId: input.ownerId,
    projectId: input.projectId,
    assignmentId: input.assignment.assignmentId,
    action: "owner_approve",
    operationId: input.operationId,
    expectedProjectRevision: input.expectedProjectRevision,
    proposalSha256: input.assignment.proposalSha256,
    noticeVersion: PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
  });
}

async function assertAssignmentEvent(
  sql: ReturnType<typeof postgres>,
  input: {
    assignmentId: string;
    projectId: string;
    expectedType: string;
    expectedActorUserId: string;
  }
) {
  const [assignment] = await sql<
    { lastOperationRecordId: string; lastProjectRevision: number }[]
  >`
    select "lastOperationRecordId", "lastProjectRevision"
    from "ProjectStaffAssignment" where "id" = ${input.assignmentId}
  `;
  assert.ok(assignment);
  const operationTypesByEvent: Record<string, string> = {
    project_staff_assignment_proposed: "project_staff_assignment_propose",
    project_staff_assignment_owner_approved:
      "project_staff_assignment_owner_approve",
    project_staff_assignment_owner_declined:
      "project_staff_assignment_owner_decline",
    project_staff_assignment_lawyer_accepted:
      "project_staff_assignment_lawyer_accept",
    project_staff_assignment_lawyer_declined:
      "project_staff_assignment_lawyer_decline",
    project_staff_assignment_owner_revoked:
      "project_staff_assignment_owner_revoke",
    project_staff_assignment_lawyer_resigned:
      "project_staff_assignment_lawyer_resign",
    project_staff_assignment_admin_withdrawn:
      "project_staff_assignment_admin_withdraw",
    project_staff_assignment_admin_revoked:
      "project_staff_assignment_admin_revoke",
  };
  const [operation] = await sql<
    {
      actorUserId: string;
      actorKind: string;
      operationType: string;
      resultKind: string;
      resultId: string;
    }[]
  >`
    select "actorUserId", "actorKind", "operationType", "resultKind", "resultId"
    from "ProjectOperation" where "id" = ${assignment.lastOperationRecordId}
  `;
  assert.deepEqual(operation, {
    actorUserId: input.expectedActorUserId,
    actorKind: "user",
    operationType: operationTypesByEvent[input.expectedType],
    resultKind: "project_staff_assignment",
    resultId: input.assignmentId,
  });
  const events = await sql<
    {
      projectId: string;
      eventType: string;
      subjectKind: string;
      subjectId: string;
      projectRevision: number;
      actorUserId: string;
    }[]
  >`
    select "projectId", "eventType", "subjectKind", "subjectId",
           "projectRevision", "actorUserId"
    from "ProjectEvent" where "operationRecordId" = ${assignment.lastOperationRecordId}
  `;
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    projectId: input.projectId,
    eventType: input.expectedType,
    subjectKind: "project_staff_assignment",
    subjectId: input.assignmentId,
    projectRevision: assignment.lastProjectRevision,
    actorUserId: input.expectedActorUserId,
  });
  assert.equal(events[0]?.actorUserId, input.expectedActorUserId);
  const revisionEvents = await sql<{ count: number }[]>`
    select count(*)::int as count from "ProjectEvent"
    where "projectId" = ${input.projectId}
      and "projectRevision" = ${assignment.lastProjectRevision}
  `;
  assert.equal(revisionEvents[0]?.count, 1);
}

async function assertCompleteEventLedger(
  sql: ReturnType<typeof postgres>,
  projectId: string
) {
  const [project] = await sql<{ revision: number }[]>`
    select "revision" from "StudyJourneyProject" where "id" = ${projectId}
  `;
  assert.ok(project);
  const rows = await sql<{ revision: number; eventCount: number }[]>`
    select expected.revision, count(event."id")::int as "eventCount"
    from generate_series(1, ${project.revision}) as expected(revision)
    left join "ProjectEvent" event
      on event."projectId" = ${projectId}
     and event."projectRevision" = expected.revision
    group by expected.revision
    order by expected.revision
  `;
  assert.equal(rows.length, project.revision);
  assert.ok(rows.every((row) => row.eventCount === 1));
}

async function assertRuntimeIdentity(sql: ReturnType<typeof postgres>) {
  parseM4DatabaseUrl(TEST_DATABASE_URL);
  assert.equal(process.env.POSTGRES_URL, TEST_DATABASE_URL);
  const [identity] = await sql<
    { database: string; role: string; version: number }[]
  >`
    select current_database() as database,
           current_user as role,
           current_setting('server_version_num')::int as version
  `;
  assert.equal(identity?.database, M4_002_TEST_TARGET.database);
  assert.equal(identity?.role, M4_002_TEST_TARGET.role);
  assert.ok(
    identity && identity.version >= 170_000 && identity.version < 180_000
  );

  const journal = JSON.parse(
    await readFile(resolve("lib/db/migrations/meta/_journal.json"), "utf8")
  ) as M4MigrationJournal;
  const migration = await readFile(
    resolve("lib/db/migrations/0041_phase13_m4_002_staff_assignments.sql"),
    "utf8"
  );
  const expected = expectedM4Migration(journal, migration);
  const [ledger] = await sql<
    {
      rowCount: number;
      latestId: number | null;
      latestHash: string | null;
      latestCreatedAt: string | null;
    }[]
  >`
    select
      (select count(*)::int from drizzle.__drizzle_migrations) as "rowCount",
      (select id::int from drizzle.__drizzle_migrations order by id desc limit 1) as "latestId",
      (select hash from drizzle.__drizzle_migrations order by id desc limit 1) as "latestHash",
      (select created_at::text from drizzle.__drizzle_migrations order by id desc limit 1) as "latestCreatedAt"
  `;
  assert.ok(ledger?.latestId && ledger.latestHash && ledger.latestCreatedAt);
  assertM4MigrationLedger({
    rowCount: ledger.rowCount,
    latestId: ledger.latestId,
    latestHash: ledger.latestHash,
    latestCreatedAt: Number(ledger.latestCreatedAt),
    expected,
  });
}

// Each run creates fresh synthetic rows in the guarded disposable database.
// Assignment rows are immutable audit records, so this suite never deletes or resets fixtures.
test(
  "Phase 13 M4-002 guarded isolated PostgreSQL integration",
  { skip: skipReason },
  async (t) => {
    assert.ok(isGuardedRun);
    parseM4DatabaseUrl(TEST_DATABASE_URL);
    const sql = postgres(TEST_DATABASE_URL, {
      max: 12,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
      onnotice: () => undefined,
    });
    try {
      await assertRuntimeIdentity(sql);
      const staffRepository = createProjectStaffAssignmentRepository();
      const foundationRepository = createProjectFoundationRepository();

      await t.test(
        "Group A — schema inventory, SQL CHECKs, FKs and deferred triggers",
        async (st) => {
          await st.test(
            "required table, indexes, checks and triggers are installed",
            async () => {
              const [table] = await sql<{ present: string | null }[]>`
            select to_regclass('public."ProjectStaffAssignment"')::text as present
          `;
              assert.ok(table?.present);
              const columns = await sql<{ count: number }[]>`
            select count(*)::int as count from information_schema.columns
            where table_schema = 'public' and table_name = 'ProjectStaffAssignment'
          `;
              assert.equal(columns[0]?.count, 22);
              const indexes = await sql<{ count: number }[]>`
            select count(*)::int as count from pg_indexes
            where schemaname = 'public' and indexname in (
              'ProjectStaffAssignment_project_staff_purpose_live_unique',
              'ProjectStaffAssignment_project_status_idx',
              'ProjectStaffAssignment_admin_project_status_idx',
              'ProjectStaffAssignment_staff_status_idx'
            )
          `;
              assert.equal(indexes[0]?.count, 4);
              const constraints = await sql<{ count: number }[]>`
            select count(*)::int as count from pg_constraint
            where connamespace = 'public'::regnamespace and conname in (
              'ProjectStaffAssignment_purpose_check', 'ProjectStaffAssignment_role_check',
              'ProjectStaffAssignment_status_check', 'ProjectStaffAssignment_hash_check',
              'ProjectStaffAssignment_notice_version_check', 'ProjectStaffAssignment_revision_positive_check',
              'ProjectStaffAssignment_timestamps_check', 'ProjectStaffAssignment_lifecycle_check',
              'ProjectOperation_type_check', 'ProjectOperation_result_kind_check',
              'ProjectOperation_actor_type_check', 'ProjectEvent_type_check',
              'ProjectEvent_subject_check', 'ProjectEvent_staff_assignment_subject_check'
            )
          `;
              assert.equal(constraints[0]?.count, 14);
              const triggers = await sql<{ count: number }[]>`
            select count(*)::int as count from pg_trigger where not tgisinternal and (
              (tgname = 'ProjectStaffAssignment_immutable_guard' and tgrelid = '"ProjectStaffAssignment"'::regclass)
              or (tgname = 'ProjectRound2Event_binding' and tgrelid = '"ProjectEvent"'::regclass)
              or (tgname = 'ProjectStaffAssignmentOperation_complete' and tgrelid = '"ProjectOperation"'::regclass)
              or (tgname = 'ProjectStaffAssignment_transition_complete' and tgrelid = '"ProjectStaffAssignment"'::regclass)
            )
          `;
              assert.equal(triggers[0]?.count, 4);
            }
          );

          await st.test(
            "operation and event vocabularies and actor scope remain closed",
            async () => {
              const fixture = await createProjectFixture(sql);
              const invalidOperationId = operationKey("bad-type");
              await expectPostgresConstraint(
                () =>
                  sql.begin(async (tx) => {
                    await tx`
                insert into "ProjectOperation" (
                  "actorUserId", "operationType", "operationId", "requestHash", "resultKind", "resultId"
                ) values (
                  ${fixture.admin.id}, 'm4_unknown_operation', ${invalidOperationId},
                  ${"b".repeat(64)}, 'project_staff_assignment', ${randomUUID()}
                )
              `;
                  }),
                "23514",
                [
                  "ProjectOperation_type_check",
                  "ProjectOperation_actor_type_check",
                ]
              );
              const [invalidOperationCount] = await sql<{ count: number }[]>`
                select count(*)::int as count from "ProjectOperation"
                where "operationId" = ${invalidOperationId}
              `;
              assert.equal(invalidOperationCount?.count, 0);
              const [invalidOperationEventCount] = await sql<
                { count: number }[]
              >`
                select count(*)::int as count
                from "ProjectEvent" event
                join "ProjectOperation" operation
                  on operation."id" = event."operationRecordId"
                where operation."operationId" = ${invalidOperationId}
              `;
              assert.equal(invalidOperationEventCount?.count, 0);
              await expectPostgresConstraint(
                () =>
                  sql.begin(async (tx) => {
                    await tx`
                insert into "ProjectOperation" (
                  "actorUserId", "actorKind", "servicePrincipalCode", "operationType",
                  "operationId", "requestHash", "resultKind", "resultId"
                ) values (
                  null, 'service', 'project_document_storage_worker',
                  'project_staff_assignment_propose', ${operationKey("bad-actor")},
                  ${"c".repeat(64)}, 'project_staff_assignment', ${randomUUID()}
                )
              `;
                  }),
                "23514",
                "ProjectOperation_actor_type_check"
              );
              const [projectOperation] = await sql<
                { operationRecordId: string }[]
              >`
            select "operationRecordId" from "ProjectEvent"
            where "projectId" = ${fixture.project.id} and "projectRevision" = 1
          `;
              assert.ok(projectOperation);
              await expectPostgresConstraint(
                () =>
                  sql.begin(async (tx) => {
                    await tx`
                insert into "ProjectEvent" (
                  "projectId", "actorUserId", "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId"
                ) values (
                  ${fixture.project.id}, ${fixture.owner.id}, 90, 'm4_unknown_event',
                  null, null, ${projectOperation.operationRecordId}
                )
              `;
                  }),
                "23514",
                "ProjectEvent_type_check"
              );
            }
          );

          await st.test(
            "valid foreign keys isolate lifecycle CHECK and FK SQLSTATEs",
            async () => {
              const fixture = await createProjectFixture(sql);
              const alternateLawyer = await insertUser(sql, {
                label: "m4-check-lawyer",
                role: "lawyer",
              });
              const invalidAssignmentId = randomUUID();
              await expectPostgresConstraint(
                () =>
                  sql.begin(async (tx) => {
                    const operationId = await insertOperation(tx, {
                      actorUserId: fixture.admin.id,
                      resultId: invalidAssignmentId,
                    });
                    await tx`
                insert into "ProjectStaffAssignment" (
                  "id", "projectId", "staffUserId", "proposedByAdminUserId", "purpose",
                  "assignmentRole", "status", "staffEmailSha256", "noticeVersion", "noticeSha256",
                  "proposalSha256", "lastProjectRevision", "lastOperationRecordId"
                ) values (
                  ${invalidAssignmentId}, ${fixture.project.id}, ${alternateLawyer.id}, ${fixture.admin.id},
                  'project_staff_collaboration', 'lawyer', 'owner_approved', ${"d".repeat(64)},
                  ${PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION}, ${"e".repeat(64)}, ${"f".repeat(64)},
                  ${fixture.project.revision + 1}, ${operationId}
                )
              `;
                  }),
                "23514",
                "ProjectStaffAssignment_lifecycle_check"
              );

              const invalidForeignKeyAssignmentId = randomUUID();
              await expectPostgresConstraint(
                () =>
                  sql.begin(async (tx) => {
                    const operationId = await insertOperation(tx, {
                      actorUserId: fixture.admin.id,
                      resultId: invalidForeignKeyAssignmentId,
                    });
                    await tx`
                insert into "ProjectStaffAssignment" (
                  "id", "projectId", "staffUserId", "proposedByAdminUserId", "purpose",
                  "assignmentRole", "status", "staffEmailSha256", "noticeVersion", "noticeSha256",
                  "proposalSha256", "lastProjectRevision", "lastOperationRecordId"
                ) values (
                  ${invalidForeignKeyAssignmentId}, ${randomUUID()}, ${alternateLawyer.id}, ${fixture.admin.id},
                  'project_staff_collaboration', 'lawyer', 'proposed', ${"1".repeat(64)},
                  ${PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION}, ${"2".repeat(64)}, ${"3".repeat(64)},
                  ${fixture.project.revision + 1}, ${operationId}
                )
              `;
                  }),
                "23503",
                "ProjectStaffAssignment_projectId_StudyJourneyProject_id_fk"
              );
            }
          );

          await st.test(
            "event revision uniqueness and commit-time operation completeness are enforced",
            async () => {
              const fixture = await createProjectFixture(sql);
              const [createdEvent] = await sql<{ operationRecordId: string }[]>`
            select "operationRecordId" from "ProjectEvent"
            where "projectId" = ${fixture.project.id} and "projectRevision" = 1
          `;
              assert.ok(createdEvent);
              await expectPostgresConstraint(
                () =>
                  sql.begin(async (tx) => {
                    await tx`
                insert into "ProjectEvent" (
                  "projectId", "actorUserId", "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId"
                ) values (
                  ${fixture.project.id}, ${fixture.owner.id}, 1, 'project_created',
                  'project', ${fixture.project.id}, ${createdEvent.operationRecordId}
                )
              `;
                  }),
                "23505",
                "ProjectEvent_project_revision_unique"
              );

              const orphanAssignmentId = randomUUID();
              await expectPostgresConstraint(
                () =>
                  sql.begin(async (tx) => {
                    await insertOperation(tx, {
                      actorUserId: fixture.admin.id,
                      resultId: orphanAssignmentId,
                    });
                  }),
                "23514",
                "ProjectStaffAssignmentOperation_assignment_required"
              );
            }
          );

          await st.test(
            "proposal identity is immutable and mismatched event actor is rejected",
            async () => {
              const fixture = await createProjectFixture(sql);
              const otherLawyer = await insertUser(sql, {
                label: "m4-identity-lawyer",
                role: "lawyer",
              });
              const proposed = await propose(sql, {
                ownerId: fixture.owner.id,
                adminId: fixture.admin.id,
                lawyerId: fixture.lawyer.id,
                projectId: fixture.project.id,
              });
              await expectPostgresConstraint(
                () => sql`
              update "ProjectStaffAssignment" set "staffUserId" = ${otherLawyer.id}
              where "id" = ${proposed.assignment.assignmentId}
            `,
                "23514",
                "ProjectStaffAssignment_identity_immutable"
              );
              const [proposalOperation] = await sql<{ id: string }[]>`
            select "lastOperationRecordId" as id from "ProjectStaffAssignment"
            where "id" = ${proposed.assignment.assignmentId}
          `;
              assert.ok(proposalOperation);
              await expectPostgresConstraint(
                () =>
                  sql.begin(async (tx) => {
                    await tx`
                insert into "ProjectEvent" (
                  "projectId", "actorUserId", "actorKind", "servicePrincipalCode",
                  "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId"
                ) values (
                  ${fixture.project.id}, null, 'service', 'project_document_storage_worker',
                  ${proposed.assignment.expectedProjectRevision + 1},
                  'project_staff_assignment_proposed', 'project_staff_assignment',
                  ${proposed.assignment.assignmentId}, ${proposalOperation.id}
                )
              `;
                  }),
                "23514",
                "ProjectStaffAssignmentEvent_operation_match"
              );
            }
          );
        }
      );

      await t.test(
        "Group B — Option A proposal, owner consent, named lawyer acceptance and minimal shell",
        async (st) => {
          await st.test(
            "proposed and owner-approved assignments expose no staff shell",
            async () => {
              const fixture = await createProjectFixture(sql);
              const otherCustomer = await insertUser(sql, {
                label: "m4-other-customer",
                role: "user",
              });
              const otherLawyer = await insertUser(sql, {
                label: "m4-other-lawyer",
                role: "lawyer",
              });
              const proposed = await propose(sql, {
                ownerId: fixture.owner.id,
                adminId: fixture.admin.id,
                lawyerId: fixture.lawyer.id,
                projectId: fixture.project.id,
              });
              assert.equal(proposed.result.replayed, false);
              await expectStaffError(
                staffRepository.getStaffShell({
                  actorUserId: fixture.lawyer.id,
                  projectId: fixture.project.id,
                }),
                "not_found"
              );
              assert.deepEqual(
                await staffRepository.listLawyerInvitations({
                  actorUserId: fixture.lawyer.id,
                }),
                []
              );
              await expectStaffError(
                transition(sql, {
                  actorUserId: otherCustomer.id,
                  projectId: fixture.project.id,
                  assignmentId: proposed.assignment.assignmentId,
                  action: "owner_approve",
                  proposalSha256: proposed.assignment.proposalSha256,
                  noticeVersion: proposed.assignment.noticeVersion,
                }),
                "not_found"
              );
              const now = new Date().toISOString();
              await sql`
            insert into "ProjectMembership" (
              "projectId", "userId", "status", "invitedByUserId", "acceptedAt"
            ) values (
              ${fixture.project.id}, ${otherCustomer.id}, 'active', ${fixture.owner.id}, ${now}
            )
          `;
              await expectStaffError(
                transition(sql, {
                  actorUserId: otherCustomer.id,
                  projectId: fixture.project.id,
                  assignmentId: proposed.assignment.assignmentId,
                  action: "owner_approve",
                  proposalSha256: proposed.assignment.proposalSha256,
                  noticeVersion: proposed.assignment.noticeVersion,
                }),
                "not_found"
              );

              await approve(sql, {
                ownerId: fixture.owner.id,
                projectId: fixture.project.id,
                assignment: proposed.assignment,
              });
              const [ownerApprovalBefore] = await sql<
                {
                  ownerApprovedByUserId: string;
                  ownerApprovedAt: string;
                  ownerApprovalSha256: string;
                }[]
              >`
                select
                  "ownerApprovedByUserId"::text as "ownerApprovedByUserId",
                  "ownerApprovedAt"::text as "ownerApprovedAt",
                  "ownerApprovalSha256"
                from "ProjectStaffAssignment"
                where "id" = ${proposed.assignment.assignmentId}
              `;
              assert.ok(ownerApprovalBefore);
              assert.equal(
                ownerApprovalBefore.ownerApprovedByUserId,
                fixture.owner.id
              );
              assert.equal(
                ownerApprovalBefore.ownerApprovalSha256,
                proposed.assignment.proposalSha256
              );
              assert.ok(ownerApprovalBefore.ownerApprovedAt);
              await expectPostgresConstraint(
                () => sql`
              update "ProjectStaffAssignment"
              set "ownerApprovedByUserId" = ${otherCustomer.id}
              where "id" = ${proposed.assignment.assignmentId}
            `,
                "23514",
                "ProjectStaffAssignment_transition"
              );
              const [ownerApprovalAfter] = await sql<
                {
                  ownerApprovedByUserId: string;
                  ownerApprovedAt: string;
                  ownerApprovalSha256: string;
                }[]
              >`
                select
                  "ownerApprovedByUserId"::text as "ownerApprovedByUserId",
                  "ownerApprovedAt"::text as "ownerApprovedAt",
                  "ownerApprovalSha256"
                from "ProjectStaffAssignment"
                where "id" = ${proposed.assignment.assignmentId}
              `;
              assert.deepEqual(ownerApprovalAfter, ownerApprovalBefore);
              await expectStaffError(
                staffRepository.getStaffShell({
                  actorUserId: fixture.lawyer.id,
                  projectId: fixture.project.id,
                }),
                "not_found"
              );
              await expectStaffError(
                transition(sql, {
                  actorUserId: otherLawyer.id,
                  projectId: fixture.project.id,
                  assignmentId: proposed.assignment.assignmentId,
                  action: "lawyer_accept",
                }),
                "not_found"
              );
              const invitations = await staffRepository.listLawyerInvitations({
                actorUserId: fixture.lawyer.id,
              });
              assert.equal(invitations.length, 1);
              const accepted = await transition(sql, {
                actorUserId: fixture.lawyer.id,
                projectId: fixture.project.id,
                assignmentId: proposed.assignment.assignmentId,
                action: "lawyer_accept",
              });
              assert.equal(accepted.assignment.assignmentStatus, "active");
              const shell = await staffRepository.getStaffShell({
                actorUserId: fixture.lawyer.id,
                projectId: fixture.project.id,
              });
              assert.deepEqual(Object.keys(shell).sort(), [
                "acceptedAt",
                "assignmentId",
                "assignmentRole",
                "assignmentStatus",
                "createdAt",
                "projectId",
                "projectLifecycle",
                "updatedAt",
              ]);
              assert.equal(
                shell.assignmentId,
                proposed.assignment.assignmentId
              );
              assert.equal(shell.projectId, fixture.project.id);
              assert.equal(shell.assignmentRole, "lawyer");
              assert.equal(shell.assignmentStatus, "active");
              assert.equal(shell.projectLifecycle, "active");
              for (const resource of [
                "project_fact",
                "project_document",
                "private_chat",
                "task",
                "requirement",
                "message",
                "financial_record",
                "engagement_record",
                "other_project_resource",
              ] as const) {
                assert.deepEqual(
                  authorizeProjectStaffDisclosure({
                    assignmentId: shell.assignmentId,
                    projectId: shell.projectId,
                    staffUserId: fixture.lawyer.id,
                    resource,
                  }),
                  {
                    decision: "DENY",
                    reason: "m4_004_disclosure_policy_pending",
                  }
                );
              }
              await assertAssignmentEvent(sql, {
                assignmentId: proposed.assignment.assignmentId,
                projectId: fixture.project.id,
                expectedType: "project_staff_assignment_lawyer_accepted",
                expectedActorUserId: fixture.lawyer.id,
              });
            }
          );

          await st.test(
            "administrator role alone grants no Project access and own proposal scope is enforced",
            async () => {
              const fixture = await createProjectFixture(sql);
              const otherAdmin = await insertUser(sql, {
                label: "m4-other-admin",
                role: "admin",
              });
              await expectStaffError(
                staffRepository.getStaffShell({
                  actorUserId: fixture.admin.id,
                  projectId: fixture.project.id,
                }),
                "not_found"
              );
              assert.deepEqual(
                await staffRepository.listAdminAssignments({
                  actorUserId: otherAdmin.id,
                  projectId: fixture.project.id,
                }),
                []
              );
              const proposed = await propose(sql, {
                ownerId: fixture.owner.id,
                adminId: fixture.admin.id,
                lawyerId: fixture.lawyer.id,
                projectId: fixture.project.id,
              });
              await expectStaffError(
                transition(sql, {
                  actorUserId: otherAdmin.id,
                  projectId: fixture.project.id,
                  assignmentId: proposed.assignment.assignmentId,
                  action: "admin_withdraw",
                }),
                "not_found"
              );
              const adminProjection =
                await staffRepository.listAdminAssignments({
                  actorUserId: fixture.admin.id,
                  projectId: fixture.project.id,
                });
              assert.equal(adminProjection.length, 1);
              assert.deepEqual(Object.keys(adminProjection[0] ?? {}).sort(), [
                "assignmentId",
                "assignmentStatus",
                "createdAt",
                "lawyerAcceptedAt",
                "ownerApprovedAt",
                "terminalAt",
                "updatedAt",
              ]);
            }
          );

          await st.test(
            "unknown, foreign and closed Project identifiers share not-found boundaries",
            async () => {
              const fixture = await createProjectFixture(sql);
              const foreign = await createProjectFixture(sql);
              const unknownProjectId = randomUUID();
              await expectStaffError(
                staffRepository.listOwnerAssignments({
                  actorUserId: foreign.owner.id,
                  projectId: fixture.project.id,
                }),
                "not_found"
              );
              await expectStaffError(
                staffRepository.listOwnerAssignments({
                  actorUserId: foreign.owner.id,
                  projectId: unknownProjectId,
                }),
                "not_found"
              );
              assert.deepEqual(
                await staffRepository.listAdminAssignments({
                  actorUserId: fixture.admin.id,
                  projectId: fixture.project.id,
                }),
                await staffRepository.listAdminAssignments({
                  actorUserId: fixture.admin.id,
                  projectId: unknownProjectId,
                })
              );
              await expectStaffError(
                staffRepository.propose({
                  actorUserId: fixture.admin.id,
                  projectId: unknownProjectId,
                  staffUserId: fixture.lawyer.id,
                  operationId: operationKey("unknown-project"),
                }),
                "not_found"
              );

              const revision = await projectRevision(sql, foreign.project.id);
              await foundationRepository.closeProject({
                actorUserId: foreign.owner.id,
                projectId: foreign.project.id,
                expectedRevision: revision,
                operationId: operationKey("close-before-propose"),
              });
              await expectStaffError(
                staffRepository.propose({
                  actorUserId: fixture.admin.id,
                  projectId: foreign.project.id,
                  staffUserId: foreign.lawyer.id,
                  operationId: operationKey("closed-project"),
                }),
                "not_found"
              );
            }
          );
        }
      );

      await t.test(
        "Group C — revocation, role changes, Project closure and terminal lifecycle",
        async (st) => {
          await st.test(
            "owner revocation, lawyer resignation and administrator revocation are terminal",
            async () => {
              const ownerRevocation = await createProjectFixture(sql);
              const ownerRevokedProposal = await propose(sql, {
                ownerId: ownerRevocation.owner.id,
                adminId: ownerRevocation.admin.id,
                lawyerId: ownerRevocation.lawyer.id,
                projectId: ownerRevocation.project.id,
              });
              await approve(sql, {
                ownerId: ownerRevocation.owner.id,
                projectId: ownerRevocation.project.id,
                assignment: ownerRevokedProposal.assignment,
              });
              await transition(sql, {
                actorUserId: ownerRevocation.lawyer.id,
                projectId: ownerRevocation.project.id,
                assignmentId: ownerRevokedProposal.assignment.assignmentId,
                action: "lawyer_accept",
              });
              const ownerRevoked = await transition(sql, {
                actorUserId: ownerRevocation.owner.id,
                projectId: ownerRevocation.project.id,
                assignmentId: ownerRevokedProposal.assignment.assignmentId,
                action: "owner_revoke",
              });
              assert.equal(ownerRevoked.assignment.assignmentStatus, "revoked");
              await expectStaffError(
                transition(sql, {
                  actorUserId: ownerRevocation.lawyer.id,
                  projectId: ownerRevocation.project.id,
                  assignmentId: ownerRevokedProposal.assignment.assignmentId,
                  action: "lawyer_accept",
                }),
                "state_conflict"
              );
              const [terminalBefore] = await sql<
                {
                  status: string;
                  terminalActorUserId: string;
                  terminalReasonCode: string;
                  terminalAt: string;
                }[]
              >`
                select
                  "status",
                  "terminalActorUserId"::text as "terminalActorUserId",
                  "terminalReasonCode",
                  "terminalAt"::text as "terminalAt"
                from "ProjectStaffAssignment"
                where "id" = ${ownerRevokedProposal.assignment.assignmentId}
              `;
              assert.ok(terminalBefore);
              assert.equal(terminalBefore.status, "revoked");
              assert.equal(
                terminalBefore.terminalActorUserId,
                ownerRevocation.owner.id
              );
              assert.equal(terminalBefore.terminalReasonCode, "owner_revoked");
              assert.ok(terminalBefore.terminalAt);
              await expectPostgresConstraint(
                () =>
                  sql`update "ProjectStaffAssignment" set "status" = 'active' where "id" = ${ownerRevokedProposal.assignment.assignmentId}`,
                "23514",
                "ProjectStaffAssignment_transition"
              );
              const [terminalAfter] = await sql<
                {
                  status: string;
                  terminalActorUserId: string;
                  terminalReasonCode: string;
                  terminalAt: string;
                }[]
              >`
                select
                  "status",
                  "terminalActorUserId"::text as "terminalActorUserId",
                  "terminalReasonCode",
                  "terminalAt"::text as "terminalAt"
                from "ProjectStaffAssignment"
                where "id" = ${ownerRevokedProposal.assignment.assignmentId}
              `;
              assert.deepEqual(terminalAfter, terminalBefore);

              const resignation = await createProjectFixture(sql);
              const resignationProposal = await propose(sql, {
                ownerId: resignation.owner.id,
                adminId: resignation.admin.id,
                lawyerId: resignation.lawyer.id,
                projectId: resignation.project.id,
              });
              await approve(sql, {
                ownerId: resignation.owner.id,
                projectId: resignation.project.id,
                assignment: resignationProposal.assignment,
              });
              await transition(sql, {
                actorUserId: resignation.lawyer.id,
                projectId: resignation.project.id,
                assignmentId: resignationProposal.assignment.assignmentId,
                action: "lawyer_accept",
              });
              const resigned = await transition(sql, {
                actorUserId: resignation.lawyer.id,
                projectId: resignation.project.id,
                assignmentId: resignationProposal.assignment.assignmentId,
                action: "lawyer_resign",
              });
              assert.equal(resigned.assignment.assignmentStatus, "revoked");

              const adminRevocation = await createProjectFixture(sql);
              const adminProposal = await propose(sql, {
                ownerId: adminRevocation.owner.id,
                adminId: adminRevocation.admin.id,
                lawyerId: adminRevocation.lawyer.id,
                projectId: adminRevocation.project.id,
              });
              await approve(sql, {
                ownerId: adminRevocation.owner.id,
                projectId: adminRevocation.project.id,
                assignment: adminProposal.assignment,
              });
              await transition(sql, {
                actorUserId: adminRevocation.lawyer.id,
                projectId: adminRevocation.project.id,
                assignmentId: adminProposal.assignment.assignmentId,
                action: "lawyer_accept",
              });
              const adminRevoked = await transition(sql, {
                actorUserId: adminRevocation.admin.id,
                projectId: adminRevocation.project.id,
                assignmentId: adminProposal.assignment.assignmentId,
                action: "admin_revoke",
              });
              assert.equal(adminRevoked.assignment.assignmentStatus, "revoked");

              const withdrawal = await createProjectFixture(sql);
              const withdrawalProposal = await propose(sql, {
                ownerId: withdrawal.owner.id,
                adminId: withdrawal.admin.id,
                lawyerId: withdrawal.lawyer.id,
                projectId: withdrawal.project.id,
              });
              const withdrawn = await transition(sql, {
                actorUserId: withdrawal.admin.id,
                projectId: withdrawal.project.id,
                assignmentId: withdrawalProposal.assignment.assignmentId,
                action: "admin_withdraw",
              });
              assert.equal(withdrawn.assignment.assignmentStatus, "withdrawn");
            }
          );

          await st.test(
            "current lawyer role and Project lifecycle are rechecked against database state",
            async () => {
              const demotion = await createProjectFixture(sql);
              const proposal = await propose(sql, {
                ownerId: demotion.owner.id,
                adminId: demotion.admin.id,
                lawyerId: demotion.lawyer.id,
                projectId: demotion.project.id,
              });
              await approve(sql, {
                ownerId: demotion.owner.id,
                projectId: demotion.project.id,
                assignment: proposal.assignment,
              });
              await transition(sql, {
                actorUserId: demotion.lawyer.id,
                projectId: demotion.project.id,
                assignmentId: proposal.assignment.assignmentId,
                action: "lawyer_accept",
              });
              await sql`update "User" set "role" = 'user' where "id" = ${demotion.lawyer.id}`;
              await expectStaffError(
                staffRepository.getStaffShell({
                  actorUserId: demotion.lawyer.id,
                  projectId: demotion.project.id,
                }),
                "not_found"
              );
              await transition(sql, {
                actorUserId: demotion.owner.id,
                projectId: demotion.project.id,
                assignmentId: proposal.assignment.assignmentId,
                action: "owner_revoke",
              });

              const closure = await createProjectFixture(sql);
              const closureProposal = await propose(sql, {
                ownerId: closure.owner.id,
                adminId: closure.admin.id,
                lawyerId: closure.lawyer.id,
                projectId: closure.project.id,
              });
              await approve(sql, {
                ownerId: closure.owner.id,
                projectId: closure.project.id,
                assignment: closureProposal.assignment,
              });
              await transition(sql, {
                actorUserId: closure.lawyer.id,
                projectId: closure.project.id,
                assignmentId: closureProposal.assignment.assignmentId,
                action: "lawyer_accept",
              });
              const currentRevision = await projectRevision(
                sql,
                closure.project.id
              );
              await foundationRepository.closeProject({
                actorUserId: closure.owner.id,
                projectId: closure.project.id,
                expectedRevision: currentRevision,
                operationId: operationKey("close"),
              });
              await expectStaffError(
                staffRepository.getStaffShell({
                  actorUserId: closure.lawyer.id,
                  projectId: closure.project.id,
                }),
                "not_found"
              );
              await expectStaffError(
                transition(sql, {
                  actorUserId: closure.lawyer.id,
                  projectId: closure.project.id,
                  assignmentId: closureProposal.assignment.assignmentId,
                  action: "lawyer_resign",
                }),
                "not_found"
              );
            }
          );
        }
      );

      await t.test(
        "Group D — idempotency, concurrency, revision conflicts and rollback",
        async (st) => {
          await st.test(
            "identical proposal and transition replays are stable; changed project and assignee conflict",
            async () => {
              const fixture = await createProjectFixture(sql);
              const key = operationKey("idem");
              const first = await propose(sql, {
                ownerId: fixture.owner.id,
                adminId: fixture.admin.id,
                lawyerId: fixture.lawyer.id,
                projectId: fixture.project.id,
                operationId: key,
              });
              const replay = await staffRepository.propose({
                actorUserId: fixture.admin.id,
                projectId: fixture.project.id,
                staffUserId: fixture.lawyer.id,
                operationId: key,
              });
              assert.deepEqual(replay, { accepted: true, replayed: true });
              const otherProject =
                await createProjectFoundationRepository().createProject({
                  actorUserId: fixture.owner.id,
                  operationId: operationKey("other-project"),
                });
              await expectStaffError(
                staffRepository.propose({
                  actorUserId: fixture.admin.id,
                  projectId: otherProject.project.id,
                  staffUserId: fixture.lawyer.id,
                  operationId: key,
                }),
                "idempotency_conflict"
              );
              const otherLawyer = await insertUser(sql, {
                label: "m4-idem-lawyer",
                role: "lawyer",
              });
              await expectStaffError(
                staffRepository.propose({
                  actorUserId: fixture.admin.id,
                  projectId: fixture.project.id,
                  staffUserId: otherLawyer.id,
                  operationId: key,
                }),
                "idempotency_conflict"
              );
              const foreignActor = await insertUser(sql, {
                label: "m4-cross-actor-admin",
                role: "admin",
              });
              await expectStaffError(
                staffRepository.propose({
                  actorUserId: foreignActor.id,
                  projectId: fixture.project.id,
                  staffUserId: fixture.lawyer.id,
                  operationId: key,
                }),
                "state_conflict"
              );
              const approvalKey = operationKey("approve-replay");
              const expectedProjectRevision = await projectRevision(
                sql,
                fixture.project.id
              );
              const operationsBeforeApproval = await countFor(
                sql,
                "ProjectOperation",
                {
                  column: "resultId",
                  value: first.assignment.assignmentId,
                }
              );
              assert.equal(operationsBeforeApproval, 1);
              const eventsBeforeApproval = await countFor(sql, "ProjectEvent", {
                column: "projectId",
                value: fixture.project.id,
              });
              const approval = await approve(sql, {
                ownerId: fixture.owner.id,
                projectId: fixture.project.id,
                assignment: first.assignment,
                operationId: approvalKey,
                expectedProjectRevision,
              });
              assert.equal(approval.replayed, false);
              const revisionAfterApproval = await projectRevision(
                sql,
                fixture.project.id
              );
              assert.equal(revisionAfterApproval, expectedProjectRevision + 1);
              const operationsAfterApproval = await countFor(
                sql,
                "ProjectOperation",
                {
                  column: "resultId",
                  value: first.assignment.assignmentId,
                }
              );
              const eventsAfterApproval = await countFor(sql, "ProjectEvent", {
                column: "projectId",
                value: fixture.project.id,
              });
              assert.equal(
                operationsAfterApproval,
                operationsBeforeApproval + 1
              );
              assert.equal(eventsAfterApproval, eventsBeforeApproval + 1);
              const approvalReplay = await approve(sql, {
                ownerId: fixture.owner.id,
                projectId: fixture.project.id,
                assignment: first.assignment,
                operationId: approvalKey,
                expectedProjectRevision,
              });
              assert.equal(approvalReplay.replayed, true);
              assert.equal(
                await projectRevision(sql, fixture.project.id),
                revisionAfterApproval
              );
              assert.equal(
                await countFor(sql, "ProjectOperation", {
                  column: "resultId",
                  value: first.assignment.assignmentId,
                }),
                operationsAfterApproval
              );
              assert.equal(
                await countFor(sql, "ProjectEvent", {
                  column: "projectId",
                  value: fixture.project.id,
                }),
                eventsAfterApproval
              );
              await assertAssignmentEvent(sql, {
                assignmentId: first.assignment.assignmentId,
                projectId: fixture.project.id,
                expectedType: "project_staff_assignment_owner_approved",
                expectedActorUserId: fixture.owner.id,
              });
            }
          );

          await st.test(
            "concurrent same-scope proposals produce exactly one live assignment",
            async () => {
              const fixture = await createProjectFixture(sql);
              const secondAdmin = await insertUser(sql, {
                label: "m4-race-admin",
                role: "admin",
              });
              const results = await Promise.allSettled([
                staffRepository.propose({
                  actorUserId: fixture.admin.id,
                  projectId: fixture.project.id,
                  staffUserId: fixture.lawyer.id,
                  operationId: operationKey("race-a"),
                }),
                staffRepository.propose({
                  actorUserId: secondAdmin.id,
                  projectId: fixture.project.id,
                  staffUserId: fixture.lawyer.id,
                  operationId: operationKey("race-b"),
                }),
              ]);
              assert.equal(
                results.filter((result) => result.status === "fulfilled")
                  .length,
                1
              );
              assert.equal(
                results.filter((result) => result.status === "rejected").length,
                1
              );
              const assignments = await sql<{ count: number }[]>`
            select count(*)::int as count from "ProjectStaffAssignment"
            where "projectId" = ${fixture.project.id} and "status" in ('proposed','owner_approved','active')
          `;
              assert.equal(assignments[0]?.count, 1);
              const operationCount = await sql<{ count: number }[]>`
            select count(*)::int as count
            from "ProjectOperation" operation
            join "ProjectStaffAssignment" assignment
              on assignment."id" = operation."resultId"
             and assignment."projectId" = ${fixture.project.id}
            where operation."operationType" = 'project_staff_assignment_propose'
              and operation."resultKind" = 'project_staff_assignment'
          `;
              assert.equal(operationCount[0]?.count, 1);
              const events = await sql<{ count: number }[]>`
            select count(*)::int as count from "ProjectEvent"
            where "projectId" = ${fixture.project.id} and "eventType" = 'project_staff_assignment_proposed'
          `;
              assert.equal(events[0]?.count, 1);
            }
          );

          await st.test(
            "concurrent approval/revocation and acceptance/revocation serialize to one committed transition",
            async () => {
              const ownerRace = await createProjectFixture(sql);
              const ownerRaceProposal = await propose(sql, {
                ownerId: ownerRace.owner.id,
                adminId: ownerRace.admin.id,
                lawyerId: ownerRace.lawyer.id,
                projectId: ownerRace.project.id,
              });
              const expected = await projectRevision(sql, ownerRace.project.id);
              const beforeOwnerRaceEvents = await countFor(
                sql,
                "ProjectEvent",
                { column: "projectId", value: ownerRace.project.id }
              );
              const ownerResults = await Promise.allSettled([
                transition(sql, {
                  actorUserId: ownerRace.owner.id,
                  projectId: ownerRace.project.id,
                  assignmentId: ownerRaceProposal.assignment.assignmentId,
                  action: "owner_approve",
                  expectedProjectRevision: expected,
                  proposalSha256: ownerRaceProposal.assignment.proposalSha256,
                  noticeVersion: ownerRaceProposal.assignment.noticeVersion,
                }),
                transition(sql, {
                  actorUserId: ownerRace.owner.id,
                  projectId: ownerRace.project.id,
                  assignmentId: ownerRaceProposal.assignment.assignmentId,
                  action: "owner_revoke",
                  expectedProjectRevision: expected,
                }),
              ]);
              assert.equal(
                ownerResults.filter((result) => result.status === "fulfilled")
                  .length,
                1
              );
              assert.equal(
                ownerResults.filter((result) => result.status === "rejected")
                  .length,
                1
              );
              assert.equal(
                await countFor(sql, "ProjectEvent", {
                  column: "projectId",
                  value: ownerRace.project.id,
                }),
                beforeOwnerRaceEvents + 1
              );
              assert.equal(
                await countFor(sql, "ProjectOperation", {
                  column: "resultId",
                  value: ownerRaceProposal.assignment.assignmentId,
                }),
                2
              );

              const acceptanceRace = await createProjectFixture(sql);
              const acceptanceProposal = await propose(sql, {
                ownerId: acceptanceRace.owner.id,
                adminId: acceptanceRace.admin.id,
                lawyerId: acceptanceRace.lawyer.id,
                projectId: acceptanceRace.project.id,
              });
              await approve(sql, {
                ownerId: acceptanceRace.owner.id,
                projectId: acceptanceRace.project.id,
                assignment: acceptanceProposal.assignment,
              });
              const acceptRevision = await projectRevision(
                sql,
                acceptanceRace.project.id
              );
              const beforeAcceptRaceEvents = await countFor(
                sql,
                "ProjectEvent",
                { column: "projectId", value: acceptanceRace.project.id }
              );
              const acceptanceResults = await Promise.allSettled([
                transition(sql, {
                  actorUserId: acceptanceRace.lawyer.id,
                  projectId: acceptanceRace.project.id,
                  assignmentId: acceptanceProposal.assignment.assignmentId,
                  action: "lawyer_accept",
                  expectedProjectRevision: acceptRevision,
                }),
                transition(sql, {
                  actorUserId: acceptanceRace.owner.id,
                  projectId: acceptanceRace.project.id,
                  assignmentId: acceptanceProposal.assignment.assignmentId,
                  action: "owner_revoke",
                  expectedProjectRevision: acceptRevision,
                }),
              ]);
              assert.equal(
                acceptanceResults.filter(
                  (result) => result.status === "fulfilled"
                ).length,
                1
              );
              assert.equal(
                acceptanceResults.filter(
                  (result) => result.status === "rejected"
                ).length,
                1
              );
              assert.equal(
                await countFor(sql, "ProjectEvent", {
                  column: "projectId",
                  value: acceptanceRace.project.id,
                }),
                beforeAcceptRaceEvents + 1
              );
              assert.equal(
                await countFor(sql, "ProjectOperation", {
                  column: "resultId",
                  value: acceptanceProposal.assignment.assignmentId,
                }),
                3
              );
              const [result] = await sql<{ status: string }[]>`
            select "status" from "ProjectStaffAssignment" where "id" = ${acceptanceProposal.assignment.assignmentId}
          `;
              assert.ok(
                result && ["active", "revoked"].includes(result.status)
              );
              if (result.status === "active") {
                await transition(sql, {
                  actorUserId: acceptanceRace.owner.id,
                  projectId: acceptanceRace.project.id,
                  assignmentId: acceptanceProposal.assignment.assignmentId,
                  action: "owner_revoke",
                });
              }
            }
          );

          await st.test(
            "stale revision and invalid owner snapshot roll back operation, assignment and event writes",
            async () => {
              const fixture = await createProjectFixture(sql);
              const proposal = await propose(sql, {
                ownerId: fixture.owner.id,
                adminId: fixture.admin.id,
                lawyerId: fixture.lawyer.id,
                projectId: fixture.project.id,
              });
              const staleRevision = await projectRevision(
                sql,
                fixture.project.id
              );
              await foundationRepository.createProjectChat({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                operationId: operationKey("revision-gap"),
                title: "Synthetic revision step",
              });
              const freshRevision = await projectRevision(
                sql,
                fixture.project.id
              );
              assert.equal(freshRevision, staleRevision + 1);
              const operationId = operationKey("stale-approve");
              const beforeEvents = await countFor(sql, "ProjectEvent", {
                column: "projectId",
                value: fixture.project.id,
              });
              const beforeOperations = await countFor(sql, "ProjectOperation", {
                column: "actorUserId",
                value: fixture.owner.id,
              });
              await expectStaffError(
                transition(sql, {
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  assignmentId: proposal.assignment.assignmentId,
                  action: "owner_approve",
                  expectedProjectRevision: staleRevision,
                  proposalSha256: proposal.assignment.proposalSha256,
                  noticeVersion: proposal.assignment.noticeVersion,
                  operationId,
                }),
                "revision_conflict"
              );
              assert.equal(
                await countFor(sql, "ProjectEvent", {
                  column: "projectId",
                  value: fixture.project.id,
                }),
                beforeEvents
              );
              assert.equal(
                await countFor(sql, "ProjectOperation", {
                  column: "actorUserId",
                  value: fixture.owner.id,
                }),
                beforeOperations
              );
              const [status] = await sql<{ status: string }[]>`
            select "status" from "ProjectStaffAssignment" where "id" = ${proposal.assignment.assignmentId}
          `;
              assert.equal(status?.status, "proposed");
              await expectStaffError(
                transition(sql, {
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  assignmentId: proposal.assignment.assignmentId,
                  action: "owner_approve",
                  proposalSha256: "0".repeat(64),
                  noticeVersion: proposal.assignment.noticeVersion,
                  operationId: operationKey("bad-snapshot"),
                }),
                "state_conflict"
              );
              assert.equal(
                await countFor(sql, "ProjectOperation", {
                  column: "actorUserId",
                  value: fixture.owner.id,
                }),
                beforeOperations
              );
            }
          );
        }
      );

      await t.test(
        "Group E — non-consecutive shared Project revision acceptance",
        async () => {
          const fixture = await createProjectFixture(sql);
          const proposal = await propose(sql, {
            ownerId: fixture.owner.id,
            adminId: fixture.admin.id,
            lawyerId: fixture.lawyer.id,
            projectId: fixture.project.id,
          });
          const proposalRevision = proposal.assignment.expectedProjectRevision;
          const chat = await foundationRepository.createProjectChat({
            actorUserId: fixture.owner.id,
            projectId: fixture.project.id,
            operationId: operationKey("unrelated-project-operation"),
            title: "Synthetic unrelated Project operation",
          });
          const [chatRow] = await sql<{ userId: string; visibility: string }[]>`
          select "userId", "visibility" from "Chat" where "id" = ${chat.chatId}
        `;
          assert.equal(chatRow?.userId, fixture.owner.id);
          assert.equal(chatRow?.visibility, "private");
          await expectFoundationError(
            foundationRepository.authorizeProjectAccess({
              actorUserId: fixture.lawyer.id,
              projectId: fixture.project.id,
              intent: "chat_history",
              chatId: chat.chatId,
            }),
            "project_forbidden"
          );
          const unrelatedRevision = await projectRevision(
            sql,
            fixture.project.id
          );
          assert.equal(unrelatedRevision, proposalRevision + 1);
          const approval = await approve(sql, {
            ownerId: fixture.owner.id,
            projectId: fixture.project.id,
            assignment: proposal.assignment,
          });
          assert.equal(
            approval.assignment.expectedProjectRevision,
            proposalRevision + 2
          );
          const [stored] = await sql<{ lastProjectRevision: number }[]>`
          select "lastProjectRevision" from "ProjectStaffAssignment" where "id" = ${proposal.assignment.assignmentId}
        `;
          assert.equal(stored?.lastProjectRevision, proposalRevision + 2);
          await assertAssignmentEvent(sql, {
            assignmentId: proposal.assignment.assignmentId,
            projectId: fixture.project.id,
            expectedType: "project_staff_assignment_owner_approved",
            expectedActorUserId: fixture.owner.id,
          });
          await assertCompleteEventLedger(sql, fixture.project.id);
        }
      );

      await t.test(
        "Group F — M1 membership, private Chat and M2 document authorization remain separate",
        async (st) => {
          await st.test(
            "staff assignment creates no membership and cannot authorize Chat or document access",
            async () => {
              const fixture = await createProjectFixture(sql);
              const proposal = await propose(sql, {
                ownerId: fixture.owner.id,
                adminId: fixture.admin.id,
                lawyerId: fixture.lawyer.id,
                projectId: fixture.project.id,
              });
              await approve(sql, {
                ownerId: fixture.owner.id,
                projectId: fixture.project.id,
                assignment: proposal.assignment,
              });
              await transition(sql, {
                actorUserId: fixture.lawyer.id,
                projectId: fixture.project.id,
                assignmentId: proposal.assignment.assignmentId,
                action: "lawyer_accept",
              });
              const membership = await sql<{ count: number }[]>`
            select count(*)::int as count from "ProjectMembership"
            where "projectId" = ${fixture.project.id} and "userId" = ${fixture.lawyer.id}
          `;
              assert.equal(membership[0]?.count, 0);
              assert.deepEqual(
                await foundationRepository.listProjects(fixture.lawyer.id),
                []
              );
              await expectFoundationError(
                foundationRepository.authorizeProjectAccess({
                  actorUserId: fixture.lawyer.id,
                  projectId: fixture.project.id,
                  intent: "project_write",
                }),
                "project_forbidden"
              );
              const member = await insertUser(sql, {
                label: "m4-private-chat-member",
                role: "user",
              });
              const ownerChat = await foundationRepository.createProjectChat({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                operationId: operationKey("owner-private-chat"),
                title: "Synthetic owner private Chat",
              });
              const membershipAt = new Date().toISOString();
              await sql`
                insert into "ProjectMembership" (
                  "projectId", "userId", "status", "invitedByUserId", "acceptedAt"
                ) values (
                  ${fixture.project.id}, ${member.id}, 'active',
                  ${fixture.owner.id}, ${membershipAt}
                )
              `;
              await expectFoundationError(
                foundationRepository.authorizeProjectAccess({
                  actorUserId: member.id,
                  projectId: fixture.project.id,
                  intent: "chat_history",
                  chatId: ownerChat.chatId,
                }),
                "project_forbidden"
              );
              const documentRepository = new PostgresProjectDocumentRepository({
                database: getLazyDatabase(),
                trustedPorts: {
                  verifyImportConsent: async () => null,
                  verifyGrantConsent: async () => null,
                  verifyStorageResult: async () => null,
                  verifyScanAttestation: async () => null,
                },
              });
              const revision = await projectRevision(sql, fixture.project.id);
              await assert.rejects(
                documentRepository.createDirectUploadIntent({
                  actorUserId: fixture.lawyer.id,
                  projectId: fixture.project.id,
                  operationId: operationKey("staff-document-attempt"),
                  expectedProjectRevision: revision,
                  metadata: {
                    sha256: "a".repeat(64),
                    byteSize: 1,
                    canonicalMime: "application/pdf",
                    formatId: "pdf",
                  },
                }),
                (error: unknown) =>
                  isErrorCode(
                    error,
                    ProjectDocumentPersistenceError,
                    "project_forbidden"
                  )
              );
            }
          );

          await st.test("default-off feature flag remains explicit", () => {
            assert.equal(projectStaffAssignmentsEnabled(), false);
            assert.equal(projectStaffAssignmentsEnabled("false"), false);
            assert.equal(projectStaffAssignmentsEnabled("true"), true);
          });
        }
      );
    } finally {
      await sql.end({ timeout: 5 });
      await closeLazyDatabase();
    }
  }
);
