// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions are scoped to this guarded database suite.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import {
  assertM4_003_MigrationLedger,
  expectedM4_003_Migration,
  type M4_003_MigrationJournal,
  M4_003_TEST_APPROVAL,
  parseM4_003_DatabaseUrl,
} from "../../scripts/phase13-m4-003-db-test-guard";
import { ProjectHumanMessagingError } from "../project-human-messaging/errors";
import {
  isProjectHumanMessagingEnabled,
  PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
  PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
  PROJECT_HUMAN_MESSAGING_PURPOSE,
} from "../project-human-messaging/policy";
import {
  authorizeProjectStaffDisclosure,
  PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
} from "../project-staff-assignments/policy";
import { createProjectFoundationRepository } from "./project-foundation";
import { createProjectHumanMessagingRepository } from "./project-human-messaging-repository";
import { createProjectStaffAssignmentRepository } from "./project-staff-assignment-repository";
import { closeLazyDatabase } from "./runtime-client";

const TEST_DATABASE_URL =
  process.env.PHASE13_M4_003_TEST_DATABASE_URL?.trim() ?? "";
const isGuardedRun =
  process.env.PHASE13_M4_003_TEST_RUNNER_VERIFIED === "1" &&
  process.env.PHASE13_M4_003_TEST_APPROVAL === M4_003_TEST_APPROVAL &&
  TEST_DATABASE_URL.length > 0;
const skipReason = isGuardedRun
  ? false
  : "M4-003 PostgreSQL integration requires its guarded launcher and separate owner approval";

function operationKey(label: string) {
  return `m4-003-db-${label}-${randomUUID()}`;
}

async function expectMessagingError(
  operation: Promise<unknown>,
  code: ProjectHumanMessagingError["code"]
) {
  await assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof ProjectHumanMessagingError && error.code === code
  );
}

const sqlStateCategories: Readonly<Record<string, string>> = {
  "23503": "foreign-key violation",
  "23505": "unique violation",
  "23514": "check violation",
  "40001": "serialization failure",
  "40P01": "deadlock detected",
  "55P03": "lock unavailable",
};

function safeFailureCategory(error: unknown) {
  if (error instanceof ProjectHumanMessagingError) {
    return `application:${error.code}`;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[0-9A-Z]{5}$/u.test(error.code)
  ) {
    return `SQLSTATE ${error.code} (${sqlStateCategories[error.code] ?? "PostgreSQL error"})`;
  }
  return "non-PostgreSQL error";
}

function requireFulfilled<T>(
  result: PromiseSettledResult<T>,
  label: string
): T {
  if (result.status === "rejected") {
    assert.fail(
      `${label} unexpectedly rejected (${safeFailureCategory(result.reason)})`
    );
  }
  return result.value;
}

function resolveSendRace<T>(
  result: PromiseSettledResult<T>,
  label: string
): { sent: true; value: T } | { sent: false } {
  if (result.status === "fulfilled") {
    return { sent: true, value: result.value };
  }
  if (
    result.reason instanceof ProjectHumanMessagingError &&
    result.reason.code === "not_found"
  ) {
    return { sent: false };
  }
  assert.fail(
    `${label} unexpectedly rejected (${safeFailureCategory(result.reason)})`
  );
}

async function assertSendOperationState(
  sql: ReturnType<typeof postgres>,
  input: {
    actorUserId: string;
    operationId: string;
    body: string;
    sent: { messageId: string; sequence: number } | null;
  }
) {
  const rows = [
    ...(await sql<
      {
        operationType: string;
        resultKind: string;
        resultId: string;
        messageId: string | null;
        sequence: number | null;
        authorUserId: string | null;
        body: string | null;
      }[]
    >`
      select
        operation."operationType" as "operationType",
        operation."resultKind" as "resultKind",
        operation."resultId" as "resultId",
        message."id" as "messageId",
        message."sequence" as "sequence",
        message."authorUserId" as "authorUserId",
        message."body" as "body"
      from "ProjectOperation" operation
      left join "ProjectHumanMessage" message
        on message."operationRecordId" = operation."id"
      where operation."actorUserId" = ${input.actorUserId}
        and operation."operationId" = ${input.operationId}
        and operation."operationType" = 'project_human_message_send'
    `),
  ];
  if (!input.sent) {
    assert.deepEqual(rows, []);
    return;
  }
  assert.deepEqual(rows, [
    {
      operationType: "project_human_message_send",
      resultKind: "project_human_message",
      resultId: input.sent.messageId,
      messageId: input.sent.messageId,
      sequence: input.sent.sequence,
      authorUserId: input.actorUserId,
      body: input.body,
    },
  ]);
}

async function expectPostgresConstraint(
  operation: () => Promise<unknown>,
  code: string,
  constraintName: string
) {
  await assert.rejects(operation(), (error: unknown) => {
    assert.ok(error instanceof Error);
    const postgresError = error as Error & {
      code?: string;
      constraint_name?: string;
    };
    assert.equal(postgresError.code, code);
    assert.equal(postgresError.constraint_name, constraintName);
    return true;
  });
}

async function insertUser(
  sql: ReturnType<typeof postgres>,
  role: "user" | "lawyer" | "admin",
  label: string
) {
  const email = `${label}-${randomUUID().replaceAll("-", "").slice(0, 20)}@example.test`;
  const [row] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password", "role", "emailVerifiedAt")
    values (
      ${email}, ${"x".repeat(64)}, ${role},
      ${role === "lawyer" ? new Date().toISOString() : null}
    )
    returning "id"
  `;
  assert.ok(row?.id);
  return { id: row.id, email };
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

async function createFixture(sql: ReturnType<typeof postgres>) {
  const owner = await insertUser(sql, "user", "m4-003-owner");
  const admin = await insertUser(sql, "admin", "m4-003-admin");
  const lawyer = await insertUser(sql, "lawyer", "m4-003-lawyer");
  const otherLawyer = await insertUser(sql, "lawyer", "m4-003-other-lawyer");
  const member = await insertUser(sql, "user", "m4-003-member");
  const projectResult = await createProjectFoundationRepository().createProject(
    {
      actorUserId: owner.id,
      operationId: operationKey("project"),
    }
  );
  const project = projectResult.project;
  const staff = createProjectStaffAssignmentRepository();
  await staff.propose({
    actorUserId: admin.id,
    projectId: project.id,
    staffUserId: lawyer.id,
    operationId: operationKey("proposal"),
  });
  const [proposal] = await staff.listOwnerAssignments({
    actorUserId: owner.id,
    projectId: project.id,
  });
  assert.ok(proposal?.proposalSha256);
  await staff.transition({
    actorUserId: owner.id,
    projectId: project.id,
    assignmentId: proposal.assignmentId,
    action: "owner_approve",
    expectedProjectRevision: await projectRevision(sql, project.id),
    proposalSha256: proposal.proposalSha256,
    noticeVersion: PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
    operationId: operationKey("owner-approval"),
  });
  await staff.transition({
    actorUserId: lawyer.id,
    projectId: project.id,
    assignmentId: proposal.assignmentId,
    action: "lawyer_accept",
    expectedProjectRevision: await projectRevision(sql, project.id),
    operationId: operationKey("lawyer-acceptance"),
  });
  return {
    owner,
    admin,
    lawyer,
    otherLawyer,
    member,
    project,
    assignment: proposal,
    staff,
    messaging: createProjectHumanMessagingRepository(),
  };
}

async function createThread(
  sql: ReturnType<typeof postgres>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  operationId = operationKey("consent-create")
) {
  const result = await fixture.messaging.createThread({
    actorUserId: fixture.owner.id,
    projectId: fixture.project.id,
    assignmentId: fixture.assignment.assignmentId,
    lawyerUserId: fixture.lawyer.id,
    expectedProjectRevision: await projectRevision(sql, fixture.project.id),
    operationId,
  });
  assert.ok("threadId" in result);
  return { result, thread: result };
}

async function assertProjectEventLedger(
  sql: ReturnType<typeof postgres>,
  projectId: string
) {
  const revision = await projectRevision(sql, projectId);
  const rows = await sql<{ revision: number; eventCount: number }[]>`
    select expected.revision, count(event."id")::int as "eventCount"
    from generate_series(1, ${revision}) as expected(revision)
    left join "ProjectEvent" event
      on event."projectId" = ${projectId}
     and event."projectRevision" = expected.revision
    group by expected.revision
    order by expected.revision
  `;
  assert.equal(rows.length, revision);
  assert.ok(rows.every((row) => row.eventCount === 1));
}

async function assertRuntimeIdentity(sql: ReturnType<typeof postgres>) {
  const parsed = parseM4_003_DatabaseUrl(TEST_DATABASE_URL);
  assert.equal(process.env.POSTGRES_URL, TEST_DATABASE_URL);
  const [identity] = await sql<
    {
      database: string;
      role: string;
      serverVersion: number;
      canLogin: boolean;
      isSuperuser: boolean;
      canCreateDatabase: boolean;
      canCreateRole: boolean;
    }[]
  >`
    select current_database() as database,
           current_user as role,
           current_setting('server_version_num')::int as "serverVersion",
           role_row.rolcanlogin as "canLogin",
           role_row.rolsuper as "isSuperuser",
           role_row.rolcreatedb as "canCreateDatabase",
           role_row.rolcreaterole as "canCreateRole"
    from pg_roles role_row where role_row.rolname = current_user
  `;
  assert.equal(identity?.database, parsed.database);
  assert.equal(identity?.role, parsed.role);
  assert.ok(
    identity &&
      identity.serverVersion >= 170_000 &&
      identity.serverVersion < 180_000 &&
      identity.canLogin &&
      !identity.isSuperuser &&
      !identity.canCreateDatabase &&
      !identity.canCreateRole
  );
  const journal = JSON.parse(
    await readFile(resolve("lib/db/migrations/meta/_journal.json"), "utf8")
  ) as M4_003_MigrationJournal;
  const migration = await readFile(
    resolve("lib/db/migrations/0042_phase13_m4_003_human_messaging.sql"),
    "utf8"
  );
  const expected = expectedM4_003_Migration(journal, migration);
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
  assertM4_003_MigrationLedger({
    rowCount: ledger.rowCount,
    latestId: ledger.latestId,
    latestHash: ledger.latestHash,
    latestCreatedAt: Number(ledger.latestCreatedAt),
    expected,
  });
}

function byCount(
  table:
    | "ProjectHumanThread"
    | "ProjectThreadParticipationConsent"
    | "ProjectHumanMessage"
    | "ProjectOperation"
    | "ProjectEvent"
) {
  return table;
}

async function countRows(
  sql: ReturnType<typeof postgres>,
  table: ReturnType<typeof byCount>,
  column: "projectId" | "id" | "resultId" | "operationRecordId",
  value: string
) {
  const allowed: Record<string, readonly string[]> = {
    ProjectHumanThread: ["projectId", "id"],
    ProjectThreadParticipationConsent: ["projectId", "id"],
    ProjectHumanMessage: ["projectId", "id", "operationRecordId"],
    ProjectOperation: ["resultId", "id"],
    ProjectEvent: ["projectId", "id", "operationRecordId"],
  };
  assert.ok(allowed[table]?.includes(column));
  const [row] = (await sql.unsafe(
    `select count(*)::int as count from "${table}" where "${column}" = $1`,
    [value]
  )) as unknown as Array<{ count: number }>;
  return row?.count ?? 0;
}

async function makeThreadForLawyer(
  sql: ReturnType<typeof postgres>,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  lawyerId: string
) {
  const staff = createProjectStaffAssignmentRepository();
  await staff.propose({
    actorUserId: fixture.admin.id,
    projectId: fixture.project.id,
    staffUserId: lawyerId,
    operationId: operationKey("extra-proposal"),
  });
  const proposals = await staff.listOwnerAssignments({
    actorUserId: fixture.owner.id,
    projectId: fixture.project.id,
  });
  const proposal = proposals.find((row) => row.staffUserId === lawyerId);
  assert.ok(proposal?.proposalSha256);
  await staff.transition({
    actorUserId: fixture.owner.id,
    projectId: fixture.project.id,
    assignmentId: proposal.assignmentId,
    action: "owner_approve",
    expectedProjectRevision: await projectRevision(sql, fixture.project.id),
    proposalSha256: proposal.proposalSha256,
    noticeVersion: PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
    operationId: operationKey("extra-owner-approval"),
  });
  await staff.transition({
    actorUserId: lawyerId,
    projectId: fixture.project.id,
    assignmentId: proposal.assignmentId,
    action: "lawyer_accept",
    expectedProjectRevision: await projectRevision(sql, fixture.project.id),
    operationId: operationKey("extra-lawyer-acceptance"),
  });
  return {
    assignmentId: proposal.assignmentId,
    lawyerId,
    owner: fixture.owner,
    project: fixture.project,
    messaging: fixture.messaging,
  };
}

async function createThreadForAssignment(
  sql: ReturnType<typeof postgres>,
  input: {
    ownerId: string;
    projectId: string;
    assignmentId: string;
    lawyerId: string;
    messaging: ReturnType<typeof createProjectHumanMessagingRepository>;
  }
) {
  return input.messaging.createThread({
    actorUserId: input.ownerId,
    projectId: input.projectId,
    assignmentId: input.assignmentId,
    lawyerUserId: input.lawyerId,
    expectedProjectRevision: await projectRevision(sql, input.projectId),
    operationId: operationKey("extra-consent"),
  });
}

test(
  "Phase 13 M4-003 guarded isolated PostgreSQL integration",
  { skip: skipReason },
  async (t) => {
    assert.ok(isGuardedRun);
    parseM4_003_DatabaseUrl(TEST_DATABASE_URL);
    const sql = postgres(TEST_DATABASE_URL, {
      max: 16,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
      onnotice: () => undefined,
    });
    try {
      await assertRuntimeIdentity(sql);

      await t.test("Group A — schema and SQL integrity", async (st) => {
        await st.test(
          "tables and columns match the migration contract",
          async () => {
            const tables = [
              "ProjectHumanThread",
              "ProjectThreadParticipationConsent",
              "ProjectHumanMessage",
            ];
            const rows = await sql<{ tableName: string; columnName: string }[]>`
            select table_name as "tableName", column_name as "columnName"
            from information_schema.columns
            where table_schema = 'public'
              and table_name in (
                'ProjectHumanThread',
                'ProjectThreadParticipationConsent',
                'ProjectHumanMessage'
              )
          `;
            const columns = new Map<string, Set<string>>();
            for (const row of rows) {
              const present = columns.get(row.tableName) ?? new Set<string>();
              present.add(row.columnName);
              columns.set(row.tableName, present);
            }
            assert.deepEqual([...columns.keys()].sort(), [...tables].sort());
            for (const [table, required] of Object.entries({
              ProjectHumanThread: [
                "id",
                "projectId",
                "ownerUserId",
                "assignmentId",
                "lawyerUserId",
                "purpose",
                "noticeVersion",
                "noticeSha256",
                "status",
                "lastMessageSequence",
                "createdAt",
              ],
              ProjectThreadParticipationConsent: [
                "id",
                "threadId",
                "projectId",
                "ownerUserId",
                "assignmentId",
                "lawyerUserId",
                "status",
                "acceptedByUserId",
                "acceptedAt",
                "createdOperationRecordId",
                "createdProjectRevision",
                "withdrawnByUserId",
                "withdrawnAt",
                "withdrawnOperationRecordId",
                "withdrawnProjectRevision",
              ],
              ProjectHumanMessage: [
                "id",
                "threadId",
                "projectId",
                "sequence",
                "authorUserId",
                "operationRecordId",
                "body",
                "createdAt",
              ],
            })) {
              for (const column of required) {
                assert.ok(
                  columns.get(table)?.has(column),
                  `${table}.${column}`
                );
              }
            }
          }
        );

        await st.test(
          "indexes, foreign keys, checks and triggers are installed",
          async () => {
            const indexes = await sql<{ indexName: string }[]>`
            select indexname as "indexName" from pg_indexes
            where schemaname = 'public'
              and tablename in (
                'ProjectHumanThread',
                'ProjectThreadParticipationConsent',
                'ProjectHumanMessage'
              )
          `;
            const indexNames = new Set(indexes.map((row) => row.indexName));
            for (const index of [
              "ProjectHumanMessage_thread_sequence_unique",
              "ProjectHumanMessage_operation_unique",
              "ProjectHumanThread_project_created_idx",
              "ProjectThreadParticipationConsent_thread_unique",
              "ProjectThreadParticipationConsent_created_operation_unique",
              "ProjectThreadParticipationConsent_withdrawn_operation_unique",
            ]) {
              assert.ok(indexNames.has(index), index);
            }
            const constraints = await sql<
              { constraintName: string; type: string }[]
            >`
            select conname as "constraintName", contype as type
            from pg_constraint
            where conrelid in (
              'public."ProjectHumanThread"'::regclass,
              'public."ProjectThreadParticipationConsent"'::regclass,
              'public."ProjectHumanMessage"'::regclass
            )
          `;
            const byName = new Map(
              constraints.map((row) => [row.constraintName, row.type])
            );
            for (const constraint of [
              "ProjectHumanThread_project_owner_fk",
              "ProjectHumanThread_assignment_identity_fk",
              "ProjectThreadParticipationConsent_thread_identity_fk",
              "ProjectHumanMessage_thread_project_fk",
              "ProjectHumanMessage_body_check",
              "ProjectThreadParticipationConsent_lifecycle_check",
            ]) {
              assert.ok(byName.has(constraint), constraint);
            }
            assert.equal(
              byName.get("ProjectHumanMessage_thread_project_fk"),
              "f"
            );
            assert.equal(byName.get("ProjectHumanMessage_body_check"), "c");
            const triggers = await sql<
              {
                triggerName: string;
                deferrable: boolean;
                initiallyDeferred: boolean;
              }[]
            >`
            select tgname as "triggerName",
                   tgdeferrable as deferrable,
                   tginitdeferred as "initiallyDeferred"
            from pg_trigger
            where not tgisinternal
              and tgname in (
                'ProjectHumanThread_guard',
                'ProjectThreadParticipationConsent_guard',
                'ProjectHumanMessage_guard',
                'ProjectHumanConsentEvent_binding',
                'ProjectHumanMessagingOperation_complete',
                'ProjectHumanThread_complete'
              )
          `;
            const triggerByName = new Map(
              triggers.map((row) => [row.triggerName, row])
            );
            for (const trigger of [
              "ProjectHumanThread_guard",
              "ProjectThreadParticipationConsent_guard",
              "ProjectHumanMessage_guard",
              "ProjectHumanConsentEvent_binding",
              "ProjectHumanMessagingOperation_complete",
              "ProjectHumanThread_complete",
            ]) {
              assert.ok(triggerByName.has(trigger), trigger);
            }
            for (const deferred of [
              "ProjectHumanMessagingOperation_complete",
              "ProjectHumanThread_complete",
            ]) {
              assert.deepEqual(triggerByName.get(deferred), {
                triggerName: deferred,
                deferrable: true,
                initiallyDeferred: true,
              });
            }
          }
        );

        await st.test(
          "deferred operation completeness rejects an orphan operation",
          async () => {
            const actor = await insertUser(
              sql,
              "user",
              "m4-003-deferred-actor"
            );
            const operationResultId = randomUUID();
            await expectPostgresConstraint(
              () =>
                sql.begin(async (tx) => {
                  await tx`
                  insert into "ProjectOperation" (
                    "actorUserId", "actorKind", "servicePrincipalCode",
                    "operationType", "operationId", "requestHash",
                    "resultKind", "resultId"
                  ) values (
                    ${actor.id}, 'user', null, 'project_human_message_send',
                    ${operationKey("orphan-operation")}, ${"a".repeat(64)},
                    'project_human_message', ${operationResultId}
                  )
                `;
                  await tx`set constraints "ProjectHumanMessagingOperation_complete" immediate`;
                  throw new Error(
                    "expected deferred trigger to reject before this line"
                  );
                }),
              "23514",
              "ProjectHumanMessageOperation_result_required"
            );
            assert.equal(
              await countRows(
                sql,
                byCount("ProjectOperation"),
                "resultId",
                operationResultId
              ),
              0
            );
          }
        );

        await st.test(
          "deferred thread completeness rejects missing consent",
          async () => {
            const fixture = await createFixture(sql);
            const threadId = randomUUID();
            await expectPostgresConstraint(
              () =>
                sql.begin(async (tx) => {
                  await tx`
                  insert into "ProjectHumanThread" (
                    "id", "projectId", "ownerUserId", "assignmentId",
                    "lawyerUserId", "purpose", "noticeVersion", "noticeSha256",
                    "status", "lastMessageSequence", "createdAt"
                  ) values (
                    ${threadId}, ${fixture.project.id}, ${fixture.owner.id},
                    ${fixture.assignment.assignmentId}, ${fixture.lawyer.id},
                    ${PROJECT_HUMAN_MESSAGING_PURPOSE},
                    ${PROJECT_HUMAN_MESSAGING_NOTICE_VERSION},
                    ${PROJECT_HUMAN_MESSAGING_NOTICE_SHA256},
                    'active', 0, ${new Date().toISOString()}
                  )
                `;
                  await tx`set constraints "ProjectHumanThread_complete" immediate`;
                  throw new Error(
                    "expected deferred trigger to reject before this line"
                  );
                }),
              "23514",
              "ProjectHumanThread_consent_required"
            );
            assert.equal(
              await countRows(
                sql,
                byCount("ProjectHumanThread"),
                "id",
                threadId
              ),
              0
            );
          }
        );

        await st.test(
          "thread and consent identities are immutable and operation actors stay user-scoped",
          async () => {
            const fixture = await createFixture(sql);
            const { result: thread } = await createThread(sql, fixture);
            await expectPostgresConstraint(
              () =>
                sql`update "ProjectHumanThread" set "ownerUserId" = ${fixture.otherLawyer.id} where "id" = ${thread.threadId}`,
              "23514",
              "ProjectHumanThread_identity_immutable"
            );
            const [consent] = await sql<{ id: string }[]>`
              select "id" from "ProjectThreadParticipationConsent"
              where "threadId" = ${thread.threadId}
            `;
            assert.ok(consent?.id);
            await expectPostgresConstraint(
              () =>
                sql`update "ProjectThreadParticipationConsent" set "lawyerUserId" = ${fixture.otherLawyer.id} where "id" = ${consent.id}`,
              "23514",
              "ProjectThreadParticipationConsent_transition"
            );
            const invalidServiceOperationId = randomBytes(32).toString("hex");
            await expectPostgresConstraint(
              () =>
                sql`
                  insert into "ProjectOperation" (
                    "actorUserId", "actorKind", "servicePrincipalCode",
                    "operationType", "operationId", "requestHash",
                    "resultKind", "resultId"
                  ) values (
                    null, 'service', 'project_document_storage_worker',
                    'project_human_message_send',
                    ${invalidServiceOperationId}, ${"b".repeat(64)},
                    'project_human_message', ${randomUUID()}
                  )
                `,
              "23514",
              "ProjectOperation_actor_type_check"
            );
            const [invalidOperationCount] = await sql<{ count: number }[]>`
              select count(*)::int as count from "ProjectOperation"
              where "operationId" = ${invalidServiceOperationId}
            `;
            assert.equal(invalidOperationCount?.count, 0);
            const [identity] = await sql<
              { ownerUserId: string; lawyerUserId: string }[]
            >`
              select t."ownerUserId", c."lawyerUserId"
              from "ProjectHumanThread" t
              join "ProjectThreadParticipationConsent" c on c."threadId" = t."id"
              where t."id" = ${thread.threadId}
            `;
            assert.equal(identity?.ownerUserId, fixture.owner.id);
            assert.equal(identity?.lawyerUserId, fixture.lawyer.id);
          }
        );
      });

      await t.test(
        "Group B — thread creation and consent identity",
        async (st) => {
          await st.test(
            "owner consent creates one exact assignment-bound thread and revision event",
            async () => {
              const fixture = await createFixture(sql);
              const beforeRevision = await projectRevision(
                sql,
                fixture.project.id
              );
              const operationId = operationKey("create-replay");
              const first = await createThread(sql, fixture, operationId);
              assert.equal(first.result.replayed, false);
              assert.equal(first.result.consentStatus, "active");
              assert.equal(
                first.result.assignmentId,
                fixture.assignment.assignmentId
              );
              assert.equal(first.result.lawyerUserId, fixture.lawyer.id);
              assert.equal(
                first.result.purpose,
                PROJECT_HUMAN_MESSAGING_PURPOSE
              );
              assert.equal(
                first.result.noticeVersion,
                PROJECT_HUMAN_MESSAGING_NOTICE_VERSION
              );
              const consentId = await sql<{ id: string }[]>`
            select "id" from "ProjectThreadParticipationConsent"
            where "threadId" = ${first.result.threadId}
          `;
              const operation = await sql<
                {
                  resultId: string;
                  operationType: string;
                  resultKind: string;
                }[]
              >`
            select "resultId", "operationType", "resultKind"
            from "ProjectOperation"
            where "actorUserId" = ${fixture.owner.id}
              and "operationId" = ${operationId}
          `;
              assert.equal(consentId.length, 1);
              assert.deepEqual(operation[0], {
                resultId: consentId[0]?.id,
                operationType: "project_thread_participation_consent_create",
                resultKind: "project_thread_participation_consent",
              });
              const events = await sql<
                {
                  projectRevision: number;
                  subjectId: string;
                  eventType: string;
                }[]
              >`
            select "projectRevision", "subjectId", "eventType"
            from "ProjectEvent" where "projectId" = ${fixture.project.id}
              and "eventType" = 'project_thread_participation_consent_created'
              and "subjectId" = ${consentId[0]?.id}
          `;
              assert.equal(events.length, 1);
              assert.equal(events[0]?.projectRevision, beforeRevision + 1);
              assert.equal(
                events[0]?.eventType,
                "project_thread_participation_consent_created"
              );
              assert.equal(
                await projectRevision(sql, fixture.project.id),
                beforeRevision + 1
              );
              const replay = await fixture.messaging.createThread({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                assignmentId: fixture.assignment.assignmentId,
                lawyerUserId: fixture.lawyer.id,
                expectedProjectRevision: beforeRevision,
                operationId,
              });
              assert.equal(replay.replayed, true);
              assert.equal(replay.threadId, first.result.threadId);
              assert.equal(
                await projectRevision(sql, fixture.project.id),
                beforeRevision + 1
              );
              await assertProjectEventLedger(sql, fixture.project.id);
            }
          );

          await st.test(
            "only the owner can create consent for the exact active assignment recipient",
            async () => {
              const fixture = await createFixture(sql);
              const invite =
                await createProjectFoundationRepository().inviteProjectMember({
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  targetUserId: fixture.member.id,
                  expectedRevision: await projectRevision(
                    sql,
                    fixture.project.id
                  ),
                  operationId: operationKey("creation-denial-member-invite"),
                });
              const [membership] = await sql<{ id: string }[]>`
              select "id" from "ProjectMembership"
              where "projectId" = ${fixture.project.id} and "userId" = ${fixture.member.id}
            `;
              assert.ok(membership?.id);
              await createProjectFoundationRepository().acceptProjectMembership(
                {
                  actorUserId: fixture.member.id,
                  projectId: fixture.project.id,
                  membershipId: membership.id,
                  expectedRevision: invite.project.revision,
                  operationId: operationKey("creation-denial-member-accept"),
                }
              );
              const revision = await projectRevision(sql, fixture.project.id);
              for (const actorUserId of [
                fixture.lawyer.id,
                fixture.admin.id,
                fixture.member.id,
              ]) {
                await expectMessagingError(
                  fixture.messaging.createThread({
                    actorUserId,
                    projectId: fixture.project.id,
                    assignmentId: fixture.assignment.assignmentId,
                    lawyerUserId: fixture.lawyer.id,
                    expectedProjectRevision: revision,
                    operationId: operationKey("non-owner-create-denied"),
                  }),
                  "not_found"
                );
              }
              await expectMessagingError(
                fixture.messaging.createThread({
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  assignmentId: fixture.assignment.assignmentId,
                  lawyerUserId: fixture.otherLawyer.id,
                  expectedProjectRevision: revision,
                  operationId: operationKey("wrong-recipient-create-denied"),
                }),
                "not_found"
              );
              assert.equal(
                await projectRevision(sql, fixture.project.id),
                revision
              );
            }
          );
        }
      );

      await t.test(
        "Group C — messages, immutable bodies, replay and pagination",
        async (st) => {
          await st.test(
            "owner and lawyer sends are sequenced, replay-safe and revision-neutral",
            async () => {
              const fixture = await createFixture(sql);
              const { result: thread } = await createThread(sql, fixture);
              const revision = await projectRevision(sql, fixture.project.id);
              const ownerOperationId = operationKey("owner-message");
              const ownerSend = await fixture.messaging.sendMessage({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                operationId: ownerOperationId,
                body: "Owner message one",
              });
              assert.equal(ownerSend.replayed, false);
              assert.equal(ownerSend.sequence, 1);
              const lawyerOperationId = operationKey("lawyer-message");
              const lawyerSend = await fixture.messaging.sendMessage({
                actorUserId: fixture.lawyer.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                operationId: lawyerOperationId,
                body: "Lawyer message two",
              });
              assert.equal(lawyerSend.sequence, 2);
              const replay = await fixture.messaging.sendMessage({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                operationId: ownerOperationId,
                body: "Owner message one",
              });
              assert.equal(replay.replayed, true);
              assert.equal(replay.messageId, ownerSend.messageId);
              assert.equal(replay.sequence, 1);
              await expectMessagingError(
                fixture.messaging.sendMessage({
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                  operationId: ownerOperationId,
                  body: "Changed request body",
                }),
                "idempotency_conflict"
              );
              const messages = await sql<
                { sequence: number; authorUserId: string; body: string }[]
              >`
            select "sequence", "authorUserId", "body"
            from "ProjectHumanMessage" where "threadId" = ${thread.threadId}
            order by "sequence"
          `;
              assert.deepEqual(
                [...messages],
                [
                  {
                    sequence: 1,
                    authorUserId: fixture.owner.id,
                    body: "Owner message one",
                  },
                  {
                    sequence: 2,
                    authorUserId: fixture.lawyer.id,
                    body: "Lawyer message two",
                  },
                ]
              );
              assert.equal(
                await projectRevision(sql, fixture.project.id),
                revision
              );
              assert.equal(
                await countRows(
                  sql,
                  byCount("ProjectEvent"),
                  "projectId",
                  fixture.project.id
                ),
                await projectRevision(sql, fixture.project.id)
              );
              const messageEventCount = await sql<{ count: number }[]>`
            select count(event."id")::int as count
            from "ProjectEvent" event
            join "ProjectOperation" operation
              on operation."id" = event."operationRecordId"
            where operation."resultId" = ${ownerSend.messageId}
          `;
              assert.equal(messageEventCount[0]?.count, 0);
              const firstPage = await fixture.messaging.listMessages({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                limit: 1,
              });
              assert.equal(firstPage.items.length, 1);
              assert.equal(firstPage.items[0]?.sequence, 2);
              assert.equal(firstPage.hasMore, true);
              assert.equal(firstPage.nextBeforeSequence, 2);
              const nextPage = await fixture.messaging.listMessages({
                actorUserId: fixture.lawyer.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                beforeSequence: firstPage.nextBeforeSequence ?? undefined,
                limit: 1,
              });
              assert.deepEqual(
                nextPage.items.map((message) => message.sequence),
                [1]
              );
              assert.equal(nextPage.hasMore, false);
              assert.equal(nextPage.nextBeforeSequence, null);
              await assertProjectEventLedger(sql, fixture.project.id);
            }
          );

          await st.test(
            "stored message bodies are immutable under SQL",
            async () => {
              const fixture = await createFixture(sql);
              const { result: thread } = await createThread(sql, fixture);
              const sent = await fixture.messaging.sendMessage({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                operationId: operationKey("immutable-message"),
                body: "Immutable body",
              });
              await expectPostgresConstraint(
                () =>
                  sql`update "ProjectHumanMessage" set "body" = 'changed' where "id" = ${sent.messageId}`,
                "23514",
                "ProjectHumanMessage_immutable"
              );
              const [row] = await sql<{ body: string }[]>`
            select "body" from "ProjectHumanMessage" where "id" = ${sent.messageId}
          `;
              assert.equal(row?.body, "Immutable body");
            }
          );
        }
      );

      await t.test(
        "Group D — consent withdrawal and exact Operation result binding",
        async (st) => {
          await st.test(
            "withdrawal commits against Consent.id and identical replay mutates nothing",
            async () => {
              const fixture = await createFixture(sql);
              const { result: thread } = await createThread(sql, fixture);
              const [consentBefore] = await sql<
                { id: string; status: string; withdrawnAt: Date | null }[]
              >`
            select "id", "status", "withdrawnAt"
            from "ProjectThreadParticipationConsent" where "threadId" = ${thread.threadId}
          `;
              assert.ok(consentBefore);
              const expectedRevision = await projectRevision(
                sql,
                fixture.project.id
              );
              const operationId = operationKey("withdraw-replay");
              const first = await fixture.messaging.withdrawConsent({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                expectedProjectRevision: expectedRevision,
                operationId,
              });
              assert.equal(first.replayed, false);
              assert.equal(first.consentStatus, "withdrawn");
              const operation = await sql<
                {
                  resultId: string;
                  operationType: string;
                  resultKind: string;
                }[]
              >`
            select "resultId", "operationType", "resultKind"
            from "ProjectOperation"
            where "actorUserId" = ${fixture.owner.id} and "operationId" = ${operationId}
          `;
              assert.deepEqual(operation[0], {
                resultId: consentBefore.id,
                operationType: "project_thread_participation_consent_withdraw",
                resultKind: "project_thread_participation_consent",
              });
              assert.equal(
                await countRows(
                  sql,
                  byCount("ProjectEvent"),
                  "projectId",
                  fixture.project.id
                ),
                expectedRevision + 1
              );
              const beforeReplay = {
                revision: await projectRevision(sql, fixture.project.id),
                operations: await countRows(
                  sql,
                  byCount("ProjectOperation"),
                  "resultId",
                  consentBefore.id
                ),
                events: await countRows(
                  sql,
                  byCount("ProjectEvent"),
                  "projectId",
                  fixture.project.id
                ),
                consent: await sql`
              select "status", "withdrawnByUserId", "withdrawnAt",
                     "withdrawnOperationRecordId", "withdrawnProjectRevision"
              from "ProjectThreadParticipationConsent" where "id" = ${consentBefore.id}
            `,
              };
              const replay = await fixture.messaging.withdrawConsent({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                expectedProjectRevision: expectedRevision,
                operationId,
              });
              assert.equal(replay.replayed, true);
              const afterReplay = {
                revision: await projectRevision(sql, fixture.project.id),
                operations: await countRows(
                  sql,
                  byCount("ProjectOperation"),
                  "resultId",
                  consentBefore.id
                ),
                events: await countRows(
                  sql,
                  byCount("ProjectEvent"),
                  "projectId",
                  fixture.project.id
                ),
                consent: await sql`
              select "status", "withdrawnByUserId", "withdrawnAt",
                     "withdrawnOperationRecordId", "withdrawnProjectRevision"
              from "ProjectThreadParticipationConsent" where "id" = ${consentBefore.id}
            `,
              };
              assert.deepEqual(afterReplay, beforeReplay);
              await expectMessagingError(
                fixture.messaging.withdrawConsent({
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                  expectedProjectRevision: expectedRevision + 1,
                  operationId,
                }),
                "idempotency_conflict"
              );
              await expectPostgresConstraint(
                () =>
                  sql`update "ProjectThreadParticipationConsent" set "status" = 'active' where "id" = ${consentBefore.id}`,
                "23514",
                "ProjectThreadParticipationConsent_transition"
              );
              await expectMessagingError(
                fixture.messaging.withdrawConsent({
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                  expectedProjectRevision: expectedRevision + 1,
                  operationId: operationKey("second-withdrawal"),
                }),
                "state_conflict"
              );
              const [terminal] = await sql<
                {
                  status: string;
                  withdrawnByUserId: string;
                  withdrawnAt: Date | null;
                }[]
              >`
            select "status", "withdrawnByUserId", "withdrawnAt"
            from "ProjectThreadParticipationConsent" where "id" = ${consentBefore.id}
          `;
              assert.equal(terminal?.status, "withdrawn");
              assert.equal(terminal?.withdrawnByUserId, fixture.owner.id);
              assert.ok(terminal?.withdrawnAt);
              await expectMessagingError(
                fixture.messaging.getThread({
                  actorUserId: fixture.lawyer.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                }),
                "not_found"
              );
              await expectMessagingError(
                fixture.messaging.listMessages({
                  actorUserId: fixture.lawyer.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                  limit: 10,
                }),
                "not_found"
              );
              await expectMessagingError(
                fixture.messaging.listThreads({
                  actorUserId: fixture.lawyer.id,
                  projectId: fixture.project.id,
                  limit: 10,
                }),
                "not_found"
              );
              await assertProjectEventLedger(sql, fixture.project.id);
            }
          );
        }
      );

      await t.test(
        "Group E — authorization and anti-enumeration",
        async (st) => {
          await st.test(
            "unknown, foreign, unassigned, admin and active member reads are indistinguishable",
            async () => {
              const fixture = await createFixture(sql);
              const { result: thread } = await createThread(sql, fixture);
              const otherProject =
                await createProjectFoundationRepository().createProject({
                  actorUserId: fixture.member.id,
                  operationId: operationKey("foreign-project"),
                });
              const unknownProjectId = randomUUID();
              const outcomes = await Promise.allSettled([
                fixture.messaging.listThreads({
                  actorUserId: fixture.otherLawyer.id,
                  projectId: fixture.project.id,
                  limit: 5,
                }),
                fixture.messaging.listThreads({
                  actorUserId: fixture.otherLawyer.id,
                  projectId: unknownProjectId,
                  limit: 5,
                }),
              ]);
              assert.ok(
                outcomes.every((outcome) => outcome.status === "rejected")
              );
              for (const outcome of outcomes) {
                if (outcome.status === "rejected") {
                  assert.ok(
                    outcome.reason instanceof ProjectHumanMessagingError
                  );
                  assert.equal(outcome.reason.code, "not_found");
                }
              }
              await expectMessagingError(
                fixture.messaging.getThread({
                  actorUserId: fixture.lawyer.id,
                  projectId: otherProject.project.id,
                  threadId: thread.threadId,
                }),
                "not_found"
              );
              await expectMessagingError(
                fixture.messaging.getThread({
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  threadId: randomUUID(),
                }),
                "not_found"
              );
              await expectMessagingError(
                fixture.messaging.getThread({
                  actorUserId: fixture.otherLawyer.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                }),
                "not_found"
              );
              await expectMessagingError(
                fixture.messaging.getThread({
                  actorUserId: fixture.admin.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                }),
                "not_found"
              );

              const invited =
                await createProjectFoundationRepository().inviteProjectMember({
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  targetUserId: fixture.member.id,
                  expectedRevision: await projectRevision(
                    sql,
                    fixture.project.id
                  ),
                  operationId: operationKey("membership-invite"),
                });
              const [membership] = await sql<{ id: string }[]>`
            select "id" from "ProjectMembership"
            where "projectId" = ${fixture.project.id} and "userId" = ${fixture.member.id}
          `;
              assert.ok(membership?.id);
              await createProjectFoundationRepository().acceptProjectMembership(
                {
                  actorUserId: fixture.member.id,
                  projectId: fixture.project.id,
                  membershipId: membership.id,
                  expectedRevision: invited.project.revision,
                  operationId: operationKey("membership-accept"),
                }
              );
              await expectMessagingError(
                fixture.messaging.getThread({
                  actorUserId: fixture.member.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                }),
                "not_found"
              );
            }
          );

          await st.test(
            "role demotion and assignment revocation remove lawyer access",
            async () => {
              const demotedFixture = await createFixture(sql);
              const { result: demotedThread } = await createThread(
                sql,
                demotedFixture
              );
              await sql`update "User" set "role" = 'user' where "id" = ${demotedFixture.lawyer.id}`;
              await expectMessagingError(
                demotedFixture.messaging.getThread({
                  actorUserId: demotedFixture.lawyer.id,
                  projectId: demotedFixture.project.id,
                  threadId: demotedThread.threadId,
                }),
                "not_found"
              );

              const revokedFixture = await createFixture(sql);
              const { result: revokedThread } = await createThread(
                sql,
                revokedFixture
              );
              await revokedFixture.staff.transition({
                actorUserId: revokedFixture.owner.id,
                projectId: revokedFixture.project.id,
                assignmentId: revokedFixture.assignment.assignmentId,
                action: "owner_revoke",
                expectedProjectRevision: await projectRevision(
                  sql,
                  revokedFixture.project.id
                ),
                operationId: operationKey("owner-revoke"),
              });
              await expectMessagingError(
                revokedFixture.messaging.getThread({
                  actorUserId: revokedFixture.lawyer.id,
                  projectId: revokedFixture.project.id,
                  threadId: revokedThread.threadId,
                }),
                "not_found"
              );
              await expectMessagingError(
                revokedFixture.messaging.sendMessage({
                  actorUserId: revokedFixture.lawyer.id,
                  projectId: revokedFixture.project.id,
                  threadId: revokedThread.threadId,
                  operationId: operationKey("revoked-send"),
                  body: "should be rejected",
                }),
                "not_found"
              );
              assert.equal(
                (
                  await revokedFixture.messaging.getThread({
                    actorUserId: revokedFixture.owner.id,
                    projectId: revokedFixture.project.id,
                    threadId: revokedThread.threadId,
                  })
                ).threadId,
                revokedThread.threadId
              );
            }
          );

          await st.test("closed Projects deny all thread access", async () => {
            const fixture = await createFixture(sql);
            const { result: thread } = await createThread(sql, fixture);
            await createProjectFoundationRepository().closeProject({
              actorUserId: fixture.owner.id,
              projectId: fixture.project.id,
              expectedRevision: await projectRevision(sql, fixture.project.id),
              operationId: operationKey("close-project"),
            });
            await expectMessagingError(
              fixture.messaging.getThread({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
              }),
              "not_found"
            );
            await expectMessagingError(
              fixture.messaging.listThreads({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                limit: 5,
              }),
              "not_found"
            );
          });
        }
      );

      await t.test(
        "Group F — scoped thread listing and pagination",
        async (st) => {
          await st.test(
            "owner retains history while lawyer pagination filters before cursors",
            async () => {
              const fixture = await createFixture(sql);
              const oldest = await createThread(sql, fixture);
              const unrelated = await makeThreadForLawyer(
                sql,
                fixture,
                fixture.otherLawyer.id
              );
              await createThreadForAssignment(sql, {
                ownerId: unrelated.owner.id,
                projectId: unrelated.project.id,
                assignmentId: unrelated.assignmentId,
                lawyerId: unrelated.lawyerId,
                messaging: unrelated.messaging,
              });
              const [unrelatedThread] = await sql<{ id: string }[]>`
            select "id" from "ProjectHumanThread"
            where "projectId" = ${fixture.project.id}
              and "lawyerUserId" = ${fixture.otherLawyer.id}
          `;
              assert.ok(unrelatedThread);
              await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
              const middle = await createThread(sql, fixture);
              await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
              const withdrawnExpectedRevision = await projectRevision(
                sql,
                fixture.project.id
              );
              await fixture.messaging.withdrawConsent({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                threadId: oldest.result.threadId,
                expectedProjectRevision: withdrawnExpectedRevision,
                operationId: operationKey("listing-withdraw"),
              });
              const newest = await createThread(sql, fixture);
              const ownerPage = await fixture.messaging.listThreads({
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                limit: 10,
              });
              assert.equal(ownerPage.items.length, 4);
              assert.ok(
                ownerPage.items.some(
                  (item) =>
                    item.threadId === oldest.result.threadId &&
                    item.consentStatus === "withdrawn"
                )
              );
              assert.ok(
                ownerPage.items.some(
                  (item) => item.threadId === unrelatedThread.id
                )
              );

              await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
              const finalInaccessible = await createThreadForAssignment(sql, {
                ownerId: fixture.owner.id,
                projectId: fixture.project.id,
                assignmentId: unrelated.assignmentId,
                lawyerId: unrelated.lawyerId,
                messaging: unrelated.messaging,
              });
              assert.ok(finalInaccessible.threadId);
              const lawyerFirst = await fixture.messaging.listThreads({
                actorUserId: fixture.lawyer.id,
                projectId: fixture.project.id,
                limit: 1,
              });
              assert.deepEqual(
                lawyerFirst.items.map((item) => item.threadId),
                [newest.result.threadId]
              );
              assert.equal(lawyerFirst.hasMore, true);
              assert.deepEqual(lawyerFirst.nextCursor, {
                beforeCreatedAt: lawyerFirst.items[0]?.createdAt.toISOString(),
                beforeThreadId: newest.result.threadId,
              });
              const lawyerSecond = await fixture.messaging.listThreads({
                actorUserId: fixture.lawyer.id,
                projectId: fixture.project.id,
                beforeCreatedAt: lawyerFirst.nextCursor?.beforeCreatedAt,
                beforeThreadId: lawyerFirst.nextCursor?.beforeThreadId,
                limit: 1,
              });
              assert.deepEqual(
                lawyerSecond.items.map((item) => item.threadId),
                [middle.result.threadId]
              );
              assert.equal(lawyerSecond.hasMore, false);
              assert.equal(lawyerSecond.nextCursor, null);
              assert.equal(
                lawyerFirst.items.some(
                  (item) =>
                    item.threadId === unrelatedThread.id ||
                    item.threadId === finalInaccessible.threadId
                ),
                false
              );
              assert.equal(
                lawyerSecond.items.some(
                  (item) =>
                    item.threadId === unrelatedThread.id ||
                    item.threadId === finalInaccessible.threadId
                ),
                false
              );

              const otherLawyerFirst = await fixture.messaging.listThreads({
                actorUserId: fixture.otherLawyer.id,
                projectId: fixture.project.id,
                limit: 1,
              });
              assert.deepEqual(
                otherLawyerFirst.items.map((item) => item.threadId),
                [finalInaccessible.threadId]
              );
              assert.equal(otherLawyerFirst.hasMore, true);
              assert.deepEqual(otherLawyerFirst.nextCursor, {
                beforeCreatedAt:
                  otherLawyerFirst.items[0]?.createdAt.toISOString(),
                beforeThreadId: finalInaccessible.threadId,
              });
              const otherLawyerSecond = await fixture.messaging.listThreads({
                actorUserId: fixture.otherLawyer.id,
                projectId: fixture.project.id,
                beforeCreatedAt: otherLawyerFirst.nextCursor?.beforeCreatedAt,
                beforeThreadId: otherLawyerFirst.nextCursor?.beforeThreadId,
                limit: 1,
              });
              assert.deepEqual(
                otherLawyerSecond.items.map((item) => item.threadId),
                [unrelatedThread.id]
              );
              assert.equal(otherLawyerSecond.hasMore, false);
              assert.equal(otherLawyerSecond.nextCursor, null);
              for (const item of [
                ...otherLawyerFirst.items,
                ...otherLawyerSecond.items,
              ]) {
                assert.notEqual(item.threadId, oldest.result.threadId);
                assert.notEqual(item.threadId, middle.result.threadId);
                assert.notEqual(item.threadId, newest.result.threadId);
              }

              const unassignedLawyer = await insertUser(
                sql,
                "lawyer",
                "m4-003-unassigned-list-lawyer"
              );
              await expectMessagingError(
                fixture.messaging.listThreads({
                  actorUserId: unassignedLawyer.id,
                  projectId: fixture.project.id,
                  limit: 1,
                }),
                "not_found"
              );
            }
          );
        }
      );

      await t.test(
        "Group G — concurrency and transactional rollback",
        async (st) => {
          await st.test(
            "concurrent distinct sends receive unique contiguous sequences",
            async () => {
              const fixture = await createFixture(sql);
              const { result: thread } = await createThread(sql, fixture);
              const revision = await projectRevision(sql, fixture.project.id);
              const sendInputs = [
                {
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                  operationId: operationKey("parallel-a"),
                  body: "parallel A",
                },
                {
                  actorUserId: fixture.lawyer.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                  operationId: operationKey("parallel-b"),
                  body: "parallel B",
                },
              ];
              const outcomes = await Promise.allSettled(
                sendInputs.map((input) => fixture.messaging.sendMessage(input))
              );
              const sends = outcomes.map((outcome, index) =>
                requireFulfilled(
                  outcome,
                  `distinct concurrent send ${index + 1}`
                )
              );
              assert.deepEqual(
                sends.map((item) => item.sequence).sort(),
                [1, 2]
              );
              const messages = [
                ...(await sql<
                  {
                    sequence: number;
                    authorUserId: string;
                    body: string;
                  }[]
                >`
                  select "sequence", "authorUserId", "body"
                  from "ProjectHumanMessage"
                  where "threadId" = ${thread.threadId}
                  order by "sequence"
                `),
              ];
              assert.deepEqual(
                messages,
                sends
                  .map((send, index) => ({
                    sequence: send.sequence,
                    authorUserId: sendInputs[index]?.actorUserId,
                    body: sendInputs[index]?.body,
                  }))
                  .sort((left, right) => left.sequence - right.sequence)
              );
              for (const [index, input] of sendInputs.entries()) {
                const send = sends[index];
                assert.ok(send);
                await assertSendOperationState(sql, {
                  actorUserId: input.actorUserId,
                  operationId: input.operationId,
                  body: input.body,
                  sent: { messageId: send.messageId, sequence: send.sequence },
                });
              }
              assert.equal(
                await projectRevision(sql, fixture.project.id),
                revision
              );
              assert.equal(
                await countRows(
                  sql,
                  byCount("ProjectEvent"),
                  "projectId",
                  fixture.project.id
                ),
                revision
              );
            }
          );

          await st.test(
            "concurrent identical operation IDs create one message and one replay",
            async () => {
              const fixture = await createFixture(sql);
              const { result: thread } = await createThread(sql, fixture);
              const revision = await projectRevision(sql, fixture.project.id);
              const operationId = operationKey("parallel-identical");
              const input = {
                actorUserId: fixture.owner.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                operationId,
                body: "same request",
              };
              const outcomes = await Promise.allSettled([
                fixture.messaging.sendMessage(input),
                fixture.messaging.sendMessage(input),
              ]);
              const results = outcomes.map((outcome, index) =>
                requireFulfilled(
                  outcome,
                  `identical concurrent send ${index + 1}`
                )
              );
              const [firstResult, secondResult] = results;
              assert.ok(firstResult && secondResult);
              assert.deepEqual(results.map((item) => item.replayed).sort(), [
                false,
                true,
              ]);
              assert.equal(firstResult.messageId, secondResult.messageId);
              assert.equal(
                await countRows(
                  sql,
                  byCount("ProjectHumanMessage"),
                  "id",
                  firstResult.messageId
                ),
                1
              );
              assert.equal(
                await countRows(
                  sql,
                  byCount("ProjectOperation"),
                  "resultId",
                  firstResult.messageId
                ),
                1
              );
              await assertSendOperationState(sql, {
                actorUserId: input.actorUserId,
                operationId,
                body: input.body,
                sent: {
                  messageId: firstResult.messageId,
                  sequence: firstResult.sequence,
                },
              });
              assert.equal(
                await projectRevision(sql, fixture.project.id),
                revision
              );
              await assertProjectEventLedger(sql, fixture.project.id);
            }
          );

          await st.test(
            "send racing with consent withdrawal leaves no post-withdrawal write",
            async () => {
              const fixture = await createFixture(sql);
              const { result: thread } = await createThread(sql, fixture);
              const revision = await projectRevision(sql, fixture.project.id);
              const sendInput = {
                actorUserId: fixture.lawyer.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                operationId: operationKey("send-v-withdraw"),
                body: "race",
              };
              const withdrawalOperationId = operationKey("withdraw-v-send");
              const outcomes = await Promise.allSettled([
                fixture.messaging.sendMessage(sendInput),
                fixture.messaging.withdrawConsent({
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                  expectedProjectRevision: revision,
                  operationId: withdrawalOperationId,
                }),
              ]);
              const [sendOutcome, withdrawalOutcome] = outcomes;
              assert.ok(sendOutcome && withdrawalOutcome);
              const send = resolveSendRace(
                sendOutcome,
                "send versus withdrawal"
              );
              requireFulfilled(withdrawalOutcome, "consent withdrawal");
              const [state] = await sql<
                { status: string; lastMessageSequence: number }[]
              >`
            select t."status", t."lastMessageSequence"
            from "ProjectHumanThread" t where t."id" = ${thread.threadId}
          `;
              assert.equal(state?.status, "closed");
              const messages = [
                ...(await sql<
                  {
                    sequence: number;
                    authorUserId: string;
                    body: string;
                  }[]
                >`
                  select "sequence", "authorUserId", "body"
                  from "ProjectHumanMessage"
                  where "threadId" = ${thread.threadId}
                  order by "sequence"
                `),
              ];
              const sentMessage = send.sent ? send.value : null;
              assert.deepEqual(
                messages,
                sentMessage
                  ? [
                      {
                        sequence: sentMessage.sequence,
                        authorUserId: fixture.lawyer.id,
                        body: sendInput.body,
                      },
                    ]
                  : []
              );
              assert.equal(state?.lastMessageSequence, messages.length);
              await assertSendOperationState(sql, {
                actorUserId: sendInput.actorUserId,
                operationId: sendInput.operationId,
                body: sendInput.body,
                sent: sentMessage
                  ? {
                      messageId: sentMessage.messageId,
                      sequence: sentMessage.sequence,
                    }
                  : null,
              });
              const [consent] = await sql<{ id: string; status: string }[]>`
                select consent."id", consent."status"
                from "ProjectThreadParticipationConsent" consent
                where consent."threadId" = ${thread.threadId}
              `;
              assert.ok(consent?.id);
              assert.equal(consent.status, "withdrawn");
              const withdrawalOperations = [
                ...(await sql<{ resultId: string }[]>`
                  select "resultId" from "ProjectOperation"
                  where "actorUserId" = ${fixture.owner.id}
                    and "operationId" = ${withdrawalOperationId}
                    and "operationType" = 'project_thread_participation_consent_withdraw'
                `),
              ];
              assert.deepEqual(withdrawalOperations, [
                { resultId: consent.id },
              ]);
              assert.equal(
                await projectRevision(sql, fixture.project.id),
                revision + 1
              );
              await assertProjectEventLedger(sql, fixture.project.id);
              const postWithdrawalOperationId =
                operationKey("post-withdraw-send");
              await expectMessagingError(
                fixture.messaging.sendMessage({
                  ...sendInput,
                  operationId: postWithdrawalOperationId,
                  body: "denied after withdrawal",
                }),
                "not_found"
              );
              await assertSendOperationState(sql, {
                actorUserId: sendInput.actorUserId,
                operationId: postWithdrawalOperationId,
                body: "denied after withdrawal",
                sent: null,
              });
            }
          );

          await st.test(
            "assignment revocation racing with send preserves a serializable authorization outcome",
            async () => {
              const fixture = await createFixture(sql);
              const { result: thread } = await createThread(sql, fixture);
              const revision = await projectRevision(sql, fixture.project.id);
              const sendInput = {
                actorUserId: fixture.lawyer.id,
                projectId: fixture.project.id,
                threadId: thread.threadId,
                operationId: operationKey("send-v-revoke"),
                body: "race",
              };
              const revokeOperationId = operationKey("revoke-v-send");
              const outcomes = await Promise.allSettled([
                fixture.messaging.sendMessage(sendInput),
                fixture.staff.transition({
                  actorUserId: fixture.owner.id,
                  projectId: fixture.project.id,
                  assignmentId: fixture.assignment.assignmentId,
                  action: "owner_revoke",
                  expectedProjectRevision: revision,
                  operationId: revokeOperationId,
                }),
              ]);
              const [sendOutcome, revokeOutcome] = outcomes;
              assert.ok(sendOutcome && revokeOutcome);
              const send = resolveSendRace(
                sendOutcome,
                "send versus assignment revocation"
              );
              requireFulfilled(revokeOutcome, "assignment revocation");
              const [assignment] = await sql<
                {
                  status: string;
                  terminalReasonCode: string | null;
                  terminalActorUserId: string | null;
                  terminalAt: Date | null;
                }[]
              >`
                select
                  "status",
                  "terminalReasonCode",
                  "terminalActorUserId",
                  "terminalAt"
                from "ProjectStaffAssignment"
                where "id" = ${fixture.assignment.assignmentId}
              `;
              assert.equal(assignment?.status, "revoked");
              assert.equal(assignment?.terminalReasonCode, "owner_revoked");
              assert.equal(assignment?.terminalActorUserId, fixture.owner.id);
              assert.ok(assignment?.terminalAt);
              const sentMessage = send.sent ? send.value : null;
              const messages = [
                ...(await sql<
                  {
                    sequence: number;
                    authorUserId: string;
                    body: string;
                  }[]
                >`
                  select "sequence", "authorUserId", "body"
                  from "ProjectHumanMessage"
                  where "threadId" = ${thread.threadId}
                  order by "sequence"
                `),
              ];
              assert.deepEqual(
                messages,
                sentMessage
                  ? [
                      {
                        sequence: sentMessage.sequence,
                        authorUserId: fixture.lawyer.id,
                        body: sendInput.body,
                      },
                    ]
                  : []
              );
              await assertSendOperationState(sql, {
                actorUserId: sendInput.actorUserId,
                operationId: sendInput.operationId,
                body: sendInput.body,
                sent: sentMessage
                  ? {
                      messageId: sentMessage.messageId,
                      sequence: sentMessage.sequence,
                    }
                  : null,
              });
              const postRevokeOperationId = operationKey("post-revoke-send");
              await expectMessagingError(
                fixture.messaging.sendMessage({
                  actorUserId: fixture.lawyer.id,
                  projectId: fixture.project.id,
                  threadId: thread.threadId,
                  operationId: postRevokeOperationId,
                  body: "denied",
                }),
                "not_found"
              );
              await assertSendOperationState(sql, {
                actorUserId: fixture.lawyer.id,
                operationId: postRevokeOperationId,
                body: "denied",
                sent: null,
              });
              assert.equal(
                await projectRevision(sql, fixture.project.id),
                revision + 1
              );
              await assertProjectEventLedger(sql, fixture.project.id);
            }
          );
        }
      );

      await t.test(
        "Group H — isolation, protected resources and default-off feature gate",
        async () => {
          const fixture = await createFixture(sql);
          const { result: thread } = await createThread(sql, fixture);
          await fixture.messaging.sendMessage({
            actorUserId: fixture.owner.id,
            projectId: fixture.project.id,
            threadId: thread.threadId,
            operationId: operationKey("isolation-message"),
            body: "message only",
          });
          assert.equal(isProjectHumanMessagingEnabled(undefined), false);
          const [resources] = await sql<
            {
              memberships: number;
              facts: number;
              documents: number;
              documentGrants: number;
              factUseGrants: number;
              projectChats: number;
              assignments: number;
            }[]
          >`
          select
            (select count(*)::int from "ProjectMembership" where "projectId" = ${fixture.project.id}) as memberships,
            (select count(*)::int from "ProjectFactAssertion" where "projectId" = ${fixture.project.id}) as facts,
            (select count(*)::int from "ProjectDocumentAsset" where "projectId" = ${fixture.project.id}) as documents,
            (select count(*)::int from "ProjectDocumentGrant" where "projectId" = ${fixture.project.id}) as "documentGrants",
            (select count(*)::int from "ProjectFactUseGrant" where "projectId" = ${fixture.project.id}) as "factUseGrants",
            (select count(*)::int from "ProjectConversation" where "projectId" = ${fixture.project.id}) as "projectChats",
            (select count(*)::int from "ProjectStaffAssignment" where "projectId" = ${fixture.project.id}) as assignments
        `;
          assert.deepEqual(resources, {
            memberships: 0,
            facts: 0,
            documents: 0,
            documentGrants: 0,
            factUseGrants: 0,
            projectChats: 0,
            assignments: 1,
          });
          const operations = await sql<
            { operationType: string; resultKind: string }[]
          >`
          select op."operationType", op."resultKind"
          from "ProjectOperation" op
          where op."resultId" in (
            select c."id" from "ProjectThreadParticipationConsent" c
            where c."threadId" = ${thread.threadId}
            union all
            select m."id" from "ProjectHumanMessage" m where m."threadId" = ${thread.threadId}
          )
        `;
          assert.deepEqual(
            operations.map((row) => [row.operationType, row.resultKind]).sort(),
            [
              ["project_human_message_send", "project_human_message"],
              [
                "project_thread_participation_consent_create",
                "project_thread_participation_consent",
              ],
            ].sort()
          );
          for (const resource of [
            "project_fact",
            "project_document",
            "private_chat",
            "financial_record",
            "engagement_record",
            "other_project_resource",
          ] as const) {
            assert.deepEqual(
              authorizeProjectStaffDisclosure({
                assignmentId: fixture.assignment.assignmentId,
                projectId: fixture.project.id,
                staffUserId: fixture.lawyer.id,
                resource,
              }),
              { decision: "DENY", reason: "m4_004_disclosure_policy_pending" }
            );
          }
          const lawyerProjectAccess = await createProjectFoundationRepository()
            .getProjectForActor({
              actorUserId: fixture.lawyer.id,
              projectId: fixture.project.id,
            })
            .then(
              () => true,
              () => false
            );
          assert.equal(lawyerProjectAccess, false);
          assert.equal(
            await projectRevision(sql, fixture.project.id),
            thread.projectRevision
          );
          await assertProjectEventLedger(sql, fixture.project.id);
        }
      );
    } finally {
      await sql.end({ timeout: 5 });
      await closeLazyDatabase();
    }
  }
);
