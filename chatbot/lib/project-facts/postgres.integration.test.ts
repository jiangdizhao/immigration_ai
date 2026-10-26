// biome-ignore-all lint/suspicious/noMisplacedAssertion: the target URL helper is called only inside the guarded integration test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { test } from "node:test";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createProjectFactManagementService } from "./facts";
import { PostgresProjectFactRepository } from "./postgres-repository";

loadEnv({ path: resolve(".env.local") });

const DATABASE_URL = process.env.PHASE13_M1_1_TEST_DATABASE_URL?.trim() ?? "";
const EXPECTED_DATABASE = "immigration_ai_phase13_m1_1_test";
const EXPECTED_HOST = "127.0.0.1";
const EXPECTED_PORT = 5432;

function assertTargetUrl(value: string) {
  const url = new URL(value);
  assert.ok(url.protocol === "postgres:" || url.protocol === "postgresql:");
  assert.equal(url.pathname.slice(1), EXPECTED_DATABASE);
  assert.equal(url.hostname, EXPECTED_HOST);
  assert.equal(Number(url.port), EXPECTED_PORT);
}

test(
  "M2-B fact gates and audit integrate only on the identity-verified disposable database",
  {
    skip: DATABASE_URL
      ? false
      : "PHASE13_M1_1_TEST_DATABASE_URL is not configured",
  },
  async () => {
    assertTargetUrl(DATABASE_URL);
    const sql = postgres(DATABASE_URL, {
      max: 3,
      connect_timeout: 5,
      onnotice: () => undefined,
    });
    try {
      const [identity] = await sql<
        { database: string; host: string | null; port: number }[]
      >`
        select current_database() as database, host(inet_server_addr()) as host, inet_server_port() as port
      `;
      assert.equal(identity.database, EXPECTED_DATABASE);
      assert.equal(identity.host, EXPECTED_HOST);
      assert.equal(Number(identity.port), EXPECTED_PORT);

      const migrationDir = resolve("lib/db/migrations");
      await migrate(drizzle(sql), { migrationsFolder: migrationDir });
      const journal = JSON.parse(
        await (await import("node:fs/promises")).readFile(
          resolve(migrationDir, "meta/_journal.json"),
          "utf8"
        )
      ) as { entries: Array<{ tag: string }> };
      assert.ok(
        journal.entries.some(
          (entry) => entry.tag === "0035_phase13_m2_a2_b_facts"
        )
      );

      const actorUserId = randomUUID();
      const projectOwnerUserId = randomUUID();
      const projectId = randomUUID();
      const createOperationId = `m2b-project-${randomUUID()}`;
      await sql`insert into "User" ("id", "email", "password") values
        (${actorUserId}, ${`m2b-${randomUUID()}@test.invalid`}, ${"x".repeat(64)}),
        (${projectOwnerUserId}, ${`m2b-${randomUUID()}@test.invalid`}, ${"x".repeat(64)})`;
      const [operation] = await sql<{ id: string }[]>`
        insert into "ProjectOperation" ("actorUserId", "operationType", "operationId", "requestHash", "resultKind", "resultId")
        values (${projectOwnerUserId}, 'project_create', ${createOperationId}, ${"b".repeat(64)}, 'project', ${projectId}) returning "id"
      `;
      await sql`insert into "StudyJourneyProject" ("id", "ownerUserId", "revision") values (${projectId}, ${projectOwnerUserId}, 1)`;
      await sql`insert into "ProjectEvent" ("projectId", "actorUserId", "projectRevision", "eventType", "subjectKind", "subjectId", "operationRecordId") values (${projectId}, ${projectOwnerUserId}, 1, 'project_created', 'project', ${projectId}, ${operation.id})`;
      await sql`
        insert into "ProjectMembership" (
          "projectId", "userId", "status", "invitedByUserId", "acceptedAt"
        ) values (
          ${projectId}, ${actorUserId}, 'active', ${projectOwnerUserId}, now()
        ), (
          ${projectId}, ${projectOwnerUserId}, 'active', ${projectOwnerUserId}, now()
        )
      `;

      const repository = new PostgresProjectFactRepository(drizzle(sql));
      const service = createProjectFactManagementService({ repository });
      const proposalInput = {
        actorUserId,
        projectId,
        operationId: `m2b-propose-${randomUUID()}`,
        expectedProjectRevision: 1,
        key: "school.synthetic_start_date",
        valueType: "date",
        value: "2027-02-01",
        originKind: "customer_stated",
        effectiveFrom: "2027-02-01T00:00:00.000Z",
        effectiveTo: "2027-02-01T00:00:00.000Z",
      } as const;
      const candidate = await service.propose(proposalInput);
      assert.equal(candidate.state, "proposed");

      const readAuditState = async () => {
        const [state] = await sql<
          {
            revision: number;
            operations: string;
            ownerOperations: string;
            projectEvents: string;
            factEvents: string;
          }[]
        >`
          select
            project."revision" as revision,
            (select count(*) from "ProjectEvent" event join "ProjectOperation" operation on operation."id" = event."operationRecordId" where event."projectId" = ${projectId} and operation."operationType" = 'project_fact_mutation')::text as operations,
            (select count(*) from "ProjectOperation" where "actorUserId" = ${projectOwnerUserId} and "operationType" = 'project_fact_mutation')::text as "ownerOperations",
            (select count(*) from "ProjectEvent" where "projectId" = ${projectId})::text as "projectEvents",
            (select count(*) from "ProjectFactAssertionEvent" where "projectId" = ${projectId})::text as "factEvents"
          from "StudyJourneyProject" project
          where project."id" = ${projectId}
        `;
        return state;
      };

      const deniedMutationBaseline = await readAuditState();
      const ownerAttempts = [
        () =>
          service.confirm({
            actorUserId: projectOwnerUserId,
            projectId,
            operationId: `m2b-owner-confirm-${randomUUID()}`,
            expectedProjectRevision: 2,
            assertionId: candidate.id,
            assertionVersion: candidate.version,
          }),
        () =>
          service.reject({
            actorUserId: projectOwnerUserId,
            projectId,
            operationId: `m2b-owner-reject-${randomUUID()}`,
            expectedProjectRevision: 2,
            assertionId: candidate.id,
            assertionVersion: candidate.version,
          }),
        () =>
          service.dispute({
            actorUserId: projectOwnerUserId,
            projectId,
            operationId: `m2b-owner-dispute-${randomUUID()}`,
            expectedProjectRevision: 2,
            assertionId: candidate.id,
            assertionVersion: candidate.version,
          }),
        () =>
          service.markStale({
            actorUserId: projectOwnerUserId,
            projectId,
            operationId: `m2b-owner-stale-${randomUUID()}`,
            expectedProjectRevision: 2,
            assertionId: candidate.id,
            assertionVersion: candidate.version,
          }),
        () =>
          service.supersede({
            actorUserId: projectOwnerUserId,
            projectId,
            operationId: `m2b-owner-supersede-${randomUUID()}`,
            expectedProjectRevision: 2,
            assertionId: candidate.id,
            assertionVersion: candidate.version,
          }),
        () =>
          service.publish({
            actorUserId: projectOwnerUserId,
            projectId,
            operationId: `m2b-owner-publish-${randomUUID()}`,
            expectedProjectRevision: 2,
            assertionId: candidate.id,
            assertionVersion: candidate.version,
            audience: "project",
          }),
        () =>
          service.grantAIUse({
            actorUserId: projectOwnerUserId,
            projectId,
            operationId: `m2b-owner-grant-${randomUUID()}`,
            expectedProjectRevision: 2,
            assertionId: candidate.id,
            assertionVersion: candidate.version,
            audience: "project",
          }),
        () =>
          service.confirm({
            actorUserId: projectOwnerUserId,
            projectId,
            operationId: proposalInput.operationId,
            expectedProjectRevision: 2,
            assertionId: candidate.id,
            assertionVersion: candidate.version,
          }),
      ];
      for (const attempt of ownerAttempts) {
        await assert.rejects(attempt(), { code: "forbidden" });
      }
      assert.deepEqual(await readAuditState(), deniedMutationBaseline);

      const confirmed = await service.confirm({
        actorUserId,
        projectId,
        operationId: `m2b-confirm-${randomUUID()}`,
        expectedProjectRevision: 2,
        assertionId: candidate.id,
        assertionVersion: candidate.version,
      });
      await service.publish({
        actorUserId,
        projectId,
        operationId: `m2b-publish-${randomUUID()}`,
        expectedProjectRevision: 3,
        assertionId: candidate.id,
        assertionVersion: confirmed.version,
        audience: "actor_only",
      });
      assert.equal(
        (await service.stableProjection({ actorUserId, projectId }))
          .authorizedForAI.length,
        0
      );
      await service.grantAIUse({
        actorUserId,
        projectId,
        operationId: `m2b-grant-${randomUUID()}`,
        expectedProjectRevision: 4,
        assertionId: candidate.id,
        assertionVersion: confirmed.version,
        audience: "actor_only",
      });
      const deniedRevokeBaseline = await readAuditState();
      await assert.rejects(
        service.revokeAIUse({
          actorUserId: projectOwnerUserId,
          projectId,
          operationId: `m2b-owner-revoke-${randomUUID()}`,
          expectedProjectRevision: 5,
          assertionId: candidate.id,
          assertionVersion: confirmed.version,
        }),
        { code: "forbidden" }
      );
      assert.deepEqual(await readAuditState(), deniedRevokeBaseline);
      assert.equal(
        (await service.stableProjection({ actorUserId, projectId }))
          .authorizedForAI.length,
        1
      );
      await service.revokeAIUse({
        actorUserId,
        projectId,
        operationId: `m2b-revoke-${randomUUID()}`,
        expectedProjectRevision: 5,
        assertionId: candidate.id,
        assertionVersion: confirmed.version,
      });
      assert.equal(
        (await service.stableProjection({ actorUserId, projectId }))
          .authorizedForAI.length,
        0
      );
      const superseded = await service.supersede({
        actorUserId,
        projectId,
        operationId: `m2b-supersede-${randomUUID()}`,
        expectedProjectRevision: 6,
        assertionId: candidate.id,
        assertionVersion: confirmed.version,
      });
      assert.equal(superseded.state, "superseded");
      const replay = await service.propose(proposalInput);
      assert.equal(replay.state, "proposed");
      assert.equal(
        (await service.stableProjection({ actorUserId, projectId }))
          .authorizedForAI.length,
        0
      );

      const [counts] = await sql<
        {
          assertions: string;
          factEvents: string;
          projectEvents: string;
          operations: string;
        }[]
      >`
        select
          (select count(*) from "ProjectFactAssertion" where "projectId"=${projectId})::text as assertions,
          (select count(*) from "ProjectFactAssertionEvent" where "projectId"=${projectId})::text as "factEvents",
          (select count(*) from "ProjectEvent" where "projectId"=${projectId})::text as "projectEvents",
          (select count(*) from "ProjectOperation" where "actorUserId"=${actorUserId} and "operationType"='project_fact_mutation')::text as operations
      `;
      assert.equal(Number(counts.assertions), 1);
      assert.equal(Number(counts.factEvents), 6);
      assert.equal(Number(counts.projectEvents), 7);
      assert.equal(Number(counts.operations), 6);

      const revokedAuthorityBaseline = await readAuditState();
      await sql`
        update "ProjectMembership"
        set "status" = 'revoked', "revokedAt" = now()
        where "projectId" = ${projectId} and "userId" = ${actorUserId}
      `;
      await assert.rejects(
        service.propose({
          ...proposalInput,
          operationId: `m2b-revoked-member-${randomUUID()}`,
          expectedProjectRevision: revokedAuthorityBaseline.revision,
        }),
        { code: "forbidden" }
      );
      assert.deepEqual(await readAuditState(), revokedAuthorityBaseline);

      await sql`
        update "StudyJourneyProject"
        set "status" = 'closed', "closedAt" = now()
        where "id" = ${projectId}
      `;
      await assert.rejects(
        service.confirm({
          actorUserId: projectOwnerUserId,
          projectId,
          operationId: `m2b-closed-project-${randomUUID()}`,
          expectedProjectRevision: revokedAuthorityBaseline.revision,
          assertionId: candidate.id,
          assertionVersion: confirmed.version,
        }),
        { code: "forbidden" }
      );
      assert.deepEqual(await readAuditState(), revokedAuthorityBaseline);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);
