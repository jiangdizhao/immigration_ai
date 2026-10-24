// biome-ignore-all lint/suspicious/noMisplacedAssertion: guarded PostgreSQL assertions stay in their test scope.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import {
  createProjectFoundationRepository,
  ProjectFoundationError,
} from "./project-foundation";
import {
  closeProjectFoundationSchemaClient,
  projectFoundationSchemaAvailable,
} from "./project-foundation-schema-availability";
import { closeLazyDatabase } from "./runtime-client";

const TEST_DATABASE_URL =
  process.env.PHASE13_M1_1_TEST_DATABASE_URL?.trim() ?? "";
const EXPECTED_DATABASE = "immigration_ai_phase13_m1_1_test";
const skipReason = TEST_DATABASE_URL
  ? false
  : "PHASE13_M1_1_TEST_DATABASE_URL is not configured (isolated database required)";

function assertConfiguredTarget(url: string) {
  const parsed = new URL(url);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.equal(parsed.pathname.replace(/^\//u, ""), EXPECTED_DATABASE);
  assert.ok(
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)
  );
}

type TestSql = ReturnType<typeof postgres>;

async function insertUser(
  sql: TestSql,
  label: string,
  options: { role?: "user" | "lawyer" | "admin"; guest?: boolean } = {}
) {
  const email = options.guest
    ? `guest-${Date.now()}-${randomUUID()}`
    : `${label.slice(0, 10)}-${randomUUID().replaceAll("-", "").slice(0, 20)}@example.test`;
  const role = options.role ?? "user";
  const [row] = await sql<{ id: string }[]>`
    insert into "User" ("email", "password", "role")
    values (${email}, ${"x".repeat(64)}, ${role})
    returning "id"
  `;
  return row.id;
}

function operationId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

async function expectProjectError(
  promise: Promise<unknown>,
  expected: ProjectFoundationError["code"]
) {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof ProjectFoundationError && error.code === expected
  );
}

async function projectRevision(sql: TestSql, projectId: string) {
  const [row] = await sql<{ revision: number }[]>`
    select "revision" from "StudyJourneyProject" where "id" = ${projectId}
  `;
  assert.ok(row);
  return row.revision;
}

async function createFixture(
  sql: TestSql,
  repository: ReturnType<typeof createProjectFoundationRepository>,
  label: string,
  ids: { users: string[]; projects: string[] }
) {
  const ownerId = await insertUser(sql, `${label}-owner`);
  ids.users.push(ownerId);
  const created = await repository.createProject({
    actorUserId: ownerId,
    operationId: operationId(`${label}-project`),
  });
  ids.projects.push(created.project.id);
  return { ownerId, project: created.project };
}

async function cleanup(
  sql: TestSql,
  ids: { users: string[]; projects: string[] }
) {
  if (ids.projects.length > 0) {
    await sql`
      delete from "ProjectEvent"
      where "projectId" = any(${sql.array(ids.projects)}::uuid[])
    `;
    await sql`
      delete from "ProjectMembership"
      where "projectId" = any(${sql.array(ids.projects)}::uuid[])
    `;
    await sql`
      delete from "ProjectConversation"
      where "projectId" = any(${sql.array(ids.projects)}::uuid[])
    `;
  }
  if (ids.users.length > 0) {
    await sql`
      delete from "ProjectOperation"
      where "actorUserId" = any(${sql.array(ids.users)}::uuid[])
    `;
  }
  if (ids.projects.length > 0) {
    await sql`
      delete from "StudyJourneyProject"
      where "id" = any(${sql.array(ids.projects)}::uuid[])
    `;
  }
  if (ids.users.length > 0) {
    await sql`delete from "User" where "id" = any(${sql.array(ids.users)}::uuid[])`;
  }
}

test(
  "M1.2 membership transactions, authorization, idempotency, races and rollback",
  { skip: skipReason },
  async (t) => {
    assertConfiguredTarget(TEST_DATABASE_URL);
    const sql = postgres(TEST_DATABASE_URL, {
      max: 16,
      connect_timeout: 5,
      connection: { TimeZone: "UTC" },
      onnotice: () => undefined,
    });
    const ids = { users: [] as string[], projects: [] as string[] };
    process.env.POSTGRES_URL = TEST_DATABASE_URL;
    const repository = createProjectFoundationRepository();

    try {
      const [identity] = await sql<{ database: string }[]>`
        select current_database() as database
      `;
      assert.equal(identity?.database, EXPECTED_DATABASE);
      assert.equal(await projectFoundationSchemaAvailable(), true);

      await t.test(
        "customer identity and pending invitation projection",
        async () => {
          const fixture = await createFixture(sql, repository, "identity", ids);
          const recipientId = await insertUser(sql, "recipient");
          ids.users.push(recipientId);
          const staffId = await insertUser(sql, "lawyer", { role: "lawyer" });
          ids.users.push(staffId);
          const adminId = await insertUser(sql, "admin", { role: "admin" });
          ids.users.push(adminId);
          const guestId = await insertUser(sql, "guest", { guest: true });
          ids.users.push(guestId);

          assert.equal(
            await repository.isRegisteredCustomer(recipientId),
            true
          );
          assert.equal(await repository.isRegisteredCustomer(staffId), false);
          assert.equal(await repository.isRegisteredCustomer(adminId), false);
          assert.equal(await repository.isRegisteredCustomer(guestId), false);

          const invite = await repository.inviteProjectMember({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            targetUserId: recipientId,
            expectedRevision: 1,
            operationId: operationId("identity-invite"),
          });
          assert.equal(invite.project.revision, 2);
          const inbox = await repository.listPendingInvitations(recipientId);
          assert.equal(inbox.length, 1);
          assert.deepEqual(Object.keys(inbox[0] ?? {}).sort(), [
            "createdAt",
            "membershipId",
            "projectId",
            "projectRevision",
            "status",
            "updatedAt",
          ]);
          assert.equal(inbox[0]?.projectRevision, 2);
          assert.deepEqual(
            await repository.listPendingInvitations(staffId),
            []
          );

          const [membership] = await sql<{ id: string }[]>`
          select "id" from "ProjectMembership"
          where "projectId" = ${fixture.project.id} and "userId" = ${recipientId}
        `;
          assert.ok(membership);
          await expectProjectError(
            repository.getProjectForActor({
              actorUserId: recipientId,
              projectId: fixture.project.id,
            }),
            "project_not_found"
          );
          await expectProjectError(
            repository.listProjectMembers({
              actorUserId: recipientId,
              projectId: fixture.project.id,
            }),
            "project_not_found"
          );
          await expectProjectError(
            repository.acceptProjectMembership({
              actorUserId: staffId,
              projectId: fixture.project.id,
              membershipId: membership.id,
              expectedRevision: 2,
              operationId: operationId("wrong-acceptor"),
            }),
            "project_forbidden"
          );
        }
      );

      await t.test(
        "invite, accept, revoke and neutral invitation outcomes",
        async () => {
          const fixture = await createFixture(
            sql,
            repository,
            "lifecycle",
            ids
          );
          const unauthorizedId = await insertUser(sql, "unauthorized-owner");
          ids.users.push(unauthorizedId);
          const recipientId = await insertUser(sql, "lifecycle-recipient");
          ids.users.push(recipientId);
          const lawyerId = await insertUser(sql, "target-lawyer", {
            role: "lawyer",
          });
          ids.users.push(lawyerId);
          const adminId = await insertUser(sql, "target-admin", {
            role: "admin",
          });
          ids.users.push(adminId);
          const guestId = await insertUser(sql, "target-guest", {
            guest: true,
          });
          ids.users.push(guestId);

          const inviteKey = operationId("created-invite");
          await expectProjectError(
            repository.inviteProjectMember({
              actorUserId: unauthorizedId,
              projectId: fixture.project.id,
              targetUserId: recipientId,
              expectedRevision: 1,
              operationId: operationId("non-owner-invite"),
            }),
            "project_forbidden"
          );
          const invited = await repository.inviteProjectMember({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            targetUserId: recipientId,
            expectedRevision: 1,
            operationId: inviteKey,
          });
          assert.equal(invited.project.revision, 2);
          const staleInviteKey = operationId("stale-before-target-check");
          await expectProjectError(
            repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: guestId,
              expectedRevision: 1,
              operationId: staleInviteKey,
            }),
            "revision_conflict"
          );
          const [staleOperationCount] = await sql<{ count: string }[]>`
            select count(*)::text as count from "ProjectOperation"
            where "actorUserId" = ${fixture.ownerId}
              and "operationId" = ${staleInviteKey}
          `;
          assert.equal(Number(staleOperationCount?.count), 0);
          const replay = await repository.inviteProjectMember({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            targetUserId: recipientId,
            expectedRevision: 1,
            operationId: inviteKey,
          });
          assert.equal(replay.replayed, true);
          assert.equal(replay.project.revision, 2);
          await expectProjectError(
            repository.inviteProjectMember({
              actorUserId: unauthorizedId,
              projectId: fixture.project.id,
              targetUserId: recipientId,
              expectedRevision: 1,
              operationId: inviteKey,
            }),
            "project_forbidden"
          );
          await expectProjectError(
            repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: lawyerId,
              expectedRevision: 1,
              operationId: inviteKey,
            }),
            "idempotency_conflict"
          );

          const ownerView = await repository.listProjectMembers({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
          });
          assert.equal(ownerView.length, 1);
          assert.deepEqual(Object.keys(ownerView[0] ?? {}).sort(), [
            "acceptedAt",
            "createdAt",
            "id",
            "revokedAt",
            "status",
            "updatedAt",
            "userId",
          ]);
          const [ownerMembership] = await sql<{ count: string }[]>`
          select count(*)::text as count from "ProjectMembership"
          where "projectId" = ${fixture.project.id} and "userId" = ${fixture.ownerId}
        `;
          assert.equal(Number(ownerMembership?.count), 0);

          const [membership] = await sql<{ id: string; status: string }[]>`
          select "id", "status" from "ProjectMembership"
          where "projectId" = ${fixture.project.id} and "userId" = ${recipientId}
        `;
          assert.ok(membership);
          await expectProjectError(
            repository.acceptProjectMembership({
              actorUserId: recipientId,
              projectId: randomUUID(),
              membershipId: membership.id,
              expectedRevision: 2,
              operationId: operationId("cross-project-accept"),
            }),
            "project_not_found"
          );
          const accepted = await repository.acceptProjectMembership({
            actorUserId: recipientId,
            projectId: fixture.project.id,
            membershipId: membership.id,
            expectedRevision: 2,
            operationId: operationId("accept"),
          });
          assert.equal(accepted.project.revision, 3);
          const acceptedReplay = await repository.acceptProjectMembership({
            actorUserId: recipientId,
            projectId: fixture.project.id,
            membershipId: membership.id,
            expectedRevision: 2,
            operationId:
              (
                await sql<{ operationId: string }[]>`
            select "operationId" from "ProjectOperation"
            where "actorUserId" = ${recipientId} and "operationType" = 'membership_accept'
            order by "createdAt" desc limit 1
          `
              )[0]?.operationId ?? "missing",
          });
          assert.equal(acceptedReplay.replayed, true);

          const revoked = await repository.revokeProjectMembership({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            membershipId: membership.id,
            expectedRevision: 3,
            operationId: operationId("revoke"),
          });
          assert.equal(revoked.project.revision, 4);
          const [revokedMembership] = await sql<
            {
              status: string;
              acceptedAt: Date | null;
              revokedAt: Date | null;
            }[]
          >`
            select "status", "acceptedAt", "revokedAt" from "ProjectMembership"
            where "id" = ${membership.id}
          `;
          assert.equal(revokedMembership?.status, "revoked");
          assert.ok(revokedMembership?.acceptedAt instanceof Date);
          assert.ok(revokedMembership?.revokedAt instanceof Date);
          await expectProjectError(
            repository.getProjectForActor({
              actorUserId: recipientId,
              projectId: fixture.project.id,
            }),
            "project_not_found"
          );
          await expectProjectError(
            repository.acceptProjectMembership({
              actorUserId: recipientId,
              projectId: fixture.project.id,
              membershipId: membership.id,
              expectedRevision: 4,
              operationId: operationId("reaccept-revoked"),
            }),
            "state_conflict"
          );

          const beforeNeutral = await projectRevision(sql, fixture.project.id);
          const neutralTargets = [
            randomUUID(),
            lawyerId,
            adminId,
            guestId,
            fixture.ownerId,
            recipientId,
          ];
          for (const targetUserId of neutralTargets) {
            const key = operationId("neutral-invite");
            await repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId,
              expectedRevision: beforeNeutral,
              operationId: key,
            });
            const [stored] = await sql<
              { resultKind: string; resultId: string }[]
            >`
            select "resultKind", "resultId" from "ProjectOperation"
            where "actorUserId" = ${fixture.ownerId} and "operationId" = ${key}
          `;
            assert.deepEqual(stored, {
              resultKind: "project",
              resultId: fixture.project.id,
            });
            const again = await repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId,
              expectedRevision: beforeNeutral,
              operationId: key,
            });
            assert.equal(again.replayed, true);
          }
          assert.equal(
            await projectRevision(sql, fixture.project.id),
            beforeNeutral
          );

          const createdLaterId = randomUUID();
          const laterKey = operationId("missing-target-neutral");
          await repository.inviteProjectMember({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            targetUserId: createdLaterId,
            expectedRevision: beforeNeutral,
            operationId: laterKey,
          });
          const lateEmail = `late-${randomUUID().replaceAll("-", "").slice(0, 20)}@example.test`;
          await sql`
          insert into "User" ("id", "email", "password")
          values (${createdLaterId}, ${lateEmail}, ${"x".repeat(64)})
        `;
          ids.users.push(createdLaterId);
          const replayAfterEligibilityChange =
            await repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: createdLaterId,
              expectedRevision: beforeNeutral,
              operationId: laterKey,
            });
          assert.equal(replayAfterEligibilityChange.replayed, true);
          const [lateMembershipCount] = await sql<{ count: string }[]>`
          select count(*)::text as count from "ProjectMembership"
          where "projectId" = ${fixture.project.id} and "userId" = ${createdLaterId}
        `;
          assert.equal(Number(lateMembershipCount?.count), 0);

          const [eventCount] = await sql<{ count: string }[]>`
          select count(*)::text as count from "ProjectEvent"
          where "projectId" = ${fixture.project.id} and "eventType" = 'membership_state_changed'
        `;
          assert.equal(Number(eventCount?.count), 3);
          const events = await sql<
            { projectRevision: number; operationType: string }[]
          >`
          select e."projectRevision", o."operationType"
          from "ProjectEvent" e
          join "ProjectOperation" o on o."id" = e."operationRecordId"
          where e."projectId" = ${fixture.project.id}
            and e."eventType" = 'membership_state_changed'
          order by e."projectRevision"
        `;
          assert.deepEqual(
            events.map((row) => row.projectRevision),
            [2, 3, 4]
          );
          assert.deepEqual(
            events.map((row) => row.operationType),
            ["membership_invite", "membership_accept", "membership_revoke"]
          );
        }
      );

      await t.test(
        "invitation operation outcome corruption is an integrity failure",
        async () => {
          const fixture = await createFixture(sql, repository, "tamper", ids);
          const targetId = await insertUser(sql, "tamper-target");
          ids.users.push(targetId);
          const other = await repository.createProject({
            actorUserId: fixture.ownerId,
            operationId: operationId("tamper-other-project"),
          });
          ids.projects.push(other.project.id);

          const successKey = operationId("tampered-success");
          await repository.inviteProjectMember({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            targetUserId: targetId,
            expectedRevision: 1,
            operationId: successKey,
          });
          await sql`
            update "ProjectOperation"
            set "resultKind" = 'project', "resultId" = ${fixture.project.id}
            where "actorUserId" = ${fixture.ownerId} and "operationId" = ${successKey}
          `;
          await expectProjectError(
            repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: targetId,
              expectedRevision: 1,
              operationId: successKey,
            }),
            "integrity_conflict"
          );

          const neutralKey = operationId("tampered-neutral");
          const absentTargetId = randomUUID();
          await repository.inviteProjectMember({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            targetUserId: absentTargetId,
            expectedRevision: 2,
            operationId: neutralKey,
          });
          await sql`
            update "ProjectOperation" set "resultId" = ${other.project.id}
            where "actorUserId" = ${fixture.ownerId} and "operationId" = ${neutralKey}
          `;
          await expectProjectError(
            repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: absentTargetId,
              expectedRevision: 2,
              operationId: neutralKey,
            }),
            "integrity_conflict"
          );
        }
      );

      await t.test(
        "concurrent invitation and accept/revoke linearization",
        async () => {
          const fixture = await createFixture(sql, repository, "races", ids);
          const targetId = await insertUser(sql, "race-target");
          ids.users.push(targetId);
          const sameKey = operationId("same-key-race");
          const identical = await Promise.all([
            repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: targetId,
              expectedRevision: 1,
              operationId: sameKey,
            }),
            repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: targetId,
              expectedRevision: 1,
              operationId: sameKey,
            }),
          ]);
          assert.equal(identical.filter((item) => item.replayed).length, 1);
          assert.equal(await projectRevision(sql, fixture.project.id), 2);
          const [sameKeyRows] = await sql<{ count: string }[]>`
          select count(*)::text as count from "ProjectMembership"
          where "projectId" = ${fixture.project.id} and "userId" = ${targetId}
        `;
          assert.equal(Number(sameKeyRows?.count), 1);

          const otherTargetId = await insertUser(sql, "different-key-target");
          ids.users.push(otherTargetId);
          const differentKeys = [
            operationId("different-key-a"),
            operationId("different-key-b"),
          ];
          const differentKeyResults = await Promise.allSettled([
            repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: otherTargetId,
              expectedRevision: 2,
              operationId: differentKeys[0] as string,
            }),
            repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: otherTargetId,
              expectedRevision: 2,
              operationId: differentKeys[1] as string,
            }),
          ]);
          assert.equal(
            differentKeyResults.filter(
              (result) => result.status === "fulfilled"
            ).length,
            1
          );
          assert.equal(
            differentKeyResults.filter((result) => result.status === "rejected")
              .length,
            1
          );
          const losingDifferentKey = differentKeyResults.find(
            (result) => result.status === "rejected"
          );
          assert.ok(losingDifferentKey?.status === "rejected");
          assert.ok(
            losingDifferentKey.reason instanceof ProjectFoundationError &&
              losingDifferentKey.reason.code === "revision_conflict"
          );
          const [differentKeyOperationCount] = await sql<{ count: string }[]>`
            select count(*)::text as count from "ProjectOperation"
            where "actorUserId" = ${fixture.ownerId}
              and "operationId" = any(${sql.array(differentKeys)})
          `;
          assert.equal(Number(differentKeyOperationCount?.count), 1);
          const [afterDifferentKey] = await sql<{ revision: number }[]>`
          select "revision" from "StudyJourneyProject" where "id" = ${fixture.project.id}
        `;
          assert.equal(afterDifferentKey?.revision, 3);
          await repository.inviteProjectMember({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            targetUserId: otherTargetId,
            expectedRevision: 3,
            operationId: operationId("fresh-neutral-followup"),
          });
          assert.equal(await projectRevision(sql, fixture.project.id), 3);

          const acceptRevokeFixture = await createFixture(
            sql,
            repository,
            "accept-revoke",
            ids
          );
          const inviteeId = await insertUser(sql, "accept-revoke-invitee");
          ids.users.push(inviteeId);
          const invite = await repository.inviteProjectMember({
            actorUserId: acceptRevokeFixture.ownerId,
            projectId: acceptRevokeFixture.project.id,
            targetUserId: inviteeId,
            expectedRevision: 1,
            operationId: operationId("race-pending-invite"),
          });
          assert.equal(invite.project.revision, 2);
          const [pending] = await sql<{ id: string }[]>`
          select "id" from "ProjectMembership"
          where "projectId" = ${acceptRevokeFixture.project.id} and "userId" = ${inviteeId}
        `;
          assert.ok(pending);
          const transitionRace = await Promise.allSettled([
            repository.acceptProjectMembership({
              actorUserId: inviteeId,
              projectId: acceptRevokeFixture.project.id,
              membershipId: pending.id,
              expectedRevision: 2,
              operationId: operationId("race-accept"),
            }),
            repository.revokeProjectMembership({
              actorUserId: acceptRevokeFixture.ownerId,
              projectId: acceptRevokeFixture.project.id,
              membershipId: pending.id,
              expectedRevision: 2,
              operationId: operationId("race-revoke"),
            }),
          ]);
          assert.equal(
            transitionRace.filter((item) => item.status === "fulfilled").length,
            1
          );
          assert.equal(
            transitionRace.filter((item) => item.status === "rejected").length,
            1
          );
          const losingTransition = transitionRace.find(
            (item) => item.status === "rejected"
          );
          assert.ok(losingTransition?.status === "rejected");
          assert.ok(
            losingTransition.reason instanceof ProjectFoundationError &&
              losingTransition.reason.code === "revision_conflict"
          );
          assert.equal(
            await projectRevision(sql, acceptRevokeFixture.project.id),
            3
          );
          const [raceState] = await sql<{ status: string }[]>`
          select "status" from "ProjectMembership" where "id" = ${pending.id}
        `;
          assert.ok(
            raceState?.status === "active" || raceState?.status === "revoked"
          );
          if (raceState.status === "active") {
            await repository.revokeProjectMembership({
              actorUserId: acceptRevokeFixture.ownerId,
              projectId: acceptRevokeFixture.project.id,
              membershipId: pending.id,
              expectedRevision: 3,
              operationId: operationId("fresh-revoke-after-accept"),
            });
          }
          const [finalState] = await sql<{ status: string }[]>`
          select "status" from "ProjectMembership" where "id" = ${pending.id}
        `;
          assert.equal(finalState?.status, "revoked");
        }
      );

      await t.test(
        "closed Project replay and cross-Project isolation",
        async () => {
          const fixture = await createFixture(sql, repository, "closed", ids);
          const inviteeId = await insertUser(sql, "closed-invitee");
          ids.users.push(inviteeId);
          const inviteKey = operationId("closed-replay-invite");
          const invite = await repository.inviteProjectMember({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            targetUserId: inviteeId,
            expectedRevision: 1,
            operationId: inviteKey,
          });
          const [membership] = await sql<{ id: string }[]>`
          select "id" from "ProjectMembership"
          where "projectId" = ${fixture.project.id} and "userId" = ${inviteeId}
        `;
          assert.ok(membership);
          const other = await repository.createProject({
            actorUserId: fixture.ownerId,
            operationId: operationId("other-project-same-owner"),
          });
          ids.projects.push(other.project.id);
          await expectProjectError(
            repository.acceptProjectMembership({
              actorUserId: inviteeId,
              projectId: other.project.id,
              membershipId: membership.id,
              expectedRevision: 1,
              operationId: operationId("cross-project-membership"),
            }),
            "project_forbidden"
          );
          await expectProjectError(
            repository.revokeProjectMembership({
              actorUserId: fixture.ownerId,
              projectId: other.project.id,
              membershipId: membership.id,
              expectedRevision: 1,
              operationId: operationId("cross-project-revoke"),
            }),
            "project_not_found"
          );

          const closed = await repository.closeProject({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            expectedRevision: invite.project.revision,
            operationId: operationId("close-with-pending"),
          });
          assert.equal(closed.project.status, "closed");
          assert.deepEqual(
            (await repository.listProjects(fixture.ownerId)).map(
              (item) => item.id
            ),
            [other.project.id]
          );
          assert.deepEqual(
            await repository.listPendingInvitations(inviteeId),
            []
          );
          await expectProjectError(
            repository.getProjectForActor({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
            }),
            "project_not_found"
          );
          await expectProjectError(
            repository.listProjectMembers({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
            }),
            "project_not_found"
          );
          const replay = await repository.inviteProjectMember({
            actorUserId: fixture.ownerId,
            projectId: fixture.project.id,
            targetUserId: inviteeId,
            expectedRevision: 1,
            operationId: inviteKey,
          });
          assert.equal(replay.replayed, true);
          await expectProjectError(
            repository.revokeProjectMembership({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              membershipId: membership.id,
              expectedRevision: closed.project.revision,
              operationId: operationId("closed-revoke"),
            }),
            "project_closed"
          );
          await expectProjectError(
            repository.acceptProjectMembership({
              actorUserId: inviteeId,
              projectId: fixture.project.id,
              membershipId: membership.id,
              expectedRevision: closed.project.revision,
              operationId: operationId("closed-accept"),
            }),
            "project_closed"
          );
          await expectProjectError(
            repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: randomUUID(),
              expectedRevision: closed.project.revision,
              operationId: operationId("closed-invite"),
            }),
            "project_closed"
          );
        }
      );

      await t.test(
        "write-boundary failures roll back operation, membership, revision and event",
        async () => {
          const inviteBoundaries = [
            "operation_claimed",
            "membership_created",
            "operation_result_updated",
            "project_revised",
            "event_created",
          ] as const;
          for (const boundary of inviteBoundaries) {
            const fixture = await createFixture(
              sql,
              repository,
              `rollback-${boundary}`,
              ids
            );
            const targetId = await insertUser(sql, `target-${boundary}`);
            ids.users.push(targetId);
            const key = operationId(`fault-${boundary}`);
            const faultingRepository = createProjectFoundationRepository({
              testHooks: {
                afterWrite(actual) {
                  if (actual === boundary) {
                    throw new Error("injected_failure");
                  }
                },
              },
            });
            await assert.rejects(
              faultingRepository.inviteProjectMember({
                actorUserId: fixture.ownerId,
                projectId: fixture.project.id,
                targetUserId: targetId,
                expectedRevision: 1,
                operationId: key,
              }),
              /injected_failure/u
            );
            assert.equal(await projectRevision(sql, fixture.project.id), 1);
            const [counts] = await sql<
              { operations: string; memberships: string; events: string }[]
            >`
            select
              (select count(*)::text from "ProjectOperation" where "actorUserId" = ${fixture.ownerId} and "operationId" = ${key}) as operations,
              (select count(*)::text from "ProjectMembership" where "projectId" = ${fixture.project.id}) as memberships,
              (select count(*)::text from "ProjectEvent" where "projectId" = ${fixture.project.id}) as events
          `;
            assert.deepEqual(counts, {
              operations: "0",
              memberships: "0",
              events: "1",
            });
          }

          for (const boundary of [
            "membership_updated",
            "project_revised",
            "event_created",
          ] as const) {
            const fixture = await createFixture(
              sql,
              repository,
              `rollback-accept-${boundary}`,
              ids
            );
            const inviteeId = await insertUser(sql, `accept-${boundary}`);
            ids.users.push(inviteeId);
            await repository.inviteProjectMember({
              actorUserId: fixture.ownerId,
              projectId: fixture.project.id,
              targetUserId: inviteeId,
              expectedRevision: 1,
              operationId: operationId("setup-invite"),
            });
            const [membership] = await sql<{ id: string }[]>`
            select "id" from "ProjectMembership"
            where "projectId" = ${fixture.project.id} and "userId" = ${inviteeId}
          `;
            assert.ok(membership);
            const key = operationId(`fault-accept-${boundary}`);
            const faultingRepository = createProjectFoundationRepository({
              testHooks: {
                afterWrite(actual) {
                  if (actual === boundary) {
                    throw new Error("injected_failure");
                  }
                },
              },
            });
            await assert.rejects(
              faultingRepository.acceptProjectMembership({
                actorUserId: inviteeId,
                projectId: fixture.project.id,
                membershipId: membership.id,
                expectedRevision: 2,
                operationId: key,
              }),
              /injected_failure/u
            );
            assert.equal(await projectRevision(sql, fixture.project.id), 2);
            const [state] = await sql<
              { status: string; operations: string; events: string }[]
            >`
            select
              (select "status" from "ProjectMembership" where "id" = ${membership.id}) as status,
              (select count(*)::text from "ProjectOperation" where "actorUserId" = ${inviteeId} and "operationId" = ${key}) as operations,
              (select count(*)::text from "ProjectEvent" where "projectId" = ${fixture.project.id}) as events
          `;
            assert.deepEqual(state, {
              status: "pending",
              operations: "0",
              events: "2",
            });
          }
        }
      );
    } finally {
      await cleanup(sql, ids).catch(() => undefined);
      await sql.end({ timeout: 5 });
      await closeProjectFoundationSchemaClient();
      await closeLazyDatabase();
    }
  }
);
