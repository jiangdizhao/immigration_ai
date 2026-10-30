// biome-ignore-all lint/suspicious/useAwait: this adapter implements an asynchronous persistence port.
import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  educationCourse,
  educationDelivery,
  educationIntake,
  educationProvider,
  projectDocumentAsset,
  projectDocumentVersion,
  projectFactAssertion,
  projectFactPublication,
  projectMembership,
  projectRequirementState,
  type SCHOOL_APPLICATION_EVENT_SUBJECT_KIND_VALUES,
  type SCHOOL_APPLICATION_EVENT_TYPE_VALUES,
  type SCHOOL_APPLICATION_OPERATION_RESULT_KIND_VALUES,
  schoolApplication,
  schoolApplicationEvent,
  schoolApplicationOperation,
  schoolApplicationPackage,
  schoolApplicationReference,
  studyJourneyProject,
  user,
} from "@/lib/db/schema";
import { canonicalJson } from "@/lib/managed-target/policy";
import {
  SCHOOL_APPLICATION_MAX_APPLICATIONS_PER_PROJECT,
  SchoolApplicationError,
  schoolApplicationStatusAfterMaterialChange,
  schoolApplicationTextSha256,
} from "./contracts";
import type {
  NewSchoolApplicationValues,
  SchoolApplicationActorContext,
  SchoolApplicationCatalogResolver,
  SchoolApplicationEventRecord,
  SchoolApplicationOperationStamp,
  SchoolApplicationPackageRecord,
  SchoolApplicationRecord,
  SchoolApplicationReferenceRecord,
  SchoolApplicationReferenceResolver,
  SchoolApplicationStore,
  SchoolApplicationWriteResult,
} from "./ports";

type Database = ReturnType<typeof getLazyDatabase>;
type Executor = Parameters<Parameters<Database["transaction"]>[0]>[0];
type QueryRunner = Executor | Database;

type OperationResultKind =
  (typeof SCHOOL_APPLICATION_OPERATION_RESULT_KIND_VALUES)[number];
type ApplicationEventType =
  (typeof SCHOOL_APPLICATION_EVENT_TYPE_VALUES)[number];
type ApplicationEventSubjectKind =
  (typeof SCHOOL_APPLICATION_EVENT_SUBJECT_KIND_VALUES)[number];

const db = getLazyDatabase();

function toApplicationRecord(
  row: typeof schoolApplication.$inferSelect
): SchoolApplicationRecord {
  return {
    archivedAt: row.archivedAt,
    catalogRecordClass: row.catalogRecordClass ?? null,
    catalogSnapshotToken: row.catalogSnapshotToken ?? null,
    courseId: row.courseId ?? null,
    courseTitle: row.courseTitle,
    createdAt: row.createdAt,
    deliveryId: row.deliveryId ?? null,
    id: row.id,
    institutionId: row.institutionId ?? null,
    institutionName: row.institutionName,
    intakeId: row.intakeId ?? null,
    intakeLabel: row.intakeLabel ?? null,
    ownerUserId: row.ownerUserId,
    projectId: row.projectId,
    revision: row.revision,
    sourceStatus: row.sourceStatus,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

function toReferenceRecord(
  row: typeof schoolApplicationReference.$inferSelect
): SchoolApplicationReferenceRecord {
  return {
    applicationId: row.applicationId,
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    id: row.id,
    kind: row.kind,
    projectId: row.projectId,
    referenceId: row.referenceId,
    referenceSha256: row.referenceSha256,
    referenceVersion: row.referenceVersion,
    revokedAt: row.revokedAt ?? null,
  };
}

function toPackageRecord(
  row: typeof schoolApplicationPackage.$inferSelect
): SchoolApplicationPackageRecord {
  return {
    applicationId: row.applicationId,
    contentSha256: row.contentSha256,
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    id: row.id,
    inputsSha256: row.inputsSha256,
    operationId: row.operationId,
    projectId: row.projectId,
    requestSha256: row.requestSha256,
    schemaVersion: row.schemaVersion,
    snapshot: row.snapshot,
    status: row.status,
    targetBindingSha256: row.targetBindingSha256,
    targetId: row.targetId,
    targetKind: row.targetKind,
    targetSha256: row.targetSha256,
    targetVersion: row.targetVersion,
    version: row.version,
  };
}

function toEventRecord(
  row: typeof schoolApplicationEvent.$inferSelect
): SchoolApplicationEventRecord {
  return {
    actorUserId: row.actorUserId,
    applicationId: row.applicationId,
    applicationRevision: row.applicationRevision,
    createdAt: row.createdAt,
    eventType: row.eventType,
    id: row.id,
    projectId: row.projectId,
    subjectId: row.subjectId,
    subjectKind: row.subjectKind,
  };
}

function valuesForInsert(values: NewSchoolApplicationValues) {
  return {
    catalogRecordClass: values.catalogRecordClass,
    catalogSnapshotToken: values.catalogSnapshotToken,
    courseId: values.courseId,
    courseTitle: values.courseTitle,
    deliveryId: values.deliveryId,
    institutionId: values.institutionId,
    institutionName: values.institutionName,
    intakeId: values.intakeId,
    intakeLabel: values.intakeLabel,
    ownerUserId: values.ownerUserId,
    sourceStatus: values.sourceStatus,
  };
}

function fail(
  code: ConstructorParameters<typeof SchoolApplicationError>[0]
): never {
  throw new SchoolApplicationError(code);
}

async function claimOperation(
  tx: Executor,
  input: {
    operation: SchoolApplicationOperationStamp;
    resultKind: OperationResultKind;
    resultId: string;
  }
): Promise<{ operationRecordId: string; replayed: boolean; resultId: string }> {
  const [claimed] = await tx
    .insert(schoolApplicationOperation)
    .values({
      actorUserId: input.operation.actorUserId,
      operationId: input.operation.operationId,
      operationType: input.operation.operationType,
      requestSha256: input.operation.requestSha256,
      resultId: input.resultId,
      resultKind: input.resultKind,
    })
    .onConflictDoNothing({
      target: [
        schoolApplicationOperation.actorUserId,
        schoolApplicationOperation.operationId,
      ],
    })
    .returning({ id: schoolApplicationOperation.id });
  if (claimed) {
    return {
      operationRecordId: claimed.id,
      replayed: false,
      resultId: input.resultId,
    };
  }
  const [existing] = await tx
    .select({
      id: schoolApplicationOperation.id,
      operationType: schoolApplicationOperation.operationType,
      requestSha256: schoolApplicationOperation.requestSha256,
      resultId: schoolApplicationOperation.resultId,
      resultKind: schoolApplicationOperation.resultKind,
    })
    .from(schoolApplicationOperation)
    .where(
      and(
        eq(schoolApplicationOperation.actorUserId, input.operation.actorUserId),
        eq(schoolApplicationOperation.operationId, input.operation.operationId)
      )
    )
    .for("update")
    .limit(1);
  if (!existing) {
    fail("integrity_conflict");
  }
  if (
    existing.requestSha256 !== input.operation.requestSha256 ||
    existing.operationType !== input.operation.operationType ||
    existing.resultKind !== input.resultKind
  ) {
    fail("idempotency_conflict");
  }
  return {
    operationRecordId: existing.id,
    replayed: true,
    resultId: existing.resultId,
  };
}

/**
 * Locks the application row for this actor. The Project and owner filters are
 * part of the predicate, so a foreign Project, another member or a forged id can
 * never be locked into a write.
 */
async function lockApplication(
  tx: Executor,
  input: {
    applicationId: string;
    ownerUserId: string;
    projectId: string;
  }
) {
  const [row] = await tx
    .select()
    .from(schoolApplication)
    .where(
      and(
        eq(schoolApplication.id, input.applicationId),
        eq(schoolApplication.projectId, input.projectId),
        eq(schoolApplication.ownerUserId, input.ownerUserId)
      )
    )
    .for("update")
    .limit(1);
  if (!row) {
    fail("application_not_found");
  }
  return row;
}

/**
 * In-transaction authorization revalidation (closes the authorization TOCTOU
 * window).
 *
 * The service authorizes before the write, but a membership revocation or a
 * Project closure can commit in between. Every M5.1 mutation therefore
 * re-derives the actor's authority inside the write transaction. Locks are taken
 * in the established M1 order — Project first, then Membership — so M1 lifecycle,
 * M1 membership and M5.1 writes cannot form a lock cycle:
 *
 *   Project (FOR UPDATE) -> Membership (FOR UPDATE) -> Application (FOR UPDATE)
 *   -> Reference/Package -> Operation -> Event
 *
 * `FOR UPDATE` on the Project row means a concurrent closure waits for this
 * transaction, and a closure that committed first is visible here (READ COMMITTED
 * re-reads the row after the lock wait), so no unauthorized write can commit
 * against a closed Project or a revoked membership.
 */
async function lockProjectAuthority(
  tx: Executor,
  input: { actorUserId: string; projectId: string }
): Promise<void> {
  const [actor] = await tx
    .select({ email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, input.actorUserId))
    .limit(1);
  if (!actor || actor.role !== "user" || guestRegex.test(actor.email)) {
    // Staff, service and guest actors never hold private application authority,
    // even if their earlier read looked eligible.
    fail("actor_not_eligible");
  }
  const [project] = await tx
    .select({
      id: studyJourneyProject.id,
      ownerUserId: studyJourneyProject.ownerUserId,
      status: studyJourneyProject.status,
    })
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, input.projectId))
    .for("update")
    .limit(1);
  if (!project) {
    fail("project_not_found");
  }
  if (project.ownerUserId !== input.actorUserId) {
    const [membership] = await tx
      .select({ status: projectMembership.status })
      .from(projectMembership)
      .where(
        and(
          eq(projectMembership.projectId, project.id),
          eq(projectMembership.userId, input.actorUserId)
        )
      )
      .for("update")
      .limit(1);
    if (membership?.status !== "active") {
      fail("project_forbidden");
    }
  }
  if (project.status !== "active") {
    fail("project_closed");
  }
}

async function appendEvent(
  tx: Executor,
  input: {
    actorUserId: string;
    applicationId: string;
    applicationRevision: number;
    eventType: ApplicationEventType;
    operationRecordId: string;
    projectId: string;
    subjectId: string;
    subjectKind: ApplicationEventSubjectKind;
  }
) {
  await tx.insert(schoolApplicationEvent).values({
    actorUserId: input.actorUserId,
    applicationId: input.applicationId,
    applicationRevision: input.applicationRevision,
    eventType: input.eventType,
    operationRecordId: input.operationRecordId,
    projectId: input.projectId,
    subjectId: input.subjectId,
    subjectKind: input.subjectKind,
  });
}

/** Invalidate the current package in place; the snapshot columns stay frozen. */
async function hasCurrentPackage(
  tx: Executor,
  applicationId: string
): Promise<boolean> {
  const [row] = await tx
    .select({ id: schoolApplicationPackage.id })
    .from(schoolApplicationPackage)
    .where(
      and(
        eq(schoolApplicationPackage.applicationId, applicationId),
        eq(schoolApplicationPackage.status, "current")
      )
    )
    .limit(1);
  return Boolean(row);
}

async function invalidateCurrentPackage(
  tx: Executor,
  input: {
    actorUserId: string;
    application: { id: string; projectId: string; revision: number };
    operationRecordId: string;
  }
): Promise<void> {
  const [current] = await tx
    .select({ id: schoolApplicationPackage.id })
    .from(schoolApplicationPackage)
    .where(
      and(
        eq(schoolApplicationPackage.applicationId, input.application.id),
        eq(schoolApplicationPackage.status, "current")
      )
    )
    .for("update")
    .limit(1);
  if (!current) {
    return;
  }
  await tx
    .update(schoolApplicationPackage)
    .set({ status: "stale" })
    .where(eq(schoolApplicationPackage.id, current.id));
  await appendEvent(tx, {
    actorUserId: input.actorUserId,
    applicationId: input.application.id,
    applicationRevision: input.application.revision,
    eventType: "school_application_package_invalidated",
    operationRecordId: input.operationRecordId,
    projectId: input.application.projectId,
    subjectId: current.id,
    subjectKind: "school_application_package",
  });
}

/**
 * Phase 13 M5.1 PostgreSQL store.
 *
 * Invariants are owned by the database, not by an in-process mutex:
 * - `SELECT … FOR UPDATE` on the application row serializes concurrent writes;
 * - `unique (actorUserId, operationId)` makes exact replay a lookup and a changed
 *   request an idempotency conflict;
 * - the partial unique index keeps at most one current package;
 * - package/reference/operation/event triggers keep history immutable and
 *   append-only;
 * - every write is one transaction, so a rejected request leaves no partial state.
 */
export function createPostgresSchoolApplicationStore(): SchoolApplicationStore {
  async function readShared(
    runner: QueryRunner,
    input: {
      actorUserId: string;
      projectId: string;
      applicationId: string;
    }
  ) {
    const [row] = await runner
      .select()
      .from(schoolApplication)
      .where(
        and(
          eq(schoolApplication.id, input.applicationId),
          eq(schoolApplication.projectId, input.projectId),
          eq(schoolApplication.ownerUserId, input.actorUserId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  return {
    async findOperation(input) {
      const [existing] = await db
        .select({
          operationType: schoolApplicationOperation.operationType,
          requestSha256: schoolApplicationOperation.requestSha256,
          resultId: schoolApplicationOperation.resultId,
          resultKind: schoolApplicationOperation.resultKind,
        })
        .from(schoolApplicationOperation)
        .where(
          and(
            eq(schoolApplicationOperation.actorUserId, input.actorUserId),
            eq(schoolApplicationOperation.operationId, input.operationId)
          )
        )
        .limit(1);
      if (!existing) {
        return { status: "absent" };
      }
      if (
        existing.operationType !== input.operationType ||
        existing.requestSha256 !== input.requestSha256
      ) {
        return { status: "conflict" };
      }
      return {
        resultId: existing.resultId,
        resultKind: existing.resultKind,
        status: "replay",
      };
    },

    async readActorContext(input): Promise<SchoolApplicationActorContext> {
      const [actor] = await db
        .select({ email: user.email, role: user.role })
        .from(user)
        .where(eq(user.id, input.actorUserId))
        .limit(1);
      const [project] = await db
        .select({
          id: studyJourneyProject.id,
          ownerUserId: studyJourneyProject.ownerUserId,
          status: studyJourneyProject.status,
        })
        .from(studyJourneyProject)
        .where(eq(studyJourneyProject.id, input.projectId))
        .limit(1);
      let membershipStatus: SchoolApplicationActorContext["membershipStatus"] =
        "missing";
      if (project?.ownerUserId === input.actorUserId) {
        membershipStatus = "owner";
      } else if (project) {
        const [membership] = await db
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

    async listApplications(input) {
      const rows = await db
        .select()
        .from(schoolApplication)
        .where(
          and(
            eq(schoolApplication.projectId, input.projectId),
            eq(schoolApplication.ownerUserId, input.ownerUserId)
          )
        )
        .orderBy(asc(schoolApplication.createdAt), asc(schoolApplication.id));
      return rows.map(toApplicationRecord);
    },

    async getApplication(input) {
      const row = await readShared(db, {
        actorUserId: input.ownerUserId,
        applicationId: input.applicationId,
        projectId: input.projectId,
      });
      return row ? toApplicationRecord(row) : null;
    },

    async listReferences(input) {
      const rows = await db
        .select()
        .from(schoolApplicationReference)
        .where(
          eq(schoolApplicationReference.applicationId, input.applicationId)
        )
        .orderBy(
          asc(schoolApplicationReference.createdAt),
          asc(schoolApplicationReference.id)
        );
      return rows.map(toReferenceRecord);
    },

    async listPackages(input) {
      const rows = await db
        .select()
        .from(schoolApplicationPackage)
        .where(eq(schoolApplicationPackage.applicationId, input.applicationId))
        .orderBy(asc(schoolApplicationPackage.version));
      return rows.map(toPackageRecord);
    },

    async listEvents(input) {
      const rows = await db
        .select()
        .from(schoolApplicationEvent)
        .where(eq(schoolApplicationEvent.applicationId, input.applicationId))
        .orderBy(
          asc(schoolApplicationEvent.applicationRevision),
          asc(schoolApplicationEvent.createdAt),
          asc(schoolApplicationEvent.id)
        );
      return rows.map(toEventRecord);
    },

    async countApplications(input) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schoolApplication)
        .where(
          and(
            eq(schoolApplication.projectId, input.projectId),
            eq(schoolApplication.ownerUserId, input.ownerUserId)
          )
        );
      return row?.count ?? 0;
    },

    createApplication(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationRecord>> {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const applicationId = randomUUID();
        const claim = await claimOperation(tx, {
          operation: input.operation,
          resultId: applicationId,
          resultKind: "school_application",
        });
        if (claim.replayed) {
          // The Project lock above already serializes every M5.1 write in this
          // Project, so locking the replayed application here cannot introduce a
          // cycle: this transaction still holds no other Project resource.
          const row = await lockApplication(tx, {
            applicationId: claim.resultId,
            ownerUserId: input.values.ownerUserId,
            projectId: input.projectId,
          });
          return { replayed: true, value: toApplicationRecord(row) };
        }
        const [owned] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schoolApplication)
          .where(
            and(
              eq(schoolApplication.projectId, input.projectId),
              eq(schoolApplication.ownerUserId, input.values.ownerUserId)
            )
          );
        if (
          (owned?.count ?? 0) >= SCHOOL_APPLICATION_MAX_APPLICATIONS_PER_PROJECT
        ) {
          fail("limit_exceeded");
        }
        const [created] = await tx
          .insert(schoolApplication)
          .values({
            id: applicationId,
            projectId: input.projectId,
            revision: 1,
            status: "draft",
            ...valuesForInsert(input.values),
          })
          .returning();
        if (!created) {
          fail("integrity_conflict");
        }
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          applicationId: created.id,
          applicationRevision: 1,
          eventType: "school_application_created",
          operationRecordId: claim.operationRecordId,
          projectId: created.projectId,
          subjectId: created.id,
          subjectKind: "school_application",
        });
        return { replayed: false, value: toApplicationRecord(created) };
      });
    },

    updateApplication(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationRecord>> {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const existing = await lockApplication(tx, input);
        const claim = await claimOperation(tx, {
          operation: input.operation,
          resultId: input.applicationId,
          resultKind: "school_application",
        });
        if (claim.replayed) {
          return { replayed: true, value: toApplicationRecord(existing) };
        }
        if (existing.revision !== input.expectedRevision) {
          fail("revision_conflict");
        }
        const transition = schoolApplicationStatusAfterMaterialChange({
          hasCurrentPackage: await hasCurrentPackage(tx, existing.id),
        });
        const revision = existing.revision + 1;
        const [updated] = await tx
          .update(schoolApplication)
          .set({
            ...valuesForInsert(input.values),
            revision,
            status: transition.status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schoolApplication.id, existing.id),
              eq(schoolApplication.revision, input.expectedRevision)
            )
          )
          .returning();
        if (!updated) {
          fail("revision_conflict");
        }
        await invalidateCurrentPackage(tx, {
          actorUserId: input.operation.actorUserId,
          application: updated,
          operationRecordId: claim.operationRecordId,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          applicationId: updated.id,
          applicationRevision: revision,
          eventType: "school_application_updated",
          operationRecordId: claim.operationRecordId,
          projectId: updated.projectId,
          subjectId: updated.id,
          subjectKind: "school_application",
        });
        return { replayed: false, value: toApplicationRecord(updated) };
      });
    },

    archiveApplication(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationRecord>> {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const existing = await lockApplication(tx, input);
        const claim = await claimOperation(tx, {
          operation: input.operation,
          resultId: input.applicationId,
          resultKind: "school_application",
        });
        if (claim.replayed) {
          return { replayed: true, value: toApplicationRecord(existing) };
        }
        if (existing.revision !== input.expectedRevision) {
          fail("revision_conflict");
        }
        const now = new Date();
        const revision = existing.revision + 1;
        const [updated] = await tx
          .update(schoolApplication)
          .set({
            archivedAt: now,
            revision,
            status: "archived",
            updatedAt: now,
          })
          .where(
            and(
              eq(schoolApplication.id, existing.id),
              eq(schoolApplication.revision, input.expectedRevision)
            )
          )
          .returning();
        if (!updated) {
          fail("revision_conflict");
        }
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          applicationId: updated.id,
          applicationRevision: revision,
          eventType: "school_application_archived",
          operationRecordId: claim.operationRecordId,
          projectId: updated.projectId,
          subjectId: updated.id,
          subjectKind: "school_application",
        });
        return { replayed: false, value: toApplicationRecord(updated) };
      });
    },

    bindReference(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationReferenceRecord>> {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const application = await lockApplication(tx, input);
        const [active] = await tx
          .select()
          .from(schoolApplicationReference)
          .where(
            and(
              eq(schoolApplicationReference.applicationId, application.id),
              eq(schoolApplicationReference.kind, input.kind),
              eq(schoolApplicationReference.referenceId, input.referenceId),
              isNull(schoolApplicationReference.revokedAt)
            )
          )
          .for("update")
          .limit(1);
        const referenceRecordId = active?.id ?? randomUUID();
        const claim = await claimOperation(tx, {
          operation: input.operation,
          resultId: referenceRecordId,
          resultKind: "school_application_reference",
        });
        if (claim.replayed) {
          const [row] = await tx
            .select()
            .from(schoolApplicationReference)
            .where(eq(schoolApplicationReference.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toReferenceRecord(row) };
        }
        if (application.revision !== input.expectedRevision) {
          fail("revision_conflict");
        }
        const now = new Date();
        const revision = application.revision + 1;
        const [reference] = active
          ? await tx
              .update(schoolApplicationReference)
              .set({
                referenceSha256: input.referenceSha256,
                referenceVersion: input.referenceVersion,
              })
              .where(eq(schoolApplicationReference.id, active.id))
              .returning()
          : await tx
              .insert(schoolApplicationReference)
              .values({
                applicationId: application.id,
                createdAt: now,
                createdByUserId: input.operation.actorUserId,
                id: referenceRecordId,
                kind: input.kind,
                projectId: application.projectId,
                referenceId: input.referenceId,
                referenceSha256: input.referenceSha256,
                referenceVersion: input.referenceVersion,
              })
              .returning();
        if (!reference) {
          fail("integrity_conflict");
        }
        const transition = schoolApplicationStatusAfterMaterialChange({
          hasCurrentPackage: await hasCurrentPackage(tx, application.id),
        });
        const [updated] = await tx
          .update(schoolApplication)
          .set({ revision, status: transition.status, updatedAt: now })
          .where(
            and(
              eq(schoolApplication.id, application.id),
              eq(schoolApplication.revision, input.expectedRevision)
            )
          )
          .returning();
        if (!updated) {
          fail("revision_conflict");
        }
        await invalidateCurrentPackage(tx, {
          actorUserId: input.operation.actorUserId,
          application: updated,
          operationRecordId: claim.operationRecordId,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          applicationId: updated.id,
          applicationRevision: revision,
          eventType: "school_application_reference_bound",
          operationRecordId: claim.operationRecordId,
          projectId: updated.projectId,
          subjectId: reference.id,
          subjectKind: "school_application_reference",
        });
        return { replayed: false, value: toReferenceRecord(reference) };
      });
    },

    revokeReference(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationReferenceRecord>> {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const application = await lockApplication(tx, input);
        const claim = await claimOperation(tx, {
          operation: input.operation,
          resultId: input.referenceRecordId,
          resultKind: "school_application_reference",
        });
        if (claim.replayed) {
          const [row] = await tx
            .select()
            .from(schoolApplicationReference)
            .where(eq(schoolApplicationReference.id, input.referenceRecordId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toReferenceRecord(row) };
        }
        if (application.revision !== input.expectedRevision) {
          fail("revision_conflict");
        }
        const [existing] = await tx
          .select()
          .from(schoolApplicationReference)
          .where(
            and(
              eq(schoolApplicationReference.id, input.referenceRecordId),
              eq(schoolApplicationReference.applicationId, application.id),
              isNull(schoolApplicationReference.revokedAt)
            )
          )
          .for("update")
          .limit(1);
        if (!existing) {
          fail("state_conflict");
        }
        const now = new Date();
        const revision = application.revision + 1;
        const [reference] = await tx
          .update(schoolApplicationReference)
          .set({ revokedAt: now })
          .where(eq(schoolApplicationReference.id, existing.id))
          .returning();
        if (!reference) {
          fail("integrity_conflict");
        }
        const transition = schoolApplicationStatusAfterMaterialChange({
          hasCurrentPackage: await hasCurrentPackage(tx, application.id),
        });
        const [updated] = await tx
          .update(schoolApplication)
          .set({ revision, status: transition.status, updatedAt: now })
          .where(
            and(
              eq(schoolApplication.id, application.id),
              eq(schoolApplication.revision, input.expectedRevision)
            )
          )
          .returning();
        if (!updated) {
          fail("revision_conflict");
        }
        await invalidateCurrentPackage(tx, {
          actorUserId: input.operation.actorUserId,
          application: updated,
          operationRecordId: claim.operationRecordId,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          applicationId: updated.id,
          applicationRevision: revision,
          eventType: "school_application_reference_revoked",
          operationRecordId: claim.operationRecordId,
          projectId: updated.projectId,
          subjectId: reference.id,
          subjectKind: "school_application_reference",
        });
        return { replayed: false, value: toReferenceRecord(reference) };
      });
    },

    buildPackage(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationPackageRecord>> {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const application = await lockApplication(tx, input);
        const [current] = await tx
          .select()
          .from(schoolApplicationPackage)
          .where(
            and(
              eq(schoolApplicationPackage.applicationId, application.id),
              eq(schoolApplicationPackage.status, "current")
            )
          )
          .for("update")
          .limit(1);
        const reuse = Boolean(
          current &&
            current.version === input.package.version &&
            current.inputsSha256 === input.package.inputsSha256
        );
        const plannedPackageId = reuse && current ? current.id : randomUUID();
        const claim = await claimOperation(tx, {
          operation: input.operation,
          resultId: plannedPackageId,
          resultKind: "school_application_package",
        });
        if (claim.replayed) {
          const [row] = await tx
            .select()
            .from(schoolApplicationPackage)
            .where(eq(schoolApplicationPackage.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toPackageRecord(row) };
        }
        if (application.revision !== input.expectedRevision) {
          fail("revision_conflict");
        }
        if (reuse && current) {
          return { replayed: false, value: toPackageRecord(current) };
        }
        for (const refresh of input.references) {
          const [refreshed] = await tx
            .update(schoolApplicationReference)
            .set({
              referenceSha256: refresh.referenceSha256,
              referenceVersion: refresh.referenceVersion,
            })
            .where(
              and(
                eq(schoolApplicationReference.id, refresh.referenceRecordId),
                eq(schoolApplicationReference.applicationId, application.id),
                isNull(schoolApplicationReference.revokedAt)
              )
            )
            .returning({ id: schoolApplicationReference.id });
          if (!refreshed) {
            fail("integrity_conflict");
          }
        }
        if (current) {
          await tx
            .update(schoolApplicationPackage)
            .set({ status: "superseded" })
            .where(eq(schoolApplicationPackage.id, current.id));
        }
        const now = new Date();
        const revision = application.revision + 1;
        const [created] = await tx
          .insert(schoolApplicationPackage)
          .values({
            applicationId: application.id,
            contentSha256: input.package.contentSha256,
            createdAt: now,
            createdByUserId: input.operation.actorUserId,
            id: plannedPackageId,
            inputsSha256: input.package.inputsSha256,
            operationId: input.operation.operationId,
            projectId: application.projectId,
            requestSha256: input.operation.requestSha256,
            schemaVersion: input.package.schemaVersion,
            snapshot: input.package.snapshot,
            status: "current",
            targetBindingSha256: input.package.targetBindingSha256,
            targetId: input.package.targetId,
            targetKind: input.package.targetKind,
            targetSha256: input.package.targetSha256,
            targetVersion: input.package.targetVersion,
            version: input.package.version,
          })
          .returning();
        if (!created) {
          fail("integrity_conflict");
        }
        const [updated] = await tx
          .update(schoolApplication)
          .set({ revision, status: "package_prepared", updatedAt: now })
          .where(
            and(
              eq(schoolApplication.id, application.id),
              eq(schoolApplication.revision, input.expectedRevision)
            )
          )
          .returning();
        if (!updated) {
          fail("revision_conflict");
        }
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          applicationId: updated.id,
          applicationRevision: revision,
          eventType: "school_application_package_built",
          operationRecordId: claim.operationRecordId,
          projectId: updated.projectId,
          subjectId: created.id,
          subjectKind: "school_application_package",
        });
        return { replayed: false, value: toPackageRecord(created) };
      });
    },
  };
}

async function factVisibleToActor(input: {
  assertionId: string;
  assertionVersion: number;
  actorUserId: string;
}): Promise<boolean> {
  const [publication] = await db
    .select({ id: projectFactPublication.id })
    .from(projectFactPublication)
    .where(
      and(
        eq(projectFactPublication.assertionId, input.assertionId),
        eq(projectFactPublication.assertionVersion, input.assertionVersion),
        eq(projectFactPublication.active, true),
        or(
          eq(projectFactPublication.audience, "project"),
          eq(projectFactPublication.actorUserId, input.actorUserId)
        )
      )
    )
    .limit(1);
  return Boolean(publication);
}

/**
 * M2 reference resolution.
 *
 * Returns an identity fingerprint only: assertion version/state, requirement
 * revision or document version digest. No fact value, requirement locator,
 * document body, excerpt or storage key ever leaves this adapter. Visibility is
 * the caller's own M2 permission, so a Project member cannot bind another
 * member's private fact or document.
 */
export function createPostgresSchoolApplicationReferenceResolver(): SchoolApplicationReferenceResolver {
  return {
    async resolve(input) {
      if (input.kind === "fact") {
        const [row] = await db
          .select({
            createdByUserId: projectFactAssertion.createdByUserId,
            id: projectFactAssertion.id,
            stale: projectFactAssertion.stale,
            state: projectFactAssertion.state,
            version: projectFactAssertion.version,
          })
          .from(projectFactAssertion)
          .where(
            and(
              eq(projectFactAssertion.id, input.referenceId),
              eq(projectFactAssertion.projectId, input.projectId)
            )
          )
          .limit(1);
        if (!row) {
          return { status: "not_found" };
        }
        const visible =
          row.createdByUserId === input.actorUserId ||
          (await factVisibleToActor({
            actorUserId: input.actorUserId,
            assertionId: row.id,
            assertionVersion: row.version,
          }));
        if (!visible) {
          return { status: "not_found" };
        }
        return {
          referenceSha256: schoolApplicationTextSha256(
            canonicalJson({
              id: row.id,
              kind: "fact",
              stale: row.stale,
              state: row.state,
              version: row.version,
            })
          ),
          referenceVersion: row.version,
          status: "resolved",
        };
      }

      if (input.kind === "requirement") {
        const [row] = await db
          .select({
            id: projectRequirementState.id,
            revision: projectRequirementState.revision,
            staleAt: projectRequirementState.staleAt,
          })
          .from(projectRequirementState)
          .where(
            and(
              eq(projectRequirementState.id, input.referenceId),
              eq(projectRequirementState.projectId, input.projectId)
            )
          )
          .limit(1);
        if (!row) {
          return { status: "not_found" };
        }
        return {
          referenceSha256: schoolApplicationTextSha256(
            canonicalJson({
              id: row.id,
              kind: "requirement",
              revision: row.revision,
              stale: row.staleAt !== null,
            })
          ),
          referenceVersion: row.revision,
          status: "resolved",
        };
      }

      const [asset] = await db
        .select({
          createdByUserId: projectDocumentAsset.createdByUserId,
          id: projectDocumentAsset.id,
          lifecycle: projectDocumentAsset.lifecycle,
        })
        .from(projectDocumentAsset)
        .where(
          and(
            eq(projectDocumentAsset.id, input.referenceId),
            eq(projectDocumentAsset.projectId, input.projectId)
          )
        )
        .limit(1);
      if (!asset || asset.lifecycle !== "active") {
        return { status: "not_found" };
      }
      if (asset.createdByUserId !== input.actorUserId) {
        // Documents are private to their uploader; access requires an individual
        // M2 grant, which this reference is explicitly not.
        return { status: "not_found" };
      }
      const [version] = await db
        .select({
          securityStatus: projectDocumentVersion.securityStatus,
          sha256: projectDocumentVersion.sha256,
          storageStatus: projectDocumentVersion.storageStatus,
          versionId: projectDocumentVersion.versionId,
          versionNumber: projectDocumentVersion.versionNumber,
        })
        .from(projectDocumentVersion)
        .where(
          and(
            eq(projectDocumentVersion.projectId, input.projectId),
            eq(projectDocumentVersion.assetId, asset.id)
          )
        )
        .orderBy(desc(projectDocumentVersion.versionNumber))
        .limit(1);
      if (
        !version ||
        version.securityStatus !== "clean" ||
        version.storageStatus !== "stored"
      ) {
        return { status: "forbidden" };
      }
      return {
        referenceSha256: schoolApplicationTextSha256(
          canonicalJson({
            assetId: asset.id,
            kind: "document",
            sha256: version.sha256,
            versionId: version.versionId,
            versionNumber: version.versionNumber,
          })
        ),
        referenceVersion: version.versionNumber,
        status: "resolved",
      };
    },
  };
}

function intakeLabel(row: {
  intakeCode: string | null;
  term: string | null;
  year: number | null;
  startDate: string | null;
}): string | null {
  const parts = [row.term, row.year ? String(row.year) : null, row.startDate]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim());
  const label = parts.length > 0 ? parts.join(" · ") : row.intakeCode;
  return label ? label.slice(0, 120) : null;
}

/**
 * M3 catalog resolution.
 *
 * The only place a School Application can obtain a catalog classification. It can
 * return `SYNTHETIC` or `UNVERIFIED` and nothing else, because those are the only
 * record classes the M3 catalog stores. A partial or mismatched identity returns
 * `unresolved` so the caller cannot assert an unconfirmed catalog match.
 */
export function createPostgresSchoolApplicationCatalogResolver(): SchoolApplicationCatalogResolver {
  return {
    async resolve(input) {
      if (!(input.institutionId && input.courseId)) {
        return { status: "unresolved" };
      }
      const [provider] = await db
        .select({
          displayName: educationProvider.displayName,
          providerId: educationProvider.providerId,
          recordClass: educationProvider.recordClass,
        })
        .from(educationProvider)
        .where(eq(educationProvider.providerId, input.institutionId))
        .limit(1);
      if (!provider) {
        return { status: "unresolved" };
      }
      const [course] = await db
        .select({
          courseId: educationCourse.courseId,
          recordClass: educationCourse.recordClass,
          title: educationCourse.title,
        })
        .from(educationCourse)
        .where(
          and(
            eq(educationCourse.courseId, input.courseId),
            eq(educationCourse.providerId, provider.providerId)
          )
        )
        .limit(1);
      if (!course || course.recordClass !== provider.recordClass) {
        return { status: "unresolved" };
      }
      let deliveryId: string | null = null;
      if (input.deliveryId) {
        const [delivery] = await db
          .select({ deliveryId: educationDelivery.deliveryId })
          .from(educationDelivery)
          .where(
            and(
              eq(educationDelivery.deliveryId, input.deliveryId),
              eq(educationDelivery.courseId, course.courseId),
              eq(educationDelivery.providerId, provider.providerId)
            )
          )
          .limit(1);
        if (!delivery) {
          return { status: "unresolved" };
        }
        deliveryId = delivery.deliveryId;
      }
      let intakeId: string | null = null;
      let label: string | null = null;
      if (input.intakeId) {
        const [intake] = await db
          .select({
            intakeCode: educationIntake.intakeCode,
            intakeId: educationIntake.intakeId,
            startDate: educationIntake.startDate,
            term: educationIntake.term,
            year: educationIntake.year,
          })
          .from(educationIntake)
          .where(
            and(
              eq(educationIntake.intakeId, input.intakeId),
              eq(educationIntake.providerId, provider.providerId),
              deliveryId
                ? eq(educationIntake.deliveryId, deliveryId)
                : sql`true`
            )
          )
          .limit(1);
        if (!intake) {
          return { status: "unresolved" };
        }
        intakeId = intake.intakeId;
        label = intakeLabel(intake);
      }
      return {
        courseId: course.courseId,
        courseTitle: course.title,
        deliveryId,
        institutionId: provider.providerId,
        institutionName: provider.displayName,
        intakeId,
        intakeLabel: label,
        // A narrow identity lookup does not select a snapshot, so no token is
        // asserted. The record class is carried explicitly instead.
        recordClass: provider.recordClass,
        snapshotToken: null,
        status: "resolved",
      };
    },
  };
}

export const postgresSchoolApplicationStore =
  createPostgresSchoolApplicationStore();
export const postgresSchoolApplicationReferenceResolver =
  createPostgresSchoolApplicationReferenceResolver();
export const postgresSchoolApplicationCatalogResolver =
  createPostgresSchoolApplicationCatalogResolver();
