// biome-ignore-all lint/suspicious/useAwait: this adapter implements an asynchronous persistence port.
import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  projectMembership,
  schoolApplication,
  student500Application,
  student500ApplicationEvent,
  student500ApplicationOperation,
  studyJourneyProject,
  user,
} from "@/lib/db/schema";
import {
  STUDENT_500_MAX_APPLICATIONS_PER_PROJECT,
  type Student500Context,
  Student500Error,
  type Student500HistoryFlagEntry,
} from "./contracts";
import type {
  NewStudent500ApplicationValues,
  Student500ActorContext,
  Student500ApplicationRecord,
  Student500ApplicationStore,
  Student500EventRecord,
  Student500OperationStamp,
  Student500WriteResult,
} from "./ports";
import type { Student500SchoolApplicationLinkResolver } from "./service";

type Database = ReturnType<typeof getLazyDatabase>;
type Executor = Parameters<Parameters<Database["transaction"]>[0]>[0];

type ApplicationRow = typeof student500Application.$inferSelect;

type ContextColumns = {
  applicantAgeBand: Student500Context["applicantAgeBand"];
  applicationPlace: Student500Context["applicationPlace"];
  asOfDate: string | null;
  coeStatus: Student500Context["coeStatus"];
  currentVisaSubclass: string | null;
  dependants: Student500Context["dependants"];
  englishEvidence: Student500Context["englishEvidence"];
  entryRoute: Student500Context["entryRoute"];
  financialEvidence: Student500Context["financialEvidence"];
  historyDeclaration: Student500Context["historyDeclaration"];
  historyFlags: Student500Context["historyFlags"];
  oshcEvidence: Student500Context["oshcEvidence"];
  schoolApplicationId: string | null;
};

/**
 * A persisted history flag must round-trip exactly; a malformed JSON payload is an
 * integrity failure rather than a silently degraded screening.
 */
function readHistoryFlags(value: unknown): Student500HistoryFlagEntry[] {
  if (!Array.isArray(value)) {
    throw new Student500Error("integrity_conflict");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Student500Error("integrity_conflict");
    }
    const record = entry as { flag?: unknown; reportedOn?: unknown };
    if (typeof record.flag !== "string") {
      throw new Student500Error("integrity_conflict");
    }
    return {
      flag: record.flag as Student500HistoryFlagEntry["flag"],
      reportedOn:
        typeof record.reportedOn === "string" ? record.reportedOn : null,
    };
  });
}

function toRecord(row: ApplicationRow): Student500ApplicationRecord {
  return {
    applicantUserId: row.applicantUserId,
    archivedAt: row.archivedAt ?? null,
    context: {
      applicantAgeBand: row.applicantAgeBand,
      applicationPlace: row.applicationPlace,
      asOfDate: row.asOfDate ?? null,
      coeStatus: row.coeStatus,
      currentVisaSubclass: row.currentVisaSubclass ?? null,
      dependants: row.dependants,
      englishEvidence: row.englishEvidence,
      entryRoute: row.entryRoute ?? null,
      financialEvidence: row.financialEvidence,
      historyDeclaration: row.historyDeclaration,
      historyFlags: readHistoryFlags(row.historyFlags),
      oshcEvidence: row.oshcEvidence,
      schoolApplicationId: row.schoolApplicationId ?? null,
    },
    createdAt: row.createdAt,
    id: row.id,
    ownerUserId: row.ownerUserId,
    projectId: row.projectId,
    revision: row.revision,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

function contextColumns(context: Student500Context): ContextColumns {
  return {
    applicantAgeBand: context.applicantAgeBand,
    applicationPlace: context.applicationPlace,
    asOfDate: context.asOfDate,
    coeStatus: context.coeStatus,
    currentVisaSubclass: context.currentVisaSubclass,
    dependants: context.dependants,
    englishEvidence: context.englishEvidence,
    entryRoute: context.entryRoute,
    financialEvidence: context.financialEvidence,
    historyDeclaration: context.historyDeclaration,
    historyFlags: context.historyFlags.map((entry) => ({
      flag: entry.flag,
      reportedOn: entry.reportedOn,
    })),
    oshcEvidence: context.oshcEvidence,
    schoolApplicationId: context.schoolApplicationId,
  };
}

function valuesForWrite(values: NewStudent500ApplicationValues) {
  return {
    applicantUserId: values.applicantUserId,
    ownerUserId: values.ownerUserId,
    ...contextColumns(values.context),
  };
}

function fail(code: ConstructorParameters<typeof Student500Error>[0]): never {
  throw new Student500Error(code);
}

/**
 * Signals that this transaction lost an operation-claim race to another
 * transaction. It is never surfaced: the caller rolls the whole transaction back
 * (so no orphan application, operation or event can survive) and resolves the
 * winning operation in a fresh transaction.
 */
class Student500OperationRaceSignal extends Error {
  constructor() {
    super("student_500_operation_race");
    this.name = "Student500OperationRaceSignal";
  }
}

/**
 * Read-only operation lookup. It performs no insert, so it is safe to run before
 * the application row exists - unlike the operation insert, whose composite
 * foreign key to `Student500Application` is immediate in migration 0048.
 *
 * `replay` reports the **persisted** `resultId`, which is the only identity that
 * may be used to load the previously created application.
 */
async function readOperation(
  tx: Executor,
  input: { operation: Student500OperationStamp }
): Promise<
  | { status: "absent" }
  | { status: "conflict" }
  | { status: "replay"; operationRecordId: string; resultId: string }
> {
  const [existing] = await tx
    .select({
      id: student500ApplicationOperation.id,
      operationType: student500ApplicationOperation.operationType,
      requestSha256: student500ApplicationOperation.requestSha256,
      resultId: student500ApplicationOperation.resultId,
      resultKind: student500ApplicationOperation.resultKind,
    })
    .from(student500ApplicationOperation)
    .where(
      and(
        eq(
          student500ApplicationOperation.actorUserId,
          input.operation.actorUserId
        ),
        eq(
          student500ApplicationOperation.operationId,
          input.operation.operationId
        )
      )
    )
    .for("update")
    .limit(1);
  if (!existing) {
    return { status: "absent" };
  }
  if (
    existing.operationType !== input.operation.operationType ||
    existing.requestSha256 !== input.operation.requestSha256 ||
    existing.resultKind !== "student_500_application"
  ) {
    return { status: "conflict" };
  }
  return {
    operationRecordId: existing.id,
    resultId: existing.resultId,
    status: "replay",
  };
}

/**
 * Claims the operation for a freshly inserted application and returns the audit
 * record id. Losing the `(actorUserId, operationId)` race throws the rollback
 * signal instead of leaving a partially claimed write behind.
 */
async function claimOperationForNewApplication(
  tx: Executor,
  input: {
    operation: Student500OperationStamp;
    projectId: string;
    resultId: string;
  }
): Promise<string> {
  const [claimed] = await tx
    .insert(student500ApplicationOperation)
    .values({
      actorUserId: input.operation.actorUserId,
      applicationId: input.resultId,
      operationId: input.operation.operationId,
      operationType: input.operation.operationType,
      projectId: input.projectId,
      requestSha256: input.operation.requestSha256,
      resultId: input.resultId,
      resultKind: "student_500_application",
    })
    .onConflictDoNothing({
      target: [
        student500ApplicationOperation.actorUserId,
        student500ApplicationOperation.operationId,
      ],
    })
    .returning({ id: student500ApplicationOperation.id });
  if (!claimed) {
    throw new Student500OperationRaceSignal();
  }
  return claimed.id;
}

async function claimOperation(
  tx: Executor,
  input: {
    operation: Student500OperationStamp;
    projectId: string;
    resultId: string;
  }
): Promise<{ operationRecordId: string; replayed: boolean }> {
  const [claimed] = await tx
    .insert(student500ApplicationOperation)
    .values({
      actorUserId: input.operation.actorUserId,
      applicationId: input.resultId,
      operationId: input.operation.operationId,
      operationType: input.operation.operationType,
      projectId: input.projectId,
      requestSha256: input.operation.requestSha256,
      resultId: input.resultId,
      resultKind: "student_500_application",
    })
    .onConflictDoNothing({
      target: [
        student500ApplicationOperation.actorUserId,
        student500ApplicationOperation.operationId,
      ],
    })
    .returning({ id: student500ApplicationOperation.id });
  if (claimed) {
    return { operationRecordId: claimed.id, replayed: false };
  }
  const [existing] = await tx
    .select({
      id: student500ApplicationOperation.id,
      operationType: student500ApplicationOperation.operationType,
      requestSha256: student500ApplicationOperation.requestSha256,
    })
    .from(student500ApplicationOperation)
    .where(
      and(
        eq(
          student500ApplicationOperation.actorUserId,
          input.operation.actorUserId
        ),
        eq(
          student500ApplicationOperation.operationId,
          input.operation.operationId
        )
      )
    )
    .for("update")
    .limit(1);
  if (!existing) {
    fail("integrity_conflict");
  }
  if (
    existing.requestSha256 !== input.operation.requestSha256 ||
    existing.operationType !== input.operation.operationType
  ) {
    fail("idempotency_conflict");
  }
  return { operationRecordId: existing.id, replayed: true };
}

/**
 * Locks the application row for this actor. The Project and owner filters are part
 * of the predicate, so a foreign Project, another member or a forged id can never
 * be locked into a write.
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
    .from(student500Application)
    .where(
      and(
        eq(student500Application.id, input.applicationId),
        eq(student500Application.projectId, input.projectId),
        eq(student500Application.ownerUserId, input.ownerUserId)
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
 * Project closure can commit in between. Locks are taken in the established M1
 * order - Project (FOR UPDATE) then Membership (FOR UPDATE) then Application -
 * so M1 lifecycle and M6.1 writes cannot form a lock cycle.
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
    // Staff, service and guest actors never hold private preparation authority,
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
    eventType:
      | "student_500_created"
      | "student_500_updated"
      | "student_500_archived";
    operationRecordId: string;
    projectId: string;
  }
) {
  await tx.insert(student500ApplicationEvent).values({
    actorUserId: input.actorUserId,
    applicationId: input.applicationId,
    applicationRevision: input.applicationRevision,
    eventType: input.eventType,
    operationRecordId: input.operationRecordId,
    projectId: input.projectId,
    subjectId: input.applicationId,
    subjectKind: "student_500_application",
  });
}

/**
 * Phase 13 M6.1 PostgreSQL store.
 *
 * Invariants are owned by the database, not an in-process mutex:
 *   - `SELECT ... FOR UPDATE` on the application row serializes concurrent writes;
 *   - `unique (actorUserId, operationId)` makes exact replay a lookup and a changed
 *     request an idempotency conflict;
 *   - the guard trigger keeps identity immutable, archived terminal and the
 *     revision strictly advancing;
 *   - operation/event triggers keep the audit trail append-only;
 *   - every write is one transaction, so a rejected request leaves no partial
 *     state.
 */
export function createPostgresStudent500Store(): Student500ApplicationStore {
  const db = getLazyDatabase();

  return {
    async findOperation(input) {
      const [existing] = await db
        .select({
          operationType: student500ApplicationOperation.operationType,
          requestSha256: student500ApplicationOperation.requestSha256,
          resultId: student500ApplicationOperation.resultId,
          resultKind: student500ApplicationOperation.resultKind,
        })
        .from(student500ApplicationOperation)
        .where(
          and(
            eq(student500ApplicationOperation.actorUserId, input.actorUserId),
            eq(student500ApplicationOperation.operationId, input.operationId)
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

    async readActorContext(input): Promise<Student500ActorContext> {
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
      let membershipStatus: Student500ActorContext["membershipStatus"] =
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
        .from(student500Application)
        .where(
          and(
            eq(student500Application.projectId, input.projectId),
            eq(student500Application.ownerUserId, input.ownerUserId)
          )
        )
        .orderBy(
          asc(student500Application.createdAt),
          asc(student500Application.id)
        );
      return rows.map(toRecord);
    },

    async getApplication(input) {
      const [row] = await db
        .select()
        .from(student500Application)
        .where(
          and(
            eq(student500Application.id, input.applicationId),
            eq(student500Application.projectId, input.projectId),
            eq(student500Application.ownerUserId, input.ownerUserId)
          )
        )
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async listEvents(input) {
      const rows = await db
        .select()
        .from(student500ApplicationEvent)
        .where(
          eq(student500ApplicationEvent.applicationId, input.applicationId)
        )
        .orderBy(
          asc(student500ApplicationEvent.applicationRevision),
          asc(student500ApplicationEvent.createdAt)
        );
      return rows.map<Student500EventRecord>((row) => ({
        actorUserId: row.actorUserId,
        applicationId: row.applicationId,
        applicationRevision: row.applicationRevision,
        createdAt: row.createdAt,
        eventType: row.eventType,
        id: row.id,
        projectId: row.projectId,
        subjectId: row.subjectId,
        subjectKind: row.subjectKind,
      }));
    },

    async countApplications(input) {
      const [owned] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(student500Application)
        .where(
          and(
            eq(student500Application.projectId, input.projectId),
            eq(student500Application.ownerUserId, input.ownerUserId)
          )
        );
      return owned?.count ?? 0;
    },

    /**
     * Creates one application.
     *
     * Write order is forced by the schema: `Student500ApplicationOperation` has an
     * immediate composite foreign key to `Student500Application(projectId, id)`,
     * so the application row must exist first. The operation row is therefore
     * claimed after the insert, and an exact retry resolves the recorded operation
     * (and its persisted `resultId`) before anything is written.
     *
     * Concurrency:
     *   - same Project + same operationId: `lockProjectAuthority` takes the Project
     *     row lock, so the second transaction waits and then observes the committed
     *     operation, resolving as a replay;
     *   - different Projects + same operationId: the operation unique index decides
     *     the winner. The loser throws the race signal, the whole transaction rolls
     *     back (no orphan application/operation/event), and a fresh transaction
     *     resolves the winner - a digest mismatch becomes `idempotency_conflict`.
     */
    createApplication(
      input
    ): Promise<Student500WriteResult<Student500ApplicationRecord>> {
      return db
        .transaction(async (tx) => {
          await lockProjectAuthority(tx, {
            actorUserId: input.operation.actorUserId,
            projectId: input.projectId,
          });
          const existing = await readOperation(tx, {
            operation: input.operation,
          });
          if (existing.status === "conflict") {
            fail("idempotency_conflict");
          }
          if (existing.status === "replay") {
            // Load the previously created row by its *persisted* result id.
            const row = await lockApplication(tx, {
              applicationId: existing.resultId,
              ownerUserId: input.values.ownerUserId,
              projectId: input.projectId,
            });
            return { replayed: true, value: toRecord(row) };
          }

          const [owned] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(student500Application)
            .where(
              and(
                eq(student500Application.projectId, input.projectId),
                eq(student500Application.ownerUserId, input.values.ownerUserId)
              )
            );
          if ((owned?.count ?? 0) >= STUDENT_500_MAX_APPLICATIONS_PER_PROJECT) {
            fail("limit_exceeded");
          }

          const [created] = await tx
            .insert(student500Application)
            .values({
              id: randomUUID(),
              projectId: input.projectId,
              revision: 1,
              status: "draft",
              ...valuesForWrite(input.values),
            })
            .returning();
          if (!created) {
            fail("integrity_conflict");
          }

          const operationRecordId = await claimOperationForNewApplication(tx, {
            operation: input.operation,
            projectId: input.projectId,
            resultId: created.id,
          });

          await appendEvent(tx, {
            actorUserId: input.operation.actorUserId,
            applicationId: created.id,
            applicationRevision: 1,
            eventType: "student_500_created",
            operationRecordId,
            projectId: created.projectId,
          });
          return { replayed: false, value: toRecord(created) };
        })
        .catch(async (error: unknown) => {
          if (!(error instanceof Student500OperationRaceSignal)) {
            throw error;
          }
          // The losing transaction has rolled back completely; resolve the winner
          // in a fresh transaction so the caller sees the real persisted record.
          return await db.transaction(async (tx) => {
            await lockProjectAuthority(tx, {
              actorUserId: input.operation.actorUserId,
              projectId: input.projectId,
            });
            const winner = await readOperation(tx, {
              operation: input.operation,
            });
            if (winner.status === "conflict") {
              fail("idempotency_conflict");
            }
            if (winner.status === "absent") {
              // The winner rolled back too; the request can be retried safely.
              fail("state_conflict");
            }
            const row = await lockApplication(tx, {
              applicationId: winner.resultId,
              ownerUserId: input.values.ownerUserId,
              projectId: input.projectId,
            });
            return { replayed: true, value: toRecord(row) };
          });
        });
    },

    updateApplication(
      input
    ): Promise<Student500WriteResult<Student500ApplicationRecord>> {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const existing = await lockApplication(tx, input);
        const claim = await claimOperation(tx, {
          operation: input.operation,
          projectId: input.projectId,
          resultId: input.applicationId,
        });
        if (claim.replayed) {
          return { replayed: true, value: toRecord(existing) };
        }
        if (existing.revision !== input.expectedRevision) {
          fail("revision_conflict");
        }
        if (existing.status === "archived") {
          fail("application_archived");
        }
        const revision = existing.revision + 1;
        const [updated] = await tx
          .update(student500Application)
          .set({
            ...valuesForWrite(input.values),
            revision,
            status: "in_progress",
            updatedAt: new Date(),
          })
          .where(eq(student500Application.id, existing.id))
          .returning();
        if (!updated) {
          fail("integrity_conflict");
        }
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          applicationId: updated.id,
          applicationRevision: revision,
          eventType: "student_500_updated",
          operationRecordId: claim.operationRecordId,
          projectId: updated.projectId,
        });
        return { replayed: false, value: toRecord(updated) };
      });
    },

    archiveApplication(
      input
    ): Promise<Student500WriteResult<Student500ApplicationRecord>> {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const existing = await lockApplication(tx, input);
        const claim = await claimOperation(tx, {
          operation: input.operation,
          projectId: input.projectId,
          resultId: input.applicationId,
        });
        if (claim.replayed) {
          return { replayed: true, value: toRecord(existing) };
        }
        if (existing.revision !== input.expectedRevision) {
          fail("revision_conflict");
        }
        if (existing.status === "archived") {
          fail("application_archived");
        }
        const revision = existing.revision + 1;
        const now = new Date();
        const [archived] = await tx
          .update(student500Application)
          .set({
            archivedAt: now,
            revision,
            status: "archived",
            updatedAt: now,
          })
          .where(eq(student500Application.id, existing.id))
          .returning();
        if (!archived) {
          fail("integrity_conflict");
        }
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          applicationId: archived.id,
          applicationRevision: revision,
          eventType: "student_500_archived",
          operationRecordId: claim.operationRecordId,
          projectId: archived.projectId,
        });
        return { replayed: false, value: toRecord(archived) };
      });
    },
  };
}

/**
 * M5.1 school-application link resolver.
 *
 * It re-authorizes the link for this actor and Project and returns identity plus
 * preparation status only. A CoE is never treated as verified by this path, and the
 * resolution never returns institution, course or document content.
 */
export const postgresStudent500SchoolApplicationLinkResolver: Student500SchoolApplicationLinkResolver =
  {
    async resolve(input) {
      const [row] = await db_client()
        .select({
          id: schoolApplication.id,
          status: schoolApplication.status,
          sourceStatus: schoolApplication.sourceStatus,
        })
        .from(schoolApplication)
        .where(
          and(
            eq(schoolApplication.id, input.applicationId),
            eq(schoolApplication.projectId, input.projectId),
            eq(schoolApplication.ownerUserId, input.actorUserId)
          )
        )
        .limit(1);
      if (!row) {
        return { status: "not_found" };
      }
      return {
        applicationStatus: row.status,
        sourceStatus: row.sourceStatus,
        status: "resolved",
      };
    },
  };

function db_client() {
  return getLazyDatabase();
}
