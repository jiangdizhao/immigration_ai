import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import { projectMembership, studyJourneyProject, user } from "@/lib/db/schema";
import {
  type SubmissionConfirmationType,
  SubmissionPackageError,
  type SubmissionStaleReason,
} from "./contracts";
import type {
  SubmissionActorContext,
  SubmissionConfirmationRecord,
  SubmissionFinalizationRecord,
  SubmissionInvalidationRecord,
  SubmissionPackageRecord,
  SubmissionPackageStore,
  SubmissionWriteGuard,
} from "./ports";

/**
 * Phase 13 M8.1 PostgreSQL store (migration 0051).
 *
 * Durable-write boundary: every insert runs inside one transaction that first locks
 * the Project row (`SELECT ... FOR UPDATE`, the established M1/M5/M6 lock order) and
 * re-derives the actor's authority from persisted rows. A membership revocation or
 * Project closure between the service's preliminary read and the commit therefore
 * cannot produce a successful invalid write - the guard fails inside the transaction
 * and nothing is persisted.
 *
 * Database-owned invariants (0051):
 *   - `unique (projectId, targetKind, targetId, version)` allocates versions safely;
 *   - `unique (projectId, operationId)` makes an exact retry a lookup and a changed
 *     request an idempotency conflict;
 *   - `unique (packageVersionId, confirmationType)` keeps one current confirmation;
 *   - the composite foreign key `(projectId, targetKind, targetId, packageVersionId,
 *     packageVersion, manifestSha256)` makes a contradictory confirmation row
 *     impossible rather than merely unlikely;
 *   - the triggers refuse every UPDATE and DELETE, so history is append-only.
 *
 * Every read is filtered by `projectId`, so a member of another Project can never
 * observe or confirm a foreign package.
 */

const db = () => getLazyDatabase();

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

type PackageRow = {
  id: string;
  projectId: string;
  targetKind: string;
  targetId: string;
  version: number;
  status: string;
  schemaVersion: string;
  manifest: unknown;
  manifestSha256: string;
  dependencySha256: string;
  statementPolicyVersion: string;
  createdByUserId: string;
  operationId: string;
  requestSha256: string;
  createdAt: string | Date;
};

type ConfirmationRow = {
  id: string;
  projectId: string;
  targetKind: string;
  targetId: string;
  packageVersionId: string;
  packageVersion: number;
  manifestSha256: string;
  targetVersion: number;
  confirmationType: string;
  statementPolicyVersion: string;
  actorUserId: string;
  operationId: string;
  requestSha256: string;
  confirmedAt: string | Date;
};

type FinalizationRow = {
  id: string;
  projectId: string;
  confirmationId: string;
  packageVersionId: string;
  validatedDependencySha256: string;
  validatedAt: string | Date;
  validatedByUserId: string;
};

type InvalidationRow = {
  id: string;
  projectId: string;
  confirmationId: string;
  packageVersionId: string;
  dependencySha256: string;
  reasonCodes: unknown;
  detectedAt: string | Date;
  detectedByUserId: string;
};

const PACKAGE_COLUMNS = `"id", "projectId", "targetKind", "targetId", "version",
  "status", "schemaVersion", "manifest", "manifestSha256", "dependencySha256",
  "statementPolicyVersion", "createdByUserId", "operationId", "requestSha256",
  "createdAt"`;

const CONFIRMATION_COLUMNS = `"id", "projectId", "targetKind", "targetId",
  "packageVersionId", "packageVersion", "manifestSha256", "targetVersion",
  "confirmationType", "statementPolicyVersion", "actorUserId", "operationId",
  "requestSha256", "confirmedAt"`;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
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

function mapWriteError(
  error: unknown,
  duplicateCode: "version_conflict" | "state_conflict",
  operationCode: "idempotency_conflict"
): unknown {
  if (error instanceof SubmissionPackageError) {
    return error;
  }
  if (isForeignKeyViolation(error)) {
    // The composite identity of the confirmation does not match its parent package.
    return new SubmissionPackageError("integrity_conflict");
  }
  if (!isUniqueViolation(error)) {
    return error;
  }
  const constraint = String(
    (error as { constraint_name?: string }).constraint_name ??
      (error as { constraint?: string }).constraint ??
      ""
  );
  return new SubmissionPackageError(
    constraint.includes("operation") ? operationCode : duplicateCode
  );
}

/**
 * Locks the Project row and re-derives authority inside the write transaction.
 * Throws a coded error, so the whole transaction rolls back and nothing persists.
 */
async function lockAndAssertAuthority(
  tx: Tx,
  projectId: string,
  guard: SubmissionWriteGuard
): Promise<void> {
  const authority = rowsOf<{
    ownerUserId: string;
    status: string;
    role: string | null;
    email: string | null;
  }>(await tx.execute(sqlAuthority(projectId, guard.actorUserId)));
  const row = authority[0];
  if (!row) {
    throw new SubmissionPackageError("project_not_found");
  }
  if (
    row.role !== "user" ||
    (row.email !== null && guestRegex.test(row.email))
  ) {
    throw new SubmissionPackageError("actor_not_eligible");
  }
  if (row.ownerUserId !== guard.actorUserId) {
    const membershipRows = await tx.execute(sql`
      select "status" from "ProjectMembership"
      where "projectId" = ${projectId} and "userId" = ${guard.actorUserId}
      limit 1
    `);
    const membership = rowsOf<{ status: string }>(membershipRows)[0];
    if (membership?.status !== "active") {
      throw new SubmissionPackageError("project_forbidden");
    }
  }
  if (guard.requireActiveProject && row.status !== "active") {
    throw new SubmissionPackageError("project_closed");
  }
}

function sqlAuthority(projectId: string, actorUserId: string) {
  return sql`
    select p."ownerUserId" as "ownerUserId",
           p."status" as "status",
           u."role" as "role",
           u."email" as "email"
    from "StudyJourneyProject" p
    left join "User" u on u."id" = ${actorUserId}
    where p."id" = ${projectId}
    for update of p
  `;
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

export function createPostgresSubmissionPackageStore(): SubmissionPackageStore {
  function toPackageRecord(row: PackageRow): SubmissionPackageRecord {
    return {
      createdAt: toDate(row.createdAt),
      createdByUserId: row.createdByUserId,
      dependencySha256: row.dependencySha256,
      id: row.id,
      manifest: row.manifest,
      manifestSha256: row.manifestSha256,
      operationId: row.operationId,
      projectId: row.projectId,
      requestSha256: row.requestSha256,
      schemaVersion: row.schemaVersion,
      statementPolicyVersion: row.statementPolicyVersion,
      status: "frozen",
      targetId: row.targetId,
      targetKind: row.targetKind as SubmissionPackageRecord["targetKind"],
      version: row.version,
    };
  }

  function toConfirmationRecord(
    row: ConfirmationRow
  ): SubmissionConfirmationRecord {
    return {
      actorUserId: row.actorUserId,
      confirmationType:
        row.confirmationType as SubmissionConfirmationRecord["confirmationType"],
      confirmedAt: toDate(row.confirmedAt),
      id: row.id,
      manifestSha256: row.manifestSha256,
      operationId: row.operationId,
      packageVersion: row.packageVersion,
      packageVersionId: row.packageVersionId,
      projectId: row.projectId,
      requestSha256: row.requestSha256,
      statementPolicyVersion: row.statementPolicyVersion,
      targetId: row.targetId,
      targetKind: row.targetKind as SubmissionConfirmationRecord["targetKind"],
      targetVersion: row.targetVersion,
    };
  }

  function toInvalidationRecord(
    row: InvalidationRow
  ): SubmissionInvalidationRecord {
    return {
      confirmationId: row.confirmationId,
      dependencySha256: row.dependencySha256,
      detectedAt: toDate(row.detectedAt),
      detectedByUserId: row.detectedByUserId,
      id: row.id,
      packageVersionId: row.packageVersionId,
      projectId: row.projectId,
      reasonCodes: Array.isArray(row.reasonCodes)
        ? (row.reasonCodes as SubmissionStaleReason[])
        : [],
    };
  }

  function toFinalizationRecord(
    row: FinalizationRow
  ): SubmissionFinalizationRecord {
    return {
      confirmationId: row.confirmationId,
      id: row.id,
      packageVersionId: row.packageVersionId,
      projectId: row.projectId,
      validatedAt: toDate(row.validatedAt),
      validatedByUserId: row.validatedByUserId,
      validatedDependencySha256: row.validatedDependencySha256,
    };
  }

  return {
    async readActorContext(input): Promise<SubmissionActorContext> {
      const [actor] = await db()
        .select({ email: user.email, role: user.role })
        .from(user)
        .where(eq(user.id, input.actorUserId))
        .limit(1);
      const [project] = await db()
        .select({
          id: studyJourneyProject.id,
          ownerUserId: studyJourneyProject.ownerUserId,
          status: studyJourneyProject.status,
        })
        .from(studyJourneyProject)
        .where(eq(studyJourneyProject.id, input.projectId))
        .limit(1);
      let membershipStatus: SubmissionActorContext["membershipStatus"] =
        "missing";
      if (project?.ownerUserId === input.actorUserId) {
        membershipStatus = "owner";
      } else if (project) {
        const [membership] = await db()
          .select({ status: projectMembership.status })
          .from(projectMembership)
          .where(
            and(
              eq(projectMembership.projectId, input.projectId),
              eq(projectMembership.userId, input.actorUserId)
            )
          )
          .limit(1);
        membershipStatus =
          membership?.status === "active"
            ? "active_member"
            : membership?.status === "pending"
              ? "pending"
              : membership?.status === "revoked"
                ? "revoked"
                : "missing";
      }
      return {
        membershipStatus,
        project: project
          ? {
              id: project.id,
              ownerUserId: project.ownerUserId,
              status: project.status,
            }
          : null,
        registeredCustomer: Boolean(
          actor && actor.role === "user" && !guestRegex.test(actor.email)
        ),
        staff: Boolean(actor && actor.role !== "user"),
      };
    },

    async listPackages(input) {
      const rows = await db().execute(sql`
        select ${sql.raw(PACKAGE_COLUMNS)} from "SubmissionPackage"
        where "projectId" = ${input.projectId}
          and "targetKind" = ${input.targetKind}
          and "targetId" = ${input.targetId}
        order by "version" asc
      `);
      return rowsOf<PackageRow>(rows).map(toPackageRecord);
    },

    async getPackage(input) {
      const rows = await db().execute(sql`
        select ${sql.raw(PACKAGE_COLUMNS)} from "SubmissionPackage"
        where "projectId" = ${input.projectId} and "id" = ${input.packageVersionId}
        limit 1
      `);
      const [row] = rowsOf<PackageRow>(rows);
      return row ? toPackageRecord(row) : null;
    },

    async findPackageOperation(input) {
      const rows = await db().execute(sql`
        select ${sql.raw(PACKAGE_COLUMNS)} from "SubmissionPackage"
        where "projectId" = ${input.projectId} and "operationId" = ${input.operationId}
        limit 1
      `);
      const [row] = rowsOf<PackageRow>(rows);
      return row ? toPackageRecord(row) : null;
    },

    async countPackages(input) {
      const rows = await db().execute(sql`
        select count(*)::text as count from "SubmissionPackage"
        where "projectId" = ${input.projectId}
          and "targetKind" = ${input.targetKind}
          and "targetId" = ${input.targetId}
      `);
      return Number(rowsOf<{ count: string }>(rows)[0]?.count ?? "0");
    },

    async latestVersion(input) {
      const rows = await db().execute(sql`
        select coalesce(max("version"), 0)::text as version
        from "SubmissionPackage"
        where "projectId" = ${input.projectId}
          and "targetKind" = ${input.targetKind}
          and "targetId" = ${input.targetId}
      `);
      return Number(rowsOf<{ version: string }>(rows)[0]?.version ?? "0");
    },

    async insertPackage(input) {
      try {
        return await db().transaction(async (tx) => {
          await lockAndAssertAuthority(tx, input.projectId, input.guard);
          const rows = await tx.execute(sql`
            insert into "SubmissionPackage" (
              "id", "projectId", "targetKind", "targetId", "version", "status",
              "schemaVersion", "manifest", "manifestSha256", "dependencySha256",
              "statementPolicyVersion", "createdByUserId", "operationId", "requestSha256"
            ) values (
              ${input.values.id}, ${input.projectId}, ${input.values.targetKind},
              ${input.values.targetId}, ${input.values.version}, 'frozen',
              ${input.values.schemaVersion}, ${JSON.stringify(input.values.manifest)}::jsonb,
              ${input.values.manifestSha256}, ${input.values.dependencySha256},
              ${input.values.statementPolicyVersion}, ${input.operation.actorUserId},
              ${input.operation.operationId}, ${input.operation.requestSha256}
            )
            returning ${sql.raw(PACKAGE_COLUMNS)}
          `);
          const [row] = rowsOf<PackageRow>(rows);
          if (!row) {
            throw new SubmissionPackageError("integrity_conflict");
          }
          return { replayed: false, value: toPackageRecord(row) };
        });
      } catch (error) {
        throw mapWriteError(error, "version_conflict", "idempotency_conflict");
      }
    },

    async listConfirmations(input) {
      const rows = await db().execute(sql`
        select ${sql.raw(CONFIRMATION_COLUMNS)} from "SubmissionPackageConfirmation"
        where "projectId" = ${input.projectId}
          and "targetKind" = ${input.targetKind}
          and "targetId" = ${input.targetId}
        order by "confirmedAt" asc
      `);
      return rowsOf<ConfirmationRow>(rows).map(toConfirmationRecord);
    },

    async getConfirmation(input: {
      readonly projectId: string;
      readonly packageVersionId: string;
      readonly confirmationType: SubmissionConfirmationType;
    }) {
      const rows = await db().execute(sql`
        select ${sql.raw(CONFIRMATION_COLUMNS)} from "SubmissionPackageConfirmation"
        where "projectId" = ${input.projectId}
          and "packageVersionId" = ${input.packageVersionId}
          and "confirmationType" = ${input.confirmationType}
        limit 1
      `);
      const [row] = rowsOf<ConfirmationRow>(rows);
      return row ? toConfirmationRecord(row) : null;
    },

    async findConfirmationOperation(input) {
      const rows = await db().execute(sql`
        select ${sql.raw(CONFIRMATION_COLUMNS)} from "SubmissionPackageConfirmation"
        where "projectId" = ${input.projectId} and "operationId" = ${input.operationId}
        limit 1
      `);
      const [row] = rowsOf<ConfirmationRow>(rows);
      return row ? toConfirmationRecord(row) : null;
    },

    async insertConfirmation(input) {
      try {
        return await db().transaction(async (tx) => {
          await lockAndAssertAuthority(tx, input.projectId, input.guard);
          // Lock and verify the parent package inside the same transaction. The
          // composite foreign key is the database backstop; this check produces the
          // precise coded error and enforces supersession.
          const parentRows = await tx.execute(sql`
            select "id", "projectId", "targetKind", "targetId", "version",
                   "manifestSha256"
            from "SubmissionPackage"
            where "id" = ${input.values.packageVersionId}
              and "projectId" = ${input.projectId}
            for update
          `);
          const [parent] = rowsOf<{
            id: string;
            projectId: string;
            targetKind: string;
            targetId: string;
            version: number;
            manifestSha256: string;
          }>(parentRows);
          if (!parent) {
            throw new SubmissionPackageError("package_not_found");
          }
          if (
            parent.targetKind !== input.values.targetKind ||
            parent.targetId !== input.values.targetId ||
            parent.manifestSha256 !== input.values.manifestSha256 ||
            parent.version !== input.values.packageVersion
          ) {
            throw new SubmissionPackageError("integrity_conflict");
          }
          const latestRows = await tx.execute(sql`
            select coalesce(max("version"), 0)::text as version
            from "SubmissionPackage"
            where "projectId" = ${input.projectId}
              and "targetKind" = ${input.values.targetKind}
              and "targetId" = ${input.values.targetId}
          `);
          const latest = Number(
            rowsOf<{ version: string }>(latestRows)[0]?.version ?? "0"
          );
          if (latest !== parent.version) {
            // An older version can never be confirmed again, even if its dependency
            // fingerprints happen to match the current state.
            throw new SubmissionPackageError("state_conflict");
          }
          const evidenceRows = await tx.execute(sql`
            select 1 as present from "SubmissionPackageInvalidation"
            where "packageVersionId" = ${parent.id}
            limit 1
          `);
          if (rowsOf<{ present: number }>(evidenceRows).length > 0) {
            throw new SubmissionPackageError("state_conflict");
          }
          const rows = await tx.execute(sql`
            insert into "SubmissionPackageConfirmation" (
              "id", "projectId", "targetKind", "targetId", "packageVersionId",
              "packageVersion", "manifestSha256", "targetVersion", "confirmationType",
              "statementPolicyVersion", "actorUserId", "operationId", "requestSha256"
            ) values (
              ${input.values.id}, ${input.projectId}, ${input.values.targetKind},
              ${input.values.targetId}, ${input.values.packageVersionId},
              ${input.values.packageVersion}, ${input.values.manifestSha256},
              ${input.values.targetVersion}, ${input.values.confirmationType},
              ${input.values.statementPolicyVersion}, ${input.operation.actorUserId},
              ${input.operation.operationId}, ${input.operation.requestSha256}
            )
            returning ${sql.raw(CONFIRMATION_COLUMNS)}
          `);
          const [row] = rowsOf<ConfirmationRow>(rows);
          if (!row) {
            throw new SubmissionPackageError("integrity_conflict");
          }
          return { replayed: false, value: toConfirmationRecord(row) };
        });
      } catch (error) {
        throw mapWriteError(error, "state_conflict", "idempotency_conflict");
      }
    },

    async listInvalidations(input) {
      const rows = await db().execute(sql`
        select i."id", i."projectId", i."confirmationId", i."packageVersionId",
               i."dependencySha256", i."reasonCodes", i."detectedAt",
               i."detectedByUserId"
        from "SubmissionPackageInvalidation" i
        join "SubmissionPackage" p on p."id" = i."packageVersionId"
        where i."projectId" = ${input.projectId}
          and p."targetKind" = ${input.targetKind}
          and p."targetId" = ${input.targetId}
        order by i."detectedAt" asc
      `);
      return rowsOf<InvalidationRow>(rows).map(toInvalidationRecord);
    },

    async recordFinalization(input) {
      const rows = await db().execute(sql`
        insert into "SubmissionPackageConfirmationFinalization" (
          "id", "projectId", "confirmationId", "packageVersionId",
          "validatedDependencySha256", "validatedByUserId"
        ) values (
          ${input.id}, ${input.projectId}, ${input.confirmationId},
          ${input.packageVersionId}, ${input.validatedDependencySha256},
          ${input.validatedByUserId}
        )
        on conflict ("confirmationId") do nothing
        returning "id", "projectId", "confirmationId", "packageVersionId",
                  "validatedDependencySha256", "validatedAt", "validatedByUserId"
      `);
      const [inserted] = rowsOf<FinalizationRow>(rows);
      if (inserted) {
        return toFinalizationRecord(inserted);
      }
      // Insert-once: a concurrent or replayed finalization returns the durable row.
      const existing = await db().execute(sql`
        select "id", "projectId", "confirmationId", "packageVersionId",
               "validatedDependencySha256", "validatedAt", "validatedByUserId"
        from "SubmissionPackageConfirmationFinalization"
        where "confirmationId" = ${input.confirmationId}
        limit 1
      `);
      const [row] = rowsOf<FinalizationRow>(existing);
      if (!row) {
        throw new SubmissionPackageError("integrity_conflict");
      }
      return toFinalizationRecord(row);
    },

    async listFinalizations(input) {
      const rows = await db().execute(sql`
        select f."id", f."projectId", f."confirmationId", f."packageVersionId",
               f."validatedDependencySha256", f."validatedAt",
               f."validatedByUserId"
        from "SubmissionPackageConfirmationFinalization" f
        join "SubmissionPackage" p on p."id" = f."packageVersionId"
        where f."projectId" = ${input.projectId}
          and p."targetKind" = ${input.targetKind}
          and p."targetId" = ${input.targetId}
        order by f."validatedAt" asc
      `);
      return rowsOf<FinalizationRow>(rows).map(toFinalizationRecord);
    },

    async recordInvalidation(input) {
      await db().execute(sql`
        insert into "SubmissionPackageInvalidation" (
          "id", "projectId", "confirmationId", "packageVersionId",
          "dependencySha256", "reasonCodes", "detectedByUserId"
        ) values (
          ${input.id}, ${input.projectId}, ${input.confirmationId},
          ${input.packageVersionId}, ${input.dependencySha256},
          ${JSON.stringify(input.reasonCodes)}::jsonb, ${input.detectedByUserId}
        )
        on conflict ("confirmationId", "dependencySha256") do nothing
      `);
    },
  };
}
