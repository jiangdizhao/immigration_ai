import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  projectMembership,
  type STUDENT_500_FACT_ORIGIN_VALUES,
  type STUDENT_500_FACT_STATE_VALUES,
  type STUDENT_500_OPERATION_RESULT_KIND_VALUES,
  type STUDENT_500_OPERATION_TYPE_VALUES,
  student500Application,
  student500ApplicationOperation,
  student500FactReference,
  student500GsDraft,
  student500PreparationSnapshot,
  student500SchoolContext,
  studyJourneyProject,
} from "@/lib/db/schema";
import {
  STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS,
  STUDENT_500_PREPARATION_MAX_FACT_REFERENCES,
  STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS,
  Student500PreparationError,
  type Student500PreparationErrorCode,
} from "./contracts";
import type {
  Student500FactReferenceRecord,
  Student500GsDraftRecord,
  Student500PreparationOperationStamp,
  Student500PreparationSnapshotRecord,
  Student500PreparationStore,
  Student500SchoolContextRecord,
} from "./ports";

/**
 * Phase 13 M6.2 PostgreSQL store.
 *
 * Database-owned invariants:
 *   - `unique (actorUserId, operationId)` on the shared M6.1 operation table makes
 *     an exact retry a lookup and a changed request an idempotency conflict;
 *   - `SELECT ... FOR UPDATE` on the Project, then on the application row, gives the
 *     established lock order and serializes concurrent writes per application;
 *   - `unique (applicationId, version)` plus the expected-previous-version check
 *     makes concurrent draft saves lose rather than overwrite each other;
 *   - the 0049 triggers keep identity immutable, versions append-only and refuse
 *     writes to an archived application or a non-active Project;
 *   - an operation row is only written after the row it references exists, so the
 *     immediate composite foreign keys are always satisfied (the M6.1-R1 defect
 *     class).
 */

const db = () => getLazyDatabase();

/**
 * The Drizzle enum for the shared operation table is the M6.1 subset. Migration
 * 0049's CHECK constraint is the authority for accepted M6.2 operation types, so
 * the persisted value is widened here deliberately (and never narrowed).
 */
type PersistedOperationType =
  (typeof STUDENT_500_OPERATION_TYPE_VALUES)[number];
type PersistedResultKind =
  (typeof STUDENT_500_OPERATION_RESULT_KIND_VALUES)[number];

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

function fail(code: Student500PreparationErrorCode): never {
  throw new Student500PreparationError(code);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function lockProjectAuthority(
  tx: Tx,
  input: { readonly actorUserId: string; readonly projectId: string }
) {
  const [row] = await tx
    .select({
      id: studyJourneyProject.id,
      ownerUserId: studyJourneyProject.ownerUserId,
      status: studyJourneyProject.status,
    })
    .from(studyJourneyProject)
    .where(eq(studyJourneyProject.id, input.projectId))
    .for("update")
    .limit(1);
  if (!row) {
    fail("project_not_found");
  }
  if (row.ownerUserId !== input.actorUserId) {
    const [membership] = await tx
      .select({ status: projectMembership.status })
      .from(projectMembership)
      .where(
        and(
          eq(projectMembership.projectId, row.id),
          eq(projectMembership.userId, input.actorUserId)
        )
      )
      .for("update")
      .limit(1);
    if (membership?.status !== "active") {
      fail("project_forbidden");
    }
  }
  if (row.status !== "active") {
    fail("project_closed");
  }
}

/** Row lock scoped by Project *and* owner: a foreign record can never be locked. */
async function lockApplication(
  tx: Tx,
  input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly applicationId: string;
  }
) {
  const [row] = await tx
    .select({
      id: student500Application.id,
      status: student500Application.status,
    })
    .from(student500Application)
    .where(
      and(
        eq(student500Application.id, input.applicationId),
        eq(student500Application.projectId, input.projectId),
        eq(student500Application.ownerUserId, input.actorUserId)
      )
    )
    .for("update")
    .limit(1);
  if (!row) {
    fail("application_not_found");
  }
  if (row.status === "archived") {
    fail("application_archived");
  }
  return row;
}

async function recordOperation(
  tx: Tx,
  input: {
    readonly operation: Student500PreparationOperationStamp;
    readonly projectId: string;
    readonly applicationId: string;
    readonly resultId: string;
  }
) {
  try {
    await tx.insert(student500ApplicationOperation).values({
      actorUserId: input.operation.actorUserId,
      applicationId: input.applicationId,
      operationId: input.operation.operationId,
      operationType: input.operation
        .operationType as unknown as PersistedOperationType,
      projectId: input.projectId,
      requestSha256: input.operation.requestSha256,
      resultId: input.resultId,
      resultKind: input.operation.resultKind as unknown as PersistedResultKind,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Concurrent identical operation: the other transaction won; this one rolls
      // back entirely so nothing orphaned survives.
      fail("idempotency_conflict");
    }
    throw error;
  }
}

toFactReferenceRecord;

function toFactReferenceRecord(
  row: typeof student500FactReference.$inferSelect
): Student500FactReferenceRecord {
  return {
    aiUseAuthorizedAtSelection: row.aiUseAuthorizedAtSelection,
    applicationId: row.applicationId,
    authorizationActorUserId: row.authorizationActorUserId,
    authorizationAudience: row.authorizationAudience,
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    factAssertionId: row.factAssertionId,
    factKey: row.factKey,
    factVersion: row.factVersion,
    id: row.id,
    originKind: row.originKind,
    projectId: row.projectId,
    revokedAt: row.revokedAt,
    sourceEvidenceRef: row.sourceEvidenceRef,
    stateAtUse: row.stateAtUse,
  };
}

function toSchoolContextRecord(
  row: typeof student500SchoolContext.$inferSelect
): Student500SchoolContextRecord {
  return {
    admissionCaseId: row.admissionCaseId,
    admissionOutcomeKind: row.admissionOutcomeKind,
    admissionOutcomeProvenance:
      row.admissionOutcomeProvenance as Student500SchoolContextRecord["admissionOutcomeProvenance"],
    admissionOutcomeVerified: row.admissionOutcomeVerified,
    admissionOutcomeVersion: row.admissionOutcomeVersion,
    applicationId: row.applicationId,
    createdAt: row.createdAt,
    id: row.id,
    kind: row.kind,
    projectId: row.projectId,
    revision: row.revision,
    schoolApplicationId: row.schoolApplicationId,
    studyEvidenceKind: row.studyEvidenceKind,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  };
}

function toDraftRecord(
  row: typeof student500GsDraft.$inferSelect
): Student500GsDraftRecord {
  return {
    applicationId: row.applicationId,
    contentSha256: row.contentSha256,
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    id: row.id,
    inputDigest: row.inputDigest,
    origin: row.origin,
    projectId: row.projectId,
    sectionCount: row.sectionCount,
    sections: row.sections as Student500GsDraftRecord["sections"],
    sourceFactReferenceIds: row.sourceFactReferenceIds as readonly string[],
    supersedesDraftId: row.supersedesDraftId,
    version: row.version,
  };
}

function toSnapshotRecord(
  row: typeof student500PreparationSnapshot.$inferSelect
): Student500PreparationSnapshotRecord {
  return {
    applicationId: row.applicationId,
    applicationRevision: row.applicationRevision,
    content: row.content,
    contentSha256: row.contentSha256,
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    gsDraftId: row.gsDraftId,
    id: row.id,
    inputDigest: row.inputDigest,
    projectId: row.projectId,
    version: row.version,
  };
}

export function createPostgresPreparationStore(): Student500PreparationStore {
  return {
    async findOperation(stamp) {
      const [existing] = await db()
        .select({
          operationType: student500ApplicationOperation.operationType,
          requestSha256: student500ApplicationOperation.requestSha256,
          resultId: student500ApplicationOperation.resultId,
          resultKind: student500ApplicationOperation.resultKind,
        })
        .from(student500ApplicationOperation)
        .where(
          and(
            eq(student500ApplicationOperation.actorUserId, stamp.actorUserId),
            eq(student500ApplicationOperation.operationId, stamp.operationId)
          )
        )
        .limit(1);
      if (!existing) {
        return { status: "absent" };
      }
      const recorded = existing as unknown as {
        readonly operationType: string;
        readonly requestSha256: string;
        readonly resultId: string;
        readonly resultKind: string;
      };
      if (
        recorded.operationType !== stamp.operationType ||
        recorded.requestSha256 !== stamp.requestSha256 ||
        recorded.resultKind !== stamp.resultKind
      ) {
        return { status: "conflict" };
      }
      return {
        resultId: recorded.resultId,
        resultKind:
          recorded.resultKind as Student500PreparationOperationStamp["resultKind"],
        status: "replay",
      };
    },

    async listFactReferences(input) {
      const rows = await db()
        .select()
        .from(student500FactReference)
        .where(eq(student500FactReference.applicationId, input.applicationId))
        .orderBy(
          asc(student500FactReference.createdAt),
          asc(student500FactReference.id)
        );
      return rows.map(toFactReferenceRecord);
    },

    async insertFactReference(input) {
      return await db().transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.createdByUserId,
          projectId: input.projectId,
        });
        const application = await lockApplication(tx, {
          actorUserId: input.createdByUserId,
          applicationId: input.applicationId,
          projectId: input.projectId,
        });
        const [owned] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(student500FactReference)
          .where(
            and(
              eq(student500FactReference.applicationId, application.id),
              isNull(student500FactReference.revokedAt)
            )
          );
        if (
          (owned?.count ?? 0) >= STUDENT_500_PREPARATION_MAX_FACT_REFERENCES
        ) {
          fail("limit_exceeded");
        }
        const [created] = await tx
          .insert(student500FactReference)
          .values({
            aiUseAuthorizedAtSelection: input.aiUseAuthorizedAtSelection,
            applicationId: input.applicationId,
            authorizationActorUserId: input.authorizationActorUserId,
            authorizationAudience: input.authorizationAudience,
            createdByUserId: input.createdByUserId,
            factAssertionId: input.factAssertionId,
            factKey: input.factKey,
            factVersion: input.factVersion,
            originKind:
              input.originKind as (typeof STUDENT_500_FACT_ORIGIN_VALUES)[number],
            projectId: input.projectId,
            sourceEvidenceRef: input.sourceEvidenceRef,
            stateAtUse:
              input.stateAtUse as (typeof STUDENT_500_FACT_STATE_VALUES)[number],
          })
          .returning()
          .catch((error: unknown) => {
            // Only an ACTIVE duplicate violates the partial unique index; a
            // revoked reference may be selected again.
            if (isUniqueViolation(error)) {
              fail("integrity_conflict");
            }
            throw error;
          });
        if (!created) {
          fail("integrity_conflict");
        }
        await recordOperation(tx, {
          applicationId: input.applicationId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: created.id,
        });
        return { replayed: false, value: toFactReferenceRecord(created) };
      });
    },

    async revokeFactReference(input) {
      return await db().transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.actorUserId,
          projectId: input.projectId,
        });
        await lockApplication(tx, {
          actorUserId: input.actorUserId,
          applicationId: input.applicationId,
          projectId: input.projectId,
        });
        const [existing] = await tx
          .select()
          .from(student500FactReference)
          .where(
            and(
              eq(student500FactReference.id, input.factReferenceId),
              eq(student500FactReference.applicationId, input.applicationId),
              eq(student500FactReference.projectId, input.projectId)
            )
          )
          .for("update")
          .limit(1);
        if (!existing) {
          fail("integrity_conflict");
        }
        if (existing.revokedAt !== null) {
          fail("state_conflict");
        }
        const [revoked] = await tx
          .update(student500FactReference)
          .set({ revokedAt: sql`now()` })
          .where(eq(student500FactReference.id, existing.id))
          .returning();
        if (!revoked) {
          fail("integrity_conflict");
        }
        await recordOperation(tx, {
          applicationId: input.applicationId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: revoked.id,
        });
        return { replayed: false, value: toFactReferenceRecord(revoked) };
      });
    },

    async getSchoolContext(input) {
      const [row] = await db()
        .select()
        .from(student500SchoolContext)
        .where(eq(student500SchoolContext.applicationId, input.applicationId))
        .limit(1);
      return row ? toSchoolContextRecord(row) : null;
    },

    async putSchoolContext(input) {
      return await db().transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.actorUserId,
          projectId: input.projectId,
        });
        await lockApplication(tx, {
          actorUserId: input.actorUserId,
          applicationId: input.applicationId,
          projectId: input.projectId,
        });
        const [existing] = await tx
          .select()
          .from(student500SchoolContext)
          .where(eq(student500SchoolContext.applicationId, input.applicationId))
          .for("update")
          .limit(1);
        if (existing) {
          if (
            input.expectedRevision === null ||
            existing.revision !== input.expectedRevision
          ) {
            fail("revision_conflict");
          }
          const [updated] = await tx
            .update(student500SchoolContext)
            .set({
              admissionCaseId: input.values.admissionCaseId,
              admissionOutcomeKind: input.values.admissionOutcomeKind,
              admissionOutcomeProvenance:
                input.values.admissionOutcomeProvenance,
              admissionOutcomeVerified: input.values.admissionOutcomeVerified,
              admissionOutcomeVersion: input.values.admissionOutcomeVersion,
              kind: input.values.kind,
              revision: existing.revision + 1,
              schoolApplicationId: input.values.schoolApplicationId,
              studyEvidenceKind: input.values.studyEvidenceKind,
              updatedAt: sql`now()`,
              updatedByUserId: input.actorUserId,
            })
            .where(eq(student500SchoolContext.id, existing.id))
            .returning();
          if (!updated) {
            fail("integrity_conflict");
          }
          await recordOperation(tx, {
            applicationId: input.applicationId,
            operation: input.operation,
            projectId: input.projectId,
            resultId: updated.id,
          });
          return { replayed: false, value: toSchoolContextRecord(updated) };
        }
        if (input.expectedRevision !== null) {
          fail("revision_conflict");
        }
        const [created] = await tx
          .insert(student500SchoolContext)
          .values({
            admissionCaseId: input.values.admissionCaseId,
            admissionOutcomeKind: input.values.admissionOutcomeKind,
            admissionOutcomeProvenance: input.values.admissionOutcomeProvenance,
            admissionOutcomeVerified: input.values.admissionOutcomeVerified,
            admissionOutcomeVersion: input.values.admissionOutcomeVersion,
            applicationId: input.applicationId,
            kind: input.values.kind,
            projectId: input.projectId,
            schoolApplicationId: input.values.schoolApplicationId,
            studyEvidenceKind: input.values.studyEvidenceKind,
            updatedByUserId: input.actorUserId,
          })
          .returning();
        if (!created) {
          fail("integrity_conflict");
        }
        await recordOperation(tx, {
          applicationId: input.applicationId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: created.id,
        });
        return { replayed: false, value: toSchoolContextRecord(created) };
      });
    },

    async listDrafts(input) {
      const rows = await db()
        .select()
        .from(student500GsDraft)
        .where(eq(student500GsDraft.applicationId, input.applicationId))
        .orderBy(asc(student500GsDraft.version));
      return rows.map(toDraftRecord);
    },

    async getDraft(input) {
      const [row] = await db()
        .select()
        .from(student500GsDraft)
        .where(
          and(
            eq(student500GsDraft.id, input.draftId),
            eq(student500GsDraft.applicationId, input.applicationId),
            eq(student500GsDraft.projectId, input.projectId)
          )
        )
        .limit(1);
      return row ? toDraftRecord(row) : null;
    },

    async insertDraft(input) {
      return await db().transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.actorUserId,
          projectId: input.projectId,
        });
        await lockApplication(tx, {
          actorUserId: input.actorUserId,
          applicationId: input.applicationId,
          projectId: input.projectId,
        });
        const [current] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(student500GsDraft)
          .where(eq(student500GsDraft.applicationId, input.applicationId));
        if (
          (current?.count ?? 0) >= STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS
        ) {
          fail("limit_exceeded");
        }
        const [latest] = await tx
          .select({ version: student500GsDraft.version })
          .from(student500GsDraft)
          .where(eq(student500GsDraft.applicationId, input.applicationId))
          .orderBy(sql`${student500GsDraft.version} desc`)
          .limit(1);
        const nextVersion = (latest?.version ?? 0) + 1;
        if (
          input.values.expectedPreviousVersion !== null &&
          input.values.expectedPreviousVersion !== nextVersion - 1
        ) {
          fail("version_conflict");
        }
        const [created] = await tx
          .insert(student500GsDraft)
          .values({
            applicationId: input.applicationId,
            contentSha256: input.values.contentSha256,
            createdByUserId: input.actorUserId,
            inputDigest: input.values.inputDigest,
            origin: input.values.origin,
            projectId: input.projectId,
            sectionCount: input.values.sections.length,
            sections: input.values.sections,
            sourceFactReferenceIds: input.values.sourceFactReferenceIds,
            supersedesDraftId: input.values.supersedesDraftId,
            version: nextVersion,
          })
          .returning();
        if (!created) {
          fail("integrity_conflict");
        }
        await recordOperation(tx, {
          applicationId: input.applicationId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: created.id,
        });
        return { replayed: false, value: toDraftRecord(created) };
      });
    },

    async listSnapshots(input) {
      const rows = await db()
        .select()
        .from(student500PreparationSnapshot)
        .where(
          eq(student500PreparationSnapshot.applicationId, input.applicationId)
        )
        .orderBy(asc(student500PreparationSnapshot.version));
      return rows.map(toSnapshotRecord);
    },

    async getSnapshot(input) {
      const [row] = await db()
        .select()
        .from(student500PreparationSnapshot)
        .where(
          and(
            eq(student500PreparationSnapshot.id, input.snapshotId),
            eq(
              student500PreparationSnapshot.applicationId,
              input.applicationId
            ),
            eq(student500PreparationSnapshot.projectId, input.projectId)
          )
        )
        .limit(1);
      return row ? toSnapshotRecord(row) : null;
    },

    async insertSnapshot(input) {
      return await db().transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.actorUserId,
          projectId: input.projectId,
        });
        await lockApplication(tx, {
          actorUserId: input.actorUserId,
          applicationId: input.applicationId,
          projectId: input.projectId,
        });
        const [current] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(student500PreparationSnapshot)
          .where(
            eq(student500PreparationSnapshot.applicationId, input.applicationId)
          );
        if (
          (current?.count ?? 0) >= STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS
        ) {
          fail("limit_exceeded");
        }
        const [latest] = await tx
          .select({ version: student500PreparationSnapshot.version })
          .from(student500PreparationSnapshot)
          .where(
            eq(student500PreparationSnapshot.applicationId, input.applicationId)
          )
          .orderBy(sql`${student500PreparationSnapshot.version} desc`)
          .limit(1);
        const [created] = await tx
          .insert(student500PreparationSnapshot)
          .values({
            applicationId: input.applicationId,
            applicationRevision: input.values.applicationRevision,
            content: input.values.content,
            contentSha256: input.values.contentSha256,
            createdByUserId: input.actorUserId,
            gsDraftId: input.values.gsDraftId,
            inputDigest: input.values.inputDigest,
            projectId: input.projectId,
            version: (latest?.version ?? 0) + 1,
          })
          .returning();
        if (!created) {
          fail("integrity_conflict");
        }
        await recordOperation(tx, {
          applicationId: input.applicationId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: created.id,
        });
        return { replayed: false, value: toSnapshotRecord(created) };
      });
    },

    async countFactReferences(input) {
      const [row] = await db()
        .select({ count: sql<number>`count(*)::int` })
        .from(student500FactReference)
        .where(
          and(
            eq(student500FactReference.applicationId, input.applicationId),
            isNull(student500FactReference.revokedAt)
          )
        );
      return row?.count ?? 0;
    },

    async countDrafts(input) {
      const [row] = await db()
        .select({ count: sql<number>`count(*)::int` })
        .from(student500GsDraft)
        .where(eq(student500GsDraft.applicationId, input.applicationId));
      return row?.count ?? 0;
    },

    async countSnapshots(input) {
      const [row] = await db()
        .select({ count: sql<number>`count(*)::int` })
        .from(student500PreparationSnapshot)
        .where(
          eq(student500PreparationSnapshot.applicationId, input.applicationId)
        );
      return row?.count ?? 0;
    },
  };
}
