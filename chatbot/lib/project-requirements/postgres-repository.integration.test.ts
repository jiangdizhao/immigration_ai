// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertions are scoped to a guarded disposable PostgreSQL integration.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { PostgresProjectRequirementRepository } from "./postgres-repository";

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
  "M2-C migrates and integrates only against the identity-verified disposable database",
  {
    skip: DATABASE_URL
      ? false
      : "PHASE13_M1_1_TEST_DATABASE_URL is not configured",
  },
  async () => {
    assertTargetUrl(DATABASE_URL);
    const sql = postgres(DATABASE_URL, {
      max: 4,
      connect_timeout: 5,
      onnotice: () => undefined,
    });
    try {
      const [identity] = await sql<
        { database: string; host: string | null; port: number }[]
      >`
        select current_database() as database,
          host(inet_server_addr()) as host,
          inet_server_port() as port
      `;
      assert.equal(identity.database, EXPECTED_DATABASE);
      assert.equal(identity.host, EXPECTED_HOST);
      assert.equal(Number(identity.port), EXPECTED_PORT);

      const migrationDir = resolve("lib/db/migrations");
      const journal = JSON.parse(
        await readFile(resolve(migrationDir, "meta/_journal.json"), "utf8")
      ) as { entries: Array<{ tag: string }> };
      assert.ok(
        journal.entries.some(
          (entry) => entry.tag === "0034_phase13_m2_c_requirement_registry"
        )
      );
      assert.equal(
        journal.entries.at(-1)?.tag,
        "0039_phase13_m2_round2_event_actor_scope"
      );
      await migrate(drizzle(sql), { migrationsFolder: migrationDir });

      const ownerId = randomUUID();
      const memberId = randomUUID();
      const outsiderId = randomUUID();
      await sql`
        insert into "User" ("id", "email", "password") values
          (${ownerId}, ${`m2c-${randomUUID()}@test.invalid`}, ${"x".repeat(64)}),
          (${memberId}, ${`m2c-${randomUUID()}@test.invalid`}, ${"x".repeat(64)}),
          (${outsiderId}, ${`m2c-${randomUUID()}@test.invalid`}, ${"x".repeat(64)})
      `;
      const projectId = randomUUID();
      const createOperationId = `m2c-project-${randomUUID()}`;
      const [createOperation] = await sql<{ id: string }[]>`
        insert into "ProjectOperation" (
          "actorUserId", "operationType", "operationId", "requestHash",
          "resultKind", "resultId"
        ) values (
          ${ownerId}, 'project_create', ${createOperationId}, ${"a".repeat(64)},
          'project', ${projectId}
        ) returning "id"
      `;
      await sql`
        insert into "StudyJourneyProject" ("id", "ownerUserId", "revision")
        values (${projectId}, ${ownerId}, 1)
      `;
      await sql`
        insert into "ProjectEvent" (
          "projectId", "actorUserId", "projectRevision", "eventType",
          "subjectKind", "subjectId", "operationRecordId"
        ) values (
          ${projectId}, ${ownerId}, 1, 'project_created', 'project',
          ${projectId}, ${createOperation.id}
        )
      `;
      await sql`
        insert into "ProjectMembership" (
          "projectId", "userId", "status", "invitedByUserId", "acceptedAt"
        ) values (
          ${projectId}, ${memberId}, 'active', ${ownerId}, now()
        )
      `;

      const customerRepository = new PostgresProjectRequirementRepository({
        database: drizzle(sql),
      });
      await assert.rejects(
        customerRepository.ensureProvisionalCatalog(),
        (error: unknown) =>
          (error as { code?: unknown }).code ===
          "template_maintenance_forbidden"
      );
      await assert.rejects(
        customerRepository.publishProvisionalVersion({
          family: "school_facts",
          templateKey: "school-facts-provisional",
          schemaVersion: "unauthorized-v99",
          items: [
            {
              key: "school_identity_detail",
              label: "Unauthorized customer edit",
              kind: "fact",
            },
          ],
          sourceProvenance: {
            sourceIdentity: null,
            observedAt: null,
            effectiveAt: null,
            note: "Synthetic customer input.",
          },
        }),
        (error: unknown) =>
          (error as { code?: unknown }).code ===
          "template_maintenance_forbidden"
      );

      const repository = new PostgresProjectRequirementRepository({
        database: drizzle(sql),
        verifyLocators: async ({
          projectId: candidateProjectId,
          actorUserId,
          access,
        }) =>
          candidateProjectId === projectId &&
          (access === "write"
            ? actorUserId === ownerId
            : actorUserId === ownerId),
        templateMaintenanceCapability: {
          authorize: () => Promise.resolve(true),
        },
      });
      const versions = await repository.ensureProvisionalCatalog();
      assert.equal(versions.length, 4);
      assert.ok(
        versions.every((version) => version.reviewState === "provisional")
      );
      assert.ok(versions.every((version) => version.reviewedByUserId === null));

      const schoolVersion = versions[0];
      const stateInput = {
        actorUserId: ownerId,
        projectId,
        operationId: `m2c-state-${randomUUID()}`,
        expectedProjectRevision: 1,
        family: "school_facts" as const,
        templateKey: "school-facts-provisional",
        templateVersionId: schoolVersion.id,
        itemKey: "school_identity_detail",
        applicability: "unknown" as const,
        collectionState: "in_progress" as const,
        factLocator: {
          projectId,
          assertionId: "synthetic-assertion-v1",
          version: 1,
        },
        evidenceLocator: null,
      };
      const concurrent = await Promise.all([
        repository.setCollectionState(stateInput),
        repository.setCollectionState(stateInput),
      ]);
      assert.equal(concurrent.filter((result) => !result.replayed).length, 1);
      assert.equal(concurrent.filter((result) => result.replayed).length, 1);
      const first = concurrent.find((result) => !result.replayed);
      assert.ok(first);
      assert.equal(first.projectRevision, 2);
      assert.equal(concurrent[0].state.id, concurrent[1].state.id);
      assert.equal(concurrent[0].state.id, first.state.id);
      const [auditCounts] = await sql<
        {
          operations: number;
          stateEvents: number;
          projectEvents: number;
          revision: number;
        }[]
      >`
        select
          (select count(*)::int from "ProjectOperation" where "operationId" = ${stateInput.operationId}) as operations,
          (select count(*)::int from "ProjectRequirementStateEvent" e join "ProjectOperation" o on o."id" = e."operationRecordId" where o."operationId" = ${stateInput.operationId}) as "stateEvents",
          (select count(*)::int from "ProjectEvent" e join "ProjectOperation" o on o."id" = e."operationRecordId" where o."operationId" = ${stateInput.operationId}) as "projectEvents",
          (select "revision" from "StudyJourneyProject" where "id" = ${projectId}) as revision
      `;
      assert.deepEqual(auditCounts, {
        operations: 1,
        stateEvents: 1,
        projectEvents: 1,
        revision: 2,
      });
      const secondState = await repository.setCollectionState({
        ...stateInput,
        operationId: `m2c-state-second-${randomUUID()}`,
        expectedProjectRevision: 2,
        collectionState: "needs_review",
      });
      assert.equal(secondState.projectRevision, 3);
      await assert.rejects(
        repository.setCollectionState({
          ...stateInput,
          collectionState: "complete",
        }),
        (error: unknown) =>
          (error as { code?: unknown }).code === "idempotency_conflict"
      );

      await assert.rejects(
        repository.listStates({ actorUserId: outsiderId, projectId }),
        (error: unknown) =>
          (error as { code?: unknown }).code === "project_forbidden"
      );
      await assert.rejects(
        repository.setCollectionState({
          ...stateInput,
          operationId: `m2c-cross-project-${randomUUID()}`,
          expectedProjectRevision: 2,
          evidenceLocator: {
            projectId: randomUUID(),
            evidenceRef: "evidence-private",
            version: 1,
          },
        }),
        (error: unknown) =>
          (error as { code?: unknown }).code === "locator_unverified"
      );

      const history = await repository.getHistory({
        actorUserId: ownerId,
        projectId,
        stateId: first.state.id,
      });
      assert.equal(history.length, 2);
      const memberStates = await repository.listStates({
        actorUserId: memberId,
        projectId,
      });
      assert.equal(memberStates.length, 1);
      assert.equal(memberStates[0].factLocator, null);
      const memberHistory = await repository.getHistory({
        actorUserId: memberId,
        projectId,
        stateId: first.state.id,
      });
      assert.equal(memberHistory.length, 2);
      assert.ok(
        memberHistory.every(
          (event) =>
            event.newValue.factLocator === null &&
            (event.oldValue === null || event.oldValue.factLocator === null)
        )
      );

      const publication = {
        family: "school_facts",
        templateKey: "school-facts-provisional",
        schemaVersion: `provisional-v2-${randomUUID()}`,
        items: [
          {
            key: "school_identity_detail",
            label: "Updated synthetic school detail",
            kind: "fact",
          },
        ],
        sourceProvenance: {
          sourceIdentity: null,
          observedAt: null,
          effectiveAt: null,
          note: "Synthetic provisional placeholder; not an official checklist.",
        },
      } as const;
      const secondVersion =
        await repository.publishProvisionalVersion(publication);
      const duplicatePublication =
        await repository.publishProvisionalVersion(publication);
      assert.equal(duplicatePublication.id, secondVersion.id);
      assert.notEqual(secondVersion.id, schoolVersion.id);
      const projected = await repository.listStates({
        actorUserId: ownerId,
        projectId,
      });
      assert.equal(projected.length, 1);
      assert.equal(projected[0].stale, true);
      assert.equal(
        (
          await repository.getHistory({
            actorUserId: ownerId,
            projectId,
            stateId: first.state.id,
          })
        ).length,
        2
      );
      assert.ok(
        (
          await repository.listTemplateVersions({
            family: "school_facts",
            templateKey: "school-facts-provisional",
          })
        ).length >= 2
      );

      const replayAfterSupersession =
        await repository.setCollectionState(stateInput);
      assert.equal(replayAfterSupersession.replayed, true);
      assert.equal(replayAfterSupersession.state.id, first.state.id);
      assert.equal(replayAfterSupersession.state.revision, 1);
      assert.equal(
        replayAfterSupersession.state.collectionState,
        "in_progress"
      );
      await assert.rejects(
        repository.setCollectionState({
          ...stateInput,
          operationId: `m2c-superseded-new-${randomUUID()}`,
          expectedProjectRevision: 2,
        }),
        (error: unknown) =>
          (error as { code?: unknown }).code === "version_conflict"
      );
      await assert.rejects(
        repository.setCollectionState({
          ...stateInput,
          collectionState: "complete",
        }),
        (error: unknown) =>
          (error as { code?: unknown }).code === "idempotency_conflict"
      );
      const [postReplayCounts] = await sql<
        {
          operations: number;
          stateEvents: number;
          projectEvents: number;
          revision: number;
        }[]
      >`
        select
          (select count(*)::int from "ProjectOperation" where "operationId" = ${stateInput.operationId}) as operations,
          (select count(*)::int from "ProjectRequirementStateEvent" e join "ProjectOperation" o on o."id" = e."operationRecordId" where o."operationId" = ${stateInput.operationId}) as "stateEvents",
          (select count(*)::int from "ProjectEvent" e join "ProjectOperation" o on o."id" = e."operationRecordId" where o."operationId" = ${stateInput.operationId}) as "projectEvents",
          (select "revision" from "StudyJourneyProject" where "id" = ${projectId}) as revision
      `;
      assert.deepEqual(
        {
          operations: postReplayCounts.operations,
          stateEvents: postReplayCounts.stateEvents,
          projectEvents: postReplayCounts.projectEvents,
        },
        {
          operations: auditCounts.operations,
          stateEvents: auditCounts.stateEvents,
          projectEvents: auditCounts.projectEvents,
        }
      );
      assert.equal(postReplayCounts.revision, 3);

      await assert.rejects(
        sql`update "RequirementTemplateVersion" set "schemaVersion" = 'tampered' where "id" = ${schoolVersion.id}`,
        (error: unknown) => (error as { code?: unknown }).code === "23514"
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
);
