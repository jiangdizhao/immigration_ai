import "server-only";

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  SubmissionAuthorizationError,
  type SubmissionHandoffStatus,
} from "./contracts";
import type {
  AuthorizationActorContext,
  AuthorizationMembershipStatus,
  AuthorizationWriteGuard,
  SubmissionAuthorizationRecord,
  SubmissionAuthorizationStore,
  SubmissionExternalRecord,
  SubmissionHandoffEventRecord,
  SubmissionHandoffRecord,
} from "./ports";

/**
 * Phase 13 M8.2 PostgreSQL store (migration 0052).
 *
 * Durable-write boundary: every write runs inside one transaction that first locks
 * the Project row (`SELECT ... FOR UPDATE`, the established M1/M5/M6 lock order) and
 * re-derives the actor's authority from persisted rows. A membership revocation, a
 * staff-assignment revocation or a Project closure between the service's preliminary
 * read and the commit therefore cannot produce a successful invalid write.
 *
 * Database-owned invariants (0052):
 *   - `unique (projectId, operationId)` per family makes an exact retry a lookup and
 *     a changed request an idempotency conflict;
 *   - the composite foreign keys bind every row to the exact package version and, for
 *     a handoff, to the authorization it was created from;
 *   - one live handoff per package version (partial unique index);
 *   - compare-and-set `revision` plus a transition trigger forbids rewriting state;
 *   - insert-only triggers make authorizations, handoff events and external records
 *     immutable.
 *
 * Every read is filtered by `projectId`, so a member of another Project can never
 * observe or act on a foreign authorization.
 */

const db = () => getLazyDatabase();

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

type AuthorizationRow = {
  id: string;
  projectId: string;
  targetKind: string;
  targetId: string;
  packageVersionId: string;
  packageVersion: number;
  targetVersion: number;
  manifestSha256: string;
  authorizationType: string;
  disclosurePolicyVersion: string;
  acknowledgedDisclosures: unknown;
  bindingSha256: string;
  actorUserId: string;
  operationId: string;
  requestSha256: string;
  authorizedAt: string | Date;
};

type HandoffRow = {
  id: string;
  projectId: string;
  targetKind: string;
  targetId: string;
  packageVersionId: string;
  packageVersion: number;
  manifestSha256: string;
  authorizationId: string;
  status: string;
  revision: number;
  requestedByUserId: string;
  recipientUserId: string | null;
  operationId: string;
  requestSha256: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type HandoffEventRow = {
  id: string;
  projectId: string;
  handoffId: string;
  status: string;
  actorUserId: string;
  reasonCode: string | null;
  createdAt: string | Date;
};

type ExternalRecordRow = {
  id: string;
  projectId: string;
  targetKind: string;
  targetId: string;
  handoffId: string | null;
  packageVersionId: string;
  kind: string;
  channel: string | null;
  outcomeCode: string | null;
  reference: string | null;
  provenance: string;
  verification: string;
  verifierCode: string | null;
  occurredAt: string;
  reportedByUserId: string;
  operationId: string;
  requestSha256: string;
  createdAt: string | Date;
};

const AUTHORIZATION_COLUMNS = `"id", "projectId", "targetKind", "targetId",
  "packageVersionId", "packageVersion", "targetVersion", "manifestSha256",
  "authorizationType", "disclosurePolicyVersion", "acknowledgedDisclosures",
  "bindingSha256", "actorUserId", "operationId", "requestSha256", "authorizedAt"`;

const HANDOFF_COLUMNS = `"id", "projectId", "targetKind", "targetId",
  "packageVersionId", "packageVersion", "manifestSha256", "authorizationId",
  "status", "revision", "requestedByUserId", "recipientUserId", "operationId",
  "requestSha256", "createdAt", "updatedAt"`;

const EVENT_COLUMNS = `"id", "projectId", "handoffId", "handoffRevision", "status",
  "actorUserId", "reasonCode", "createdAt"`;

const EXTERNAL_COLUMNS = `"id", "projectId", "targetKind", "targetId", "handoffId",
  "packageVersionId", "kind", "channel", "outcomeCode", "reference", "provenance",
  "verification", "verifierCode", "occurredAt", "reportedByUserId", "operationId",
  "requestSha256", "createdAt"`;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows?: T[] }).rows ?? []) as T[];
  }
  return [];
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function constraintName(error: unknown): string {
  return String(
    (error as { constraint_name?: string }).constraint_name ??
      (error as { constraint?: string }).constraint ??
      ""
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23503"
  );
}

/**
 * Maps a database rejection onto a stable code. A composite-identity FK rejection is
 * an integrity conflict, never a silent success; a unique rejection is either an
 * idempotency replay or a state conflict depending on which key fired.
 */
function mapWriteError(
  error: unknown,
  duplicateCode: "handoff_state_conflict" | "integrity_conflict"
): unknown {
  if (error instanceof SubmissionAuthorizationError) {
    return error;
  }
  if (isForeignKeyViolation(error)) {
    return new SubmissionAuthorizationError("integrity_conflict");
  }
  if (!isUniqueViolation(error)) {
    return error;
  }
  const name = constraintName(error);
  if (name.includes("operation")) {
    return new SubmissionAuthorizationError("idempotency_conflict");
  }
  if (name.includes("live_package")) {
    return new SubmissionAuthorizationError("handoff_state_conflict");
  }
  if (name.includes("handoff_revision")) {
    return new SubmissionAuthorizationError("revision_conflict");
  }
  if (name.includes("binding")) {
    return new SubmissionAuthorizationError("integrity_conflict");
  }
  return new SubmissionAuthorizationError(duplicateCode);
}

function membershipStatusOf(
  value: string | null
): AuthorizationMembershipStatus {
  if (value === null) {
    return "missing";
  }
  if (value === "active") {
    return "active_member";
  }
  if (value === "pending") {
    return "pending";
  }
  return "revoked";
}

function assignmentStatusOf(
  value: string | null
): "active" | "pending" | "revoked" {
  if (value === "active") {
    return "active";
  }
  if (value === "proposed" || value === "owner_approved") {
    return "pending";
  }
  return "revoked";
}

/**
 * Locks the Project row and re-derives authority inside the write transaction.
 * Throws a coded error, so the whole transaction rolls back and nothing persists.
 */
async function lockAndAssertAuthority(
  tx: Tx,
  projectId: string,
  guard: AuthorizationWriteGuard
): Promise<void> {
  const rows = rowsOf<{
    ownerUserId: string;
    status: string;
    role: string | null;
    email: string | null;
    assignmentStatus: string | null;
  }>(
    await tx.execute(sql`
      select p."ownerUserId" as "ownerUserId",
             p."status" as "status",
             u."role" as "role",
             u."email" as "email",
             (
               select a."status" from "ProjectStaffAssignment" a
               where a."projectId" = p."id"
                 and a."staffUserId" = ${guard.actorUserId}
                 and a."purpose" = 'project_staff_collaboration'
               order by a."createdAt" desc
               limit 1
             ) as "assignmentStatus"
      from "StudyJourneyProject" p
      left join "User" u on u."id" = ${guard.actorUserId}
      where p."id" = ${projectId}
      for update of p
    `)
  );
  const row = rows[0];
  if (!row) {
    throw new SubmissionAuthorizationError("project_not_found");
  }
  const isCustomer =
    row.role === "user" && (row.email === null || !guestRegex.test(row.email));
  if (guard.allowAssignedStaff) {
    if (isCustomer) {
      throw new SubmissionAuthorizationError("actor_not_staff");
    }
    if (assignmentStatusOf(row.assignmentStatus) !== "active") {
      throw new SubmissionAuthorizationError("handoff_actor_not_authorized");
    }
  } else {
    if (!isCustomer) {
      throw new SubmissionAuthorizationError("actor_not_eligible");
    }
    if (row.ownerUserId !== guard.actorUserId) {
      const membership = rowsOf<{ status: string }>(
        await tx.execute(sql`
          select "status" from "ProjectMembership"
          where "projectId" = ${projectId} and "userId" = ${guard.actorUserId}
          limit 1
        `)
      )[0];
      if (membership?.status !== "active") {
        throw new SubmissionAuthorizationError("project_forbidden");
      }
    }
  }
  if (guard.requireActiveProject && row.status !== "active") {
    throw new SubmissionAuthorizationError("project_closed");
  }
}

export function createPostgresSubmissionAuthorizationStore(): SubmissionAuthorizationStore {
  function toAuthorization(
    row: AuthorizationRow
  ): SubmissionAuthorizationRecord {
    return {
      acknowledgedDisclosures: Array.isArray(row.acknowledgedDisclosures)
        ? (row.acknowledgedDisclosures as string[])
        : [],
      actorUserId: row.actorUserId,
      authorizationType:
        row.authorizationType as SubmissionAuthorizationRecord["authorizationType"],
      authorizedAt: toDate(row.authorizedAt),
      bindingSha256: row.bindingSha256,
      disclosurePolicyVersion: row.disclosurePolicyVersion,
      id: row.id,
      manifestSha256: row.manifestSha256,
      operationId: row.operationId,
      packageVersion: row.packageVersion,
      packageVersionId: row.packageVersionId,
      projectId: row.projectId,
      requestSha256: row.requestSha256,
      targetId: row.targetId,
      targetKind: row.targetKind as SubmissionAuthorizationRecord["targetKind"],
      targetVersion: row.targetVersion,
    };
  }

  function toHandoff(row: HandoffRow): SubmissionHandoffRecord {
    return {
      authorizationId: row.authorizationId,
      createdAt: toDate(row.createdAt),
      id: row.id,
      manifestSha256: row.manifestSha256,
      operationId: row.operationId,
      packageVersion: row.packageVersion,
      packageVersionId: row.packageVersionId,
      projectId: row.projectId,
      recipientUserId: row.recipientUserId,
      requestSha256: row.requestSha256,
      requestedByUserId: row.requestedByUserId,
      revision: row.revision,
      status: row.status as SubmissionHandoffStatus,
      targetId: row.targetId,
      targetKind: row.targetKind as SubmissionHandoffRecord["targetKind"],
      updatedAt: toDate(row.updatedAt),
    };
  }

  function toEvent(row: HandoffEventRow): SubmissionHandoffEventRecord {
    return {
      actorUserId: row.actorUserId,
      createdAt: toDate(row.createdAt),
      handoffId: row.handoffId,
      id: row.id,
      projectId: row.projectId,
      reasonCode: row.reasonCode,
      status: row.status as SubmissionHandoffStatus,
    };
  }

  function toExternalRecord(row: ExternalRecordRow): SubmissionExternalRecord {
    return {
      channel: row.channel as SubmissionExternalRecord["channel"],
      createdAt: toDate(row.createdAt),
      handoffId: row.handoffId,
      id: row.id,
      kind: row.kind as SubmissionExternalRecord["kind"],
      occurredAt: row.occurredAt,
      operationId: row.operationId,
      outcomeCode: row.outcomeCode as SubmissionExternalRecord["outcomeCode"],
      packageVersionId: row.packageVersionId,
      projectId: row.projectId,
      provenance: row.provenance as SubmissionExternalRecord["provenance"],
      reference: row.reference,
      reportedByUserId: row.reportedByUserId,
      requestSha256: row.requestSha256,
      targetId: row.targetId,
      targetKind: row.targetKind as SubmissionExternalRecord["targetKind"],
      verification:
        row.verification as SubmissionExternalRecord["verification"],
      verifierCode: row.verifierCode,
    };
  }

  return {
    async readActorContext(input): Promise<AuthorizationActorContext> {
      const rows = rowsOf<{
        id: string;
        ownerUserId: string;
        status: string;
        role: string | null;
        email: string | null;
        membershipStatus: string | null;
        assignmentId: string | null;
        assignmentStatus: string | null;
      }>(
        await db().execute(sql`
          select p."id" as "id",
                 p."ownerUserId" as "ownerUserId",
                 p."status" as "status",
                 u."role" as "role",
                 u."email" as "email",
                 (
                   select m."status" from "ProjectMembership" m
                   where m."projectId" = p."id"
                     and m."userId" = ${input.actorUserId}
                   limit 1
                 ) as "membershipStatus",
                 (
                   select a."id" from "ProjectStaffAssignment" a
                   where a."projectId" = p."id"
                     and a."staffUserId" = ${input.actorUserId}
                     and a."purpose" = 'project_staff_collaboration'
                   order by a."createdAt" desc
                   limit 1
                 ) as "assignmentId",
                 (
                   select a."status" from "ProjectStaffAssignment" a
                   where a."projectId" = p."id"
                     and a."staffUserId" = ${input.actorUserId}
                     and a."purpose" = 'project_staff_collaboration'
                   order by a."createdAt" desc
                   limit 1
                 ) as "assignmentStatus"
          from "StudyJourneyProject" p
          left join "User" u on u."id" = ${input.actorUserId}
          where p."id" = ${input.projectId}
          limit 1
        `)
      );
      const row = rows[0];
      const role = row?.role ?? null;
      const email = row?.email ?? null;
      const registeredCustomer =
        role === "user" && (email === null || !guestRegex.test(email));
      return {
        // The Project owner has no ProjectMembership row of their own: production
        // project creation deliberately creates none. Ownership is therefore derived
        // from StudyJourneyProject.ownerUserId, exactly like the in-memory store and
        // like the write guard below. Without this, a legitimate owner was reported as
        // "missing" and every owner-initiated authorization was refused with
        // project_forbidden.
        membershipStatus:
          row === undefined
            ? "missing"
            : row.ownerUserId === input.actorUserId
              ? "owner"
              : membershipStatusOf(row.membershipStatus),
        project: row
          ? {
              id: row.id,
              ownerUserId: row.ownerUserId,
              status: row.status === "active" ? "active" : "closed",
            }
          : null,
        registeredCustomer,
        staff: row !== undefined && role !== null && role !== "user",
        staffAssignment:
          row?.assignmentId && row.assignmentStatus
            ? {
                id: row.assignmentId,
                reviewerUserId: input.actorUserId,
                status: assignmentStatusOf(row.assignmentStatus),
              }
            : null,
        staffRole: role,
      };
    },

    async listAuthorizations(input) {
      const rows = rowsOf<AuthorizationRow>(
        await db().execute(sql`
          select ${sql.raw(AUTHORIZATION_COLUMNS)} from "SubmissionAuthorization"
          where "projectId" = ${input.projectId}
            and "targetKind" = ${input.targetKind}
            and "targetId" = ${input.targetId}
          order by "authorizedAt" desc
        `)
      );
      return rows.map(toAuthorization);
    },

    async findAuthorizationOperation(input) {
      const rows = rowsOf<AuthorizationRow>(
        await db().execute(sql`
          select ${sql.raw(AUTHORIZATION_COLUMNS)} from "SubmissionAuthorization"
          where "projectId" = ${input.projectId}
            and "operationId" = ${input.operationId}
          limit 1
        `)
      );
      return rows[0] ? toAuthorization(rows[0]) : null;
    },

    async insertAuthorization(input) {
      try {
        return await db().transaction(async (tx) => {
          await lockAndAssertAuthority(tx, input.projectId, input.guard);
          const replay = rowsOf<AuthorizationRow>(
            await tx.execute(sql`
              select ${sql.raw(AUTHORIZATION_COLUMNS)} from "SubmissionAuthorization"
              where "projectId" = ${input.projectId}
                and "operationId" = ${input.operation.operationId}
              limit 1
            `)
          )[0];
          if (replay) {
            if (replay.requestSha256 !== input.operation.requestSha256) {
              throw new SubmissionAuthorizationError("idempotency_conflict");
            }
            return { replayed: true, value: toAuthorization(replay) };
          }
          const values = input.values;
          const inserted = rowsOf<AuthorizationRow>(
            await tx.execute(sql`
              insert into "SubmissionAuthorization" (
                "id", "projectId", "targetKind", "targetId", "packageVersionId",
                "packageVersion", "targetVersion", "manifestSha256",
                "authorizationType", "disclosurePolicyVersion",
                "acknowledgedDisclosures", "bindingSha256", "actorUserId",
                "operationId", "requestSha256"
              ) values (
                ${values.id}, ${input.projectId}, ${values.targetKind},
                ${values.targetId}, ${values.packageVersionId},
                ${values.packageVersion}, ${values.targetVersion},
                ${values.manifestSha256}, ${values.authorizationType},
                ${values.disclosurePolicyVersion},
                ${JSON.stringify(values.acknowledgedDisclosures)}::jsonb,
                ${values.bindingSha256}, ${input.operation.actorUserId},
                ${input.operation.operationId}, ${input.operation.requestSha256}
              )
              returning ${sql.raw(AUTHORIZATION_COLUMNS)}
            `)
          )[0];
          if (!inserted) {
            throw new SubmissionAuthorizationError("integrity_conflict");
          }
          return { replayed: false, value: toAuthorization(inserted) };
        });
      } catch (error) {
        throw mapWriteError(error, "integrity_conflict");
      }
    },

    async listHandoffs(input) {
      const rows = rowsOf<HandoffRow>(
        await db().execute(sql`
          select ${sql.raw(HANDOFF_COLUMNS)} from "SubmissionHandoff"
          where "projectId" = ${input.projectId}
            and "targetKind" = ${input.targetKind}
            and "targetId" = ${input.targetId}
          order by "createdAt" desc
        `)
      );
      return rows.map(toHandoff);
    },

    async findHandoffOperation(input) {
      const rows = rowsOf<HandoffRow>(
        await db().execute(sql`
          select ${sql.raw(HANDOFF_COLUMNS)} from "SubmissionHandoff"
          where "projectId" = ${input.projectId}
            and "operationId" = ${input.operationId}
          limit 1
        `)
      );
      return rows[0] ? toHandoff(rows[0]) : null;
    },

    async insertHandoff(input) {
      try {
        return await db().transaction(async (tx) => {
          await lockAndAssertAuthority(tx, input.projectId, input.guard);
          const replay = rowsOf<HandoffRow>(
            await tx.execute(sql`
              select ${sql.raw(HANDOFF_COLUMNS)} from "SubmissionHandoff"
              where "projectId" = ${input.projectId}
                and "operationId" = ${input.operation.operationId}
              limit 1
            `)
          )[0];
          if (replay) {
            if (replay.requestSha256 !== input.operation.requestSha256) {
              throw new SubmissionAuthorizationError("idempotency_conflict");
            }
            return { replayed: true, value: toHandoff(replay) };
          }
          const values = input.values;
          const inserted = rowsOf<HandoffRow>(
            await tx.execute(sql`
              insert into "SubmissionHandoff" (
                "id", "projectId", "targetKind", "targetId", "packageVersionId",
                "packageVersion", "manifestSha256", "authorizationId", "status",
                "revision", "requestedByUserId", "recipientUserId", "operationId",
                "requestSha256"
              ) values (
                ${values.id}, ${input.projectId}, ${values.targetKind},
                ${values.targetId}, ${values.packageVersionId},
                ${values.packageVersion}, ${values.manifestSha256},
                ${values.authorizationId}, 'requested', 1,
                ${input.operation.actorUserId}, ${values.recipientUserId},
                ${input.operation.operationId}, ${input.operation.requestSha256}
              )
              returning ${sql.raw(HANDOFF_COLUMNS)}
            `)
          )[0];
          if (!inserted) {
            throw new SubmissionAuthorizationError("integrity_conflict");
          }
          await tx.execute(sql`
            insert into "SubmissionHandoffEvent" (
              "id", "projectId", "handoffId", "handoffRevision", "status",
              "actorUserId", "reasonCode"
            ) values (
              ${randomUUID()},
              ${input.projectId}, ${values.id}, 1, 'requested',
              ${input.operation.actorUserId}, null
            )
          `);
          return { replayed: false, value: toHandoff(inserted) };
        });
      } catch (error) {
        throw mapWriteError(error, "handoff_state_conflict");
      }
    },

    async transitionHandoff(input) {
      try {
        return await db().transaction(async (tx) => {
          await lockAndAssertAuthority(tx, input.projectId, input.guard);
          const current = rowsOf<HandoffRow>(
            await tx.execute(sql`
              select ${sql.raw(HANDOFF_COLUMNS)} from "SubmissionHandoff"
              where "projectId" = ${input.projectId} and "id" = ${input.handoffId}
              for update
            `)
          )[0];
          if (!current) {
            throw new SubmissionAuthorizationError("handoff_not_found");
          }
          if (current.revision !== input.expectedRevision) {
            throw new SubmissionAuthorizationError("revision_conflict");
          }
          const updated = rowsOf<HandoffRow>(
            await tx.execute(sql`
              update "SubmissionHandoff"
                 set "status" = ${input.toStatus},
                     "revision" = "revision" + 1
               where "projectId" = ${input.projectId}
                 and "id" = ${input.handoffId}
                 and "revision" = ${input.expectedRevision}
              returning ${sql.raw(HANDOFF_COLUMNS)}
            `)
          )[0];
          if (!updated) {
            throw new SubmissionAuthorizationError("revision_conflict");
          }
          await tx.execute(sql`
            insert into "SubmissionHandoffEvent" (
              "id", "projectId", "handoffId", "handoffRevision", "status",
              "actorUserId", "reasonCode"
            ) values (
              ${input.eventId}, ${input.projectId}, ${input.handoffId},
              ${updated.revision}, ${input.toStatus}, ${input.actorUserId},
              ${input.reasonCode}
            )
          `);
          return toHandoff(updated);
        });
      } catch (error) {
        throw mapWriteError(error, "handoff_state_conflict");
      }
    },

    async listHandoffEvents(input) {
      const rows = rowsOf<HandoffEventRow>(
        await db().execute(sql`
          select ${sql.raw(EVENT_COLUMNS)} from "SubmissionHandoffEvent"
          where "projectId" = ${input.projectId}
            and "handoffId" = ${input.handoffId}
          order by "handoffRevision" asc
        `)
      );
      return rows.map(toEvent);
    },

    async listExternalRecords(input) {
      const rows = rowsOf<ExternalRecordRow>(
        await db().execute(sql`
          select ${sql.raw(EXTERNAL_COLUMNS)} from "SubmissionExternalRecord"
          where "projectId" = ${input.projectId}
            and "targetKind" = ${input.targetKind}
            and "targetId" = ${input.targetId}
          order by "occurredAt" desc
        `)
      );
      return rows.map(toExternalRecord);
    },

    async findExternalRecordOperation(input) {
      const rows = rowsOf<ExternalRecordRow>(
        await db().execute(sql`
          select ${sql.raw(EXTERNAL_COLUMNS)} from "SubmissionExternalRecord"
          where "projectId" = ${input.projectId}
            and "operationId" = ${input.operationId}
          limit 1
        `)
      );
      return rows[0] ? toExternalRecord(rows[0]) : null;
    },

    async insertExternalRecord(input) {
      try {
        return await db().transaction(async (tx) => {
          await lockAndAssertAuthority(tx, input.projectId, input.guard);
          const replay = rowsOf<ExternalRecordRow>(
            await tx.execute(sql`
              select ${sql.raw(EXTERNAL_COLUMNS)} from "SubmissionExternalRecord"
              where "projectId" = ${input.projectId}
                and "operationId" = ${input.operation.operationId}
              limit 1
            `)
          )[0];
          if (replay) {
            if (replay.requestSha256 !== input.operation.requestSha256) {
              throw new SubmissionAuthorizationError("idempotency_conflict");
            }
            return { replayed: true, value: toExternalRecord(replay) };
          }
          const values = input.values;
          const inserted = rowsOf<ExternalRecordRow>(
            await tx.execute(sql`
              insert into "SubmissionExternalRecord" (
                "id", "projectId", "targetKind", "targetId", "handoffId",
                "packageVersionId", "kind", "channel", "outcomeCode", "reference",
                "provenance", "verification", "verifierCode", "occurredAt",
                "reportedByUserId", "operationId", "requestSha256"
              ) values (
                ${values.id}, ${input.projectId}, ${values.targetKind},
                ${values.targetId}, ${values.handoffId}, ${values.packageVersionId},
                ${values.kind}, ${values.channel}, ${values.outcomeCode},
                ${values.reference}, ${values.provenance}, ${values.verification},
                ${values.verifierCode}, ${values.occurredAt},
                ${input.operation.actorUserId}, ${input.operation.operationId},
                ${input.operation.requestSha256}
              )
              returning ${sql.raw(EXTERNAL_COLUMNS)}
            `)
          )[0];
          if (!inserted) {
            throw new SubmissionAuthorizationError("integrity_conflict");
          }
          return { replayed: false, value: toExternalRecord(inserted) };
        });
      } catch (error) {
        throw mapWriteError(error, "integrity_conflict");
      }
    },
  };
}
