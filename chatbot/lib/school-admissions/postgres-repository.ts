// biome-ignore-all lint/suspicious/useAwait: this adapter implements an asynchronous persistence port.
import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { guestRegex } from "@/lib/constants";
import { getLazyDatabase } from "@/lib/db/runtime-client";
import {
  projectDocumentAsset,
  projectDocumentVersion,
  projectMembership,
  schoolAdmissionCase,
  schoolAdmissionEvent,
  schoolAdmissionException,
  schoolAdmissionExternalAction,
  schoolAdmissionOperation,
  schoolAdmissionOutcome,
  schoolAdmissionPreparation,
  studyJourneyProject,
  user,
} from "@/lib/db/schema";
import { SchoolAdmissionsError } from "./contracts";
import type {
  SchoolAdmissionCaseRecord,
  SchoolAdmissionEventRecord,
  SchoolAdmissionExceptionRecord,
  SchoolAdmissionExternalActionRecord,
  SchoolAdmissionOutcomeRecord,
  SchoolAdmissionPreparationRecord,
  SchoolAdmissionsActorContext,
  SchoolAdmissionsDocumentOption,
  SchoolAdmissionsDocumentPort,
  SchoolAdmissionsMembershipStatus,
  SchoolAdmissionsOperationResultKind,
  SchoolAdmissionsOperationStamp,
  SchoolAdmissionsStore,
} from "./ports";

type Database = ReturnType<typeof getLazyDatabase>;
type Executor = Parameters<Parameters<Database["transaction"]>[0]>[0];

const db = getLazyDatabase();

function fail(
  code: ConstructorParameters<typeof SchoolAdmissionsError>[0]
): never {
  throw new SchoolAdmissionsError(code);
}

function toCaseRecord(
  row: typeof schoolAdmissionCase.$inferSelect
): SchoolAdmissionCaseRecord {
  return {
    applicationId: row.applicationId ?? null,
    confirmedPreparationVersion: row.confirmedPreparationVersion ?? null,
    courseTitle: row.courseTitle ?? null,
    createdAt: row.createdAt,
    id: row.id,
    institutionName: row.institutionName,
    intakeLabel: row.intakeLabel ?? null,
    managedReadinessCheckedAt: row.managedReadinessCheckedAt ?? null,
    managedReadinessReasonCodes: row.managedReadinessReasonCodes ?? [],
    managedReadinessStatus: row.managedReadinessStatus,
    managedReadinessToken: row.managedReadinessToken ?? null,
    originKind: row.originKind,
    ownerUserId: row.ownerUserId,
    preparationState: row.preparationState,
    projectId: row.projectId,
    revision: row.revision,
    serviceMode: row.serviceMode,
    updatedAt: row.updatedAt,
  };
}

function toPreparationRecord(
  row: typeof schoolAdmissionPreparation.$inferSelect
): SchoolAdmissionPreparationRecord {
  return {
    applicationRevision: row.applicationRevision ?? null,
    assistKind: row.assistKind,
    caseId: row.caseId,
    caseRevision: row.caseRevision,
    confirmedAt: row.confirmedAt ?? null,
    contentSha256: row.contentSha256,
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    id: row.id,
    inputsSha256: row.inputsSha256,
    operationId: row.operationId,
    packageContentSha256: row.packageContentSha256 ?? null,
    packageId: row.packageId ?? null,
    projectId: row.projectId,
    requestSha256: row.requestSha256,
    requirements:
      row.requirements as SchoolAdmissionPreparationRecord["requirements"],
    schemaVersion: row.schemaVersion,
    sections: row.sections as SchoolAdmissionPreparationRecord["sections"],
    serviceMode: row.serviceMode,
    sourceDigest: row.sourceDigest,
    version: row.version,
  };
}

function toOutcomeRecord(
  row: typeof schoolAdmissionOutcome.$inferSelect
): SchoolAdmissionOutcomeRecord {
  return {
    caseId: row.caseId,
    decisionOn: row.decisionOn ?? null,
    evidenceReferenceId: row.evidenceReferenceId ?? null,
    evidenceReferenceSha256: row.evidenceReferenceSha256 ?? null,
    evidenceReferenceVersion: row.evidenceReferenceVersion ?? null,
    expiresOn: row.expiresOn ?? null,
    id: row.id,
    kind: row.kind,
    operationId: row.operationId,
    projectId: row.projectId,
    provenance: row.provenance,
    receivedOn: row.receivedOn ?? null,
    recordedAt: row.recordedAt,
    reportedByUserId: row.reportedByUserId,
    requestSha256: row.requestSha256,
    state: row.state as SchoolAdmissionOutcomeRecord["state"],
    supersededById: row.supersededById ?? null,
    validFrom: row.validFrom ?? null,
    validTo: row.validTo ?? null,
    version: row.version,
  };
}

function toExternalActionRecord(
  row: typeof schoolAdmissionExternalAction.$inferSelect
): SchoolAdmissionExternalActionRecord {
  return {
    acknowledged: true,
    actionKind: row.actionKind,
    caseId: row.caseId,
    id: row.id,
    note: row.note ?? null,
    operationId: row.operationId,
    performedOn: row.performedOn,
    projectId: row.projectId,
    provenance: "customer_reported",
    recordedAt: row.recordedAt,
    reportedByUserId: row.reportedByUserId,
    requestSha256: row.requestSha256,
  };
}

function toExceptionRecord(
  row: typeof schoolAdmissionException.$inferSelect
): SchoolAdmissionExceptionRecord {
  return {
    authorityReference: row.authorityReference ?? null,
    caseId: row.caseId,
    claimKind: row.claimKind as SchoolAdmissionExceptionRecord["claimKind"],
    decidedAt: row.decidedAt ?? null,
    decidedByUserId: row.decidedByUserId ?? null,
    description: row.description,
    id: row.id,
    operationId: row.operationId,
    projectId: row.projectId,
    recordedAt: row.recordedAt,
    reportedByUserId: row.reportedByUserId,
    requestSha256: row.requestSha256,
    state: row.state,
    supersededById: row.supersededById ?? null,
    version: row.version,
  };
}

function toEventRecord(
  row: typeof schoolAdmissionEvent.$inferSelect
): SchoolAdmissionEventRecord {
  return {
    actorUserId: row.actorUserId,
    caseId: row.caseId,
    caseRevision: row.caseRevision,
    createdAt: row.createdAt,
    eventType: row.eventType,
    id: row.id,
    projectId: row.projectId,
    subjectId: row.subjectId,
    subjectKind: row.subjectKind,
  };
}

/**
 * In-transaction authority revalidation, in the frozen M1 order:
 * actor re-read → Project `FOR UPDATE` → Membership `FOR UPDATE` → Project status.
 *
 * This mirrors the accepted M5.1 helper (which is module-private there) so M5.2
 * inherits the same TOCTOU protection without reopening accepted M5.1 code.
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

/**
 * Claims `(actorUserId, operationId)` inside the write transaction.
 *
 * Returns the new operation record id when claimed, or the recorded result when
 * this is an exact replay; a materially different request is an idempotency
 * conflict. Nothing is written when the claim already exists.
 */
type OperationClaim =
  | { readonly kind: "claimed"; readonly operationRecordId: string }
  | {
      readonly kind: "replay";
      readonly resultId: string;
      readonly resultKind: SchoolAdmissionsOperationResultKind;
    };

async function claimOperation(
  tx: Executor,
  input: {
    caseId: string;
    operation: SchoolAdmissionsOperationStamp;
    projectId: string;
    resultId: string;
    resultKind: SchoolAdmissionsOperationResultKind;
  }
): Promise<OperationClaim> {
  const [inserted] = await tx
    .insert(schoolAdmissionOperation)
    .values({
      actorUserId: input.operation.actorUserId,
      caseId: input.caseId,
      operationId: input.operation.operationId,
      operationType: input.operation.operationType,
      projectId: input.projectId,
      requestSha256: input.operation.requestSha256,
      resultId: input.resultId,
      resultKind: input.resultKind,
    })
    .onConflictDoNothing()
    .returning({ id: schoolAdmissionOperation.id });
  if (inserted) {
    return { kind: "claimed", operationRecordId: inserted.id };
  }
  const [existing] = await tx
    .select({
      operationType: schoolAdmissionOperation.operationType,
      requestSha256: schoolAdmissionOperation.requestSha256,
      resultId: schoolAdmissionOperation.resultId,
      resultKind: schoolAdmissionOperation.resultKind,
    })
    .from(schoolAdmissionOperation)
    .where(
      and(
        eq(schoolAdmissionOperation.actorUserId, input.operation.actorUserId),
        eq(schoolAdmissionOperation.operationId, input.operation.operationId)
      )
    )
    .limit(1);
  if (!existing) {
    fail("integrity_conflict");
  }
  if (
    existing.operationType !== input.operation.operationType ||
    existing.requestSha256 !== input.operation.requestSha256
  ) {
    fail("idempotency_conflict");
  }
  return {
    kind: "replay",
    resultId: existing.resultId,
    resultKind: existing.resultKind as SchoolAdmissionsOperationResultKind,
  };
}

async function appendEvent(
  tx: Executor,
  input: {
    actorUserId: string;
    caseId: string;
    caseRevision: number;
    eventType: (typeof schoolAdmissionEvent.$inferInsert)["eventType"];
    operationRecordId: string;
    projectId: string;
    subjectId: string;
    subjectKind: (typeof schoolAdmissionEvent.$inferInsert)["subjectKind"];
  }
) {
  await tx.insert(schoolAdmissionEvent).values({
    actorUserId: input.actorUserId,
    caseId: input.caseId,
    caseRevision: input.caseRevision,
    eventType: input.eventType,
    operationRecordId: input.operationRecordId,
    projectId: input.projectId,
    subjectId: input.subjectId,
    subjectKind: input.subjectKind,
  });
}

/** Loads and locks one case row for the authorized creator (creator-private). */
async function lockCase(
  tx: Executor,
  input: {
    caseId: string;
    ownerUserId: string;
    projectId: string;
    expectedRevision: number;
  }
): Promise<SchoolAdmissionCaseRecord> {
  const [row] = await tx
    .select()
    .from(schoolAdmissionCase)
    .where(
      and(
        eq(schoolAdmissionCase.id, input.caseId),
        eq(schoolAdmissionCase.projectId, input.projectId),
        eq(schoolAdmissionCase.ownerUserId, input.ownerUserId)
      )
    )
    .for("update")
    .limit(1);
  if (!row) {
    fail("case_not_found");
  }
  if (row.revision !== input.expectedRevision) {
    fail("revision_conflict");
  }
  return toCaseRecord(row);
}

async function bumpCase(
  tx: Executor,
  input: {
    caseId: string;
    patch: Partial<typeof schoolAdmissionCase.$inferInsert>;
    revision: number;
  }
): Promise<SchoolAdmissionCaseRecord> {
  const [row] = await tx
    .update(schoolAdmissionCase)
    .set({
      ...input.patch,
      revision: input.revision + 1,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(schoolAdmissionCase.id, input.caseId),
        eq(schoolAdmissionCase.revision, input.revision)
      )
    )
    .returning();
  if (!row) {
    fail("revision_conflict");
  }
  return toCaseRecord(row);
}

function nextVersion(versions: readonly number[], limit: number): number {
  const highest = versions.reduce((max, value) => Math.max(max, value), 0);
  if (versions.length >= limit) {
    fail("limit_exceeded");
  }
  return highest + 1;
}

/**
 * Phase 13 M5.2 PostgreSQL store.
 *
 * Invariants are owned by the database, not by an in-process mutex:
 * - `SELECT … FOR UPDATE` on the Project, Membership and case rows serializes
 *   concurrent writes in the frozen M1 order;
 * - `unique (actorUserId, operationId)` makes an exact replay a lookup and a
 *   changed request an idempotency conflict;
 * - partial unique indexes keep at most one live Offer, CoE and exception;
 * - the guard triggers keep identity, content and history immutable;
 * - every write is one transaction, so a rejected request leaves no partial state.
 */
export function createPostgresSchoolAdmissionsStore(): SchoolAdmissionsStore {
  return {
    async readActorContext(input): Promise<SchoolAdmissionsActorContext> {
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
      if (!project) {
        return {
          membershipStatus: "missing",
          project: null,
          registeredCustomer: Boolean(actor),
          staff: false,
        };
      }
      const [membership] = await db
        .select({ status: projectMembership.status })
        .from(projectMembership)
        .where(
          and(
            eq(projectMembership.projectId, project.id),
            eq(projectMembership.userId, input.actorUserId)
          )
        )
        .limit(1);
      const staff = !(actor?.role === "user" && !guestRegex.test(actor.email));
      const membershipStatus: SchoolAdmissionsMembershipStatus = staff
        ? "missing"
        : project.ownerUserId === input.actorUserId
          ? "owner"
          : membership?.status === "active"
            ? "active_member"
            : membership?.status === "pending"
              ? "pending"
              : membership?.status === "revoked"
                ? "revoked"
                : "missing";
      return {
        membershipStatus,
        project: {
          id: project.id,
          ownerUserId: project.ownerUserId,
          status: project.status,
        },
        registeredCustomer: !staff,
        staff,
      };
    },

    async findOperation(input) {
      const [existing] = await db
        .select({
          operationType: schoolAdmissionOperation.operationType,
          requestSha256: schoolAdmissionOperation.requestSha256,
          resultId: schoolAdmissionOperation.resultId,
          resultKind: schoolAdmissionOperation.resultKind,
        })
        .from(schoolAdmissionOperation)
        .where(
          and(
            eq(schoolAdmissionOperation.actorUserId, input.actorUserId),
            eq(schoolAdmissionOperation.operationId, input.operationId)
          )
        )
        .limit(1);
      if (!existing) {
        return { status: "absent" } as const;
      }
      if (
        existing.operationType !== input.operationType ||
        existing.requestSha256 !== input.requestSha256
      ) {
        return { status: "conflict" } as const;
      }
      return {
        resultId: existing.resultId,
        resultKind: existing.resultKind as SchoolAdmissionsOperationResultKind,
        status: "replay",
      } as const;
    },

    async listCases(input) {
      const rows = await db
        .select()
        .from(schoolAdmissionCase)
        .where(
          and(
            eq(schoolAdmissionCase.projectId, input.projectId),
            eq(schoolAdmissionCase.ownerUserId, input.ownerUserId)
          )
        )
        .orderBy(asc(schoolAdmissionCase.createdAt));
      return rows.map(toCaseRecord);
    },

    async getCase(input) {
      const [row] = await db
        .select()
        .from(schoolAdmissionCase)
        .where(
          and(
            eq(schoolAdmissionCase.id, input.caseId),
            eq(schoolAdmissionCase.projectId, input.projectId),
            eq(schoolAdmissionCase.ownerUserId, input.ownerUserId)
          )
        )
        .limit(1);
      return row ? toCaseRecord(row) : null;
    },

    async getCaseByApplication(input) {
      const [row] = await db
        .select()
        .from(schoolAdmissionCase)
        .where(
          and(
            eq(schoolAdmissionCase.projectId, input.projectId),
            eq(schoolAdmissionCase.ownerUserId, input.ownerUserId),
            eq(schoolAdmissionCase.applicationId, input.applicationId)
          )
        )
        .limit(1);
      return row ? toCaseRecord(row) : null;
    },

    async countCases(input) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schoolAdmissionCase)
        .where(eq(schoolAdmissionCase.projectId, input.projectId));
      return row?.count ?? 0;
    },

    async listPreparations(input) {
      const rows = await db
        .select()
        .from(schoolAdmissionPreparation)
        .where(eq(schoolAdmissionPreparation.caseId, input.caseId))
        .orderBy(asc(schoolAdmissionPreparation.version));
      return rows.map(toPreparationRecord);
    },

    async listOutcomes(input) {
      const rows = await db
        .select()
        .from(schoolAdmissionOutcome)
        .where(eq(schoolAdmissionOutcome.caseId, input.caseId))
        .orderBy(asc(schoolAdmissionOutcome.recordedAt));
      return rows.map(toOutcomeRecord);
    },

    async listExternalActions(input) {
      const rows = await db
        .select()
        .from(schoolAdmissionExternalAction)
        .where(eq(schoolAdmissionExternalAction.caseId, input.caseId))
        .orderBy(asc(schoolAdmissionExternalAction.recordedAt));
      return rows.map(toExternalActionRecord);
    },

    async listExceptions(input) {
      const rows = await db
        .select()
        .from(schoolAdmissionException)
        .where(eq(schoolAdmissionException.caseId, input.caseId))
        .orderBy(asc(schoolAdmissionException.version));
      return rows.map(toExceptionRecord);
    },

    async listEvents(input) {
      const rows = await db
        .select()
        .from(schoolAdmissionEvent)
        .where(eq(schoolAdmissionEvent.caseId, input.caseId))
        .orderBy(asc(schoolAdmissionEvent.createdAt));
      return rows.map(toEventRecord);
    },

    async createCase(input) {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const caseId = randomUUID();
        const claim = await claimOperation(tx, {
          caseId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: caseId,
          resultKind: "school_admission_case",
        });
        if (claim.kind === "replay") {
          const [row] = await tx
            .select()
            .from(schoolAdmissionCase)
            .where(
              and(
                eq(schoolAdmissionCase.id, claim.resultId),
                eq(schoolAdmissionCase.projectId, input.projectId),
                eq(schoolAdmissionCase.ownerUserId, input.ownerUserId)
              )
            )
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toCaseRecord(row) };
        }
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schoolAdmissionCase)
          .where(eq(schoolAdmissionCase.projectId, input.projectId));
        if ((count ?? 0) >= 16) {
          fail("limit_exceeded");
        }
        const [row] = await tx
          .insert(schoolAdmissionCase)
          .values({
            applicationId: input.applicationId,
            courseTitle: input.courseTitle,
            id: caseId,
            institutionName: input.institutionName,
            intakeLabel: input.intakeLabel,
            originKind: input.originKind,
            ownerUserId: input.ownerUserId,
            projectId: input.projectId,
            serviceMode: input.serviceMode,
          })
          .returning();
        if (!row) {
          fail("integrity_conflict");
        }
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          caseId,
          caseRevision: row.revision,
          eventType: "school_admission_case_created",
          operationRecordId: claim.operationRecordId,
          projectId: input.projectId,
          subjectId: caseId,
          subjectKind: "school_admission_case",
        });
        return { replayed: false, value: toCaseRecord(row) };
      });
    },

    async updateServiceMode(input) {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const claim = await claimOperation(tx, {
          caseId: input.caseId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: input.caseId,
          resultKind: "school_admission_case",
        });
        if (claim.kind === "replay") {
          const [row] = await tx
            .select()
            .from(schoolAdmissionCase)
            .where(eq(schoolAdmissionCase.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toCaseRecord(row) };
        }
        const current = await lockCase(tx, {
          caseId: input.caseId,
          expectedRevision: input.expectedRevision,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const [preparation] = await tx
          .select({ id: schoolAdmissionPreparation.id })
          .from(schoolAdmissionPreparation)
          .where(eq(schoolAdmissionPreparation.caseId, current.id))
          .limit(1);
        const next = await bumpCase(tx, {
          caseId: current.id,
          patch: {
            preparationState:
              preparation && current.serviceMode !== input.serviceMode
                ? "stale"
                : current.preparationState,
            serviceMode: input.serviceMode,
          },
          revision: current.revision,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          caseId: current.id,
          caseRevision: next.revision,
          eventType: "school_admission_service_mode_changed",
          operationRecordId: claim.operationRecordId,
          projectId: input.projectId,
          subjectId: current.id,
          subjectKind: "school_admission_case",
        });
        return { replayed: false, value: next };
      });
    },

    async recordPreparation(input) {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const preparationId = randomUUID();
        const claim = await claimOperation(tx, {
          caseId: input.caseId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: preparationId,
          resultKind: "school_admission_preparation",
        });
        if (claim.kind === "replay") {
          const [row] = await tx
            .select()
            .from(schoolAdmissionPreparation)
            .where(eq(schoolAdmissionPreparation.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toPreparationRecord(row) };
        }
        const current = await lockCase(tx, {
          caseId: input.caseId,
          expectedRevision: input.expectedRevision,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const versions = await tx
          .select({ version: schoolAdmissionPreparation.version })
          .from(schoolAdmissionPreparation)
          .where(eq(schoolAdmissionPreparation.caseId, current.id));
        const version = nextVersion(
          versions.map((entry) => entry.version),
          24
        );
        const [row] = await tx
          .insert(schoolAdmissionPreparation)
          .values({
            applicationRevision: input.preparation.applicationRevision,
            assistKind: input.preparation.assistKind,
            caseId: current.id,
            caseRevision: input.preparation.caseRevision,
            contentSha256: input.preparation.contentSha256,
            createdByUserId: input.operation.actorUserId,
            id: preparationId,
            inputsSha256: input.preparation.inputsSha256,
            operationId: input.operation.operationId,
            packageContentSha256: input.preparation.packageContentSha256,
            packageId: input.preparation.packageId,
            projectId: input.projectId,
            requestSha256: input.operation.requestSha256,
            requirements: input.preparation.requirements,
            schemaVersion: input.preparation.schemaVersion,
            sections: input.preparation.sections,
            serviceMode: input.preparation.serviceMode,
            sourceDigest: input.preparation.sourceDigest,
            version,
          })
          .returning();
        if (!row) {
          fail("integrity_conflict");
        }
        const outstanding = input.preparation.requirements.filter(
          (entry) =>
            entry.required &&
            entry.status !== "satisfied" &&
            entry.status !== "not_applicable"
        );
        const next = await bumpCase(tx, {
          caseId: current.id,
          patch: {
            preparationState:
              outstanding.length === 0
                ? "ready_for_customer_review"
                : "in_preparation",
          },
          revision: current.revision,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          caseId: current.id,
          caseRevision: next.revision,
          eventType: "school_admission_preparation_recorded",
          operationRecordId: claim.operationRecordId,
          projectId: input.projectId,
          subjectId: row.id,
          subjectKind: "school_admission_preparation",
        });
        return { replayed: false, value: toPreparationRecord(row) };
      });
    },

    async confirmPreparation(input) {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const claim = await claimOperation(tx, {
          caseId: input.caseId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: input.preparationId,
          resultKind: "school_admission_preparation",
        });
        if (claim.kind === "replay") {
          const [row] = await tx
            .select()
            .from(schoolAdmissionPreparation)
            .where(eq(schoolAdmissionPreparation.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toPreparationRecord(row) };
        }
        const current = await lockCase(tx, {
          caseId: input.caseId,
          expectedRevision: input.expectedRevision,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        /**
         * Only the newest preparation version may be confirmed, and each version
         * carries at most one immutable confirmation. Reconfirmation is therefore
         * a confirmation of a NEW version, never an edit of an old confirmation.
         */
        const [newest] = await tx
          .select({ id: schoolAdmissionPreparation.id })
          .from(schoolAdmissionPreparation)
          .where(eq(schoolAdmissionPreparation.caseId, current.id))
          .orderBy(desc(schoolAdmissionPreparation.version))
          .limit(1);
        if (!newest || newest.id !== input.preparationId) {
          fail("state_conflict");
        }
        const [row] = await tx
          .update(schoolAdmissionPreparation)
          .set({ confirmedAt: sql`now()` })
          .where(
            and(
              eq(schoolAdmissionPreparation.id, input.preparationId),
              eq(schoolAdmissionPreparation.caseId, current.id),
              isNull(schoolAdmissionPreparation.confirmedAt)
            )
          )
          .returning();
        if (!row) {
          fail("state_conflict");
        }
        const next = await bumpCase(tx, {
          caseId: current.id,
          patch: {
            confirmedPreparationVersion: row.version,
            preparationState: "customer_confirmed",
          },
          revision: current.revision,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          caseId: current.id,
          caseRevision: next.revision,
          eventType: "school_admission_preparation_confirmed",
          operationRecordId: claim.operationRecordId,
          projectId: input.projectId,
          subjectId: row.id,
          subjectKind: "school_admission_preparation",
        });
        return { replayed: false, value: toPreparationRecord(row) };
      });
    },

    async recordOutcome(input) {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const outcomeId = randomUUID();
        const claim = await claimOperation(tx, {
          caseId: input.caseId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: outcomeId,
          resultKind: "school_admission_outcome",
        });
        if (claim.kind === "replay") {
          const [row] = await tx
            .select()
            .from(schoolAdmissionOutcome)
            .where(eq(schoolAdmissionOutcome.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toOutcomeRecord(row) };
        }
        const current = await lockCase(tx, {
          caseId: input.caseId,
          expectedRevision: input.expectedRevision,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const versions = await tx
          .select({ version: schoolAdmissionOutcome.version })
          .from(schoolAdmissionOutcome)
          .where(
            and(
              eq(schoolAdmissionOutcome.caseId, current.id),
              eq(schoolAdmissionOutcome.kind, input.outcome.kind)
            )
          );
        const version = nextVersion(
          versions.map((entry) => entry.version),
          24
        );
        const [previous] = await tx
          .select({ id: schoolAdmissionOutcome.id })
          .from(schoolAdmissionOutcome)
          .where(
            and(
              eq(schoolAdmissionOutcome.caseId, current.id),
              eq(schoolAdmissionOutcome.kind, input.outcome.kind),
              isNull(schoolAdmissionOutcome.supersededById)
            )
          )
          .limit(1);
        /**
         * Supersede the live row BEFORE inserting its successor.
         *
         * The partial unique index on `supersededById IS NULL` is immediate, so a
         * successor inserted first would collide with the still-live row. The
         * self-referencing `superseded_fk` is `DEFERRABLE INITIALLY DEFERRED`
         * (migration 0047), so pointing at `outcomeId` before that row exists is
         * valid and is checked at COMMIT.
         */
        if (previous) {
          await tx
            .update(schoolAdmissionOutcome)
            .set({ supersededById: outcomeId })
            .where(eq(schoolAdmissionOutcome.id, previous.id));
        }
        const [row] = await tx
          .insert(schoolAdmissionOutcome)
          .values({
            caseId: current.id,
            decisionOn: input.outcome.decisionOn,
            evidenceReferenceId: input.outcome.evidenceReferenceId,
            evidenceReferenceSha256: input.outcome.evidenceReferenceSha256,
            evidenceReferenceVersion: input.outcome.evidenceReferenceVersion,
            expiresOn: input.outcome.expiresOn,
            id: outcomeId,
            kind: input.outcome.kind,
            operationId: input.operation.operationId,
            projectId: input.projectId,
            provenance: input.outcome.provenance,
            receivedOn: input.outcome.receivedOn,
            reportedByUserId: input.operation.actorUserId,
            requestSha256: input.operation.requestSha256,
            state: input.outcome.state,
            validFrom: input.outcome.validFrom,
            validTo: input.outcome.validTo,
            version,
          })
          .returning();
        if (!row) {
          fail("integrity_conflict");
        }
        const next = await bumpCase(tx, {
          caseId: current.id,
          patch: {},
          revision: current.revision,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          caseId: current.id,
          caseRevision: next.revision,
          eventType:
            input.outcome.kind === "offer"
              ? "school_admission_offer_recorded"
              : "school_admission_coe_recorded",
          operationRecordId: claim.operationRecordId,
          projectId: input.projectId,
          subjectId: row.id,
          subjectKind:
            input.outcome.kind === "offer"
              ? "school_admission_offer"
              : "school_admission_coe",
        });
        return { replayed: false, value: toOutcomeRecord(row) };
      });
    },

    async transitionOutcome(input) {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const outcomeId = randomUUID();
        const claim = await claimOperation(tx, {
          caseId: input.caseId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: outcomeId,
          resultKind: "school_admission_outcome",
        });
        if (claim.kind === "replay") {
          const [row] = await tx
            .select()
            .from(schoolAdmissionOutcome)
            .where(eq(schoolAdmissionOutcome.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toOutcomeRecord(row) };
        }
        const current = await lockCase(tx, {
          caseId: input.caseId,
          expectedRevision: input.expectedRevision,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const [previous] = await tx
          .select()
          .from(schoolAdmissionOutcome)
          .where(
            and(
              eq(schoolAdmissionOutcome.id, input.outcomeId),
              eq(schoolAdmissionOutcome.caseId, current.id),
              isNull(schoolAdmissionOutcome.supersededById)
            )
          )
          .for("update")
          .limit(1);
        if (!previous) {
          fail("outcome_not_found");
        }
        const versions = await tx
          .select({ version: schoolAdmissionOutcome.version })
          .from(schoolAdmissionOutcome)
          .where(
            and(
              eq(schoolAdmissionOutcome.caseId, current.id),
              eq(schoolAdmissionOutcome.kind, previous.kind)
            )
          );
        const version = nextVersion(
          versions.map((entry) => entry.version),
          24
        );
        /** Supersede first: the live-row partial unique index is immediate. */
        await tx
          .update(schoolAdmissionOutcome)
          .set({ supersededById: outcomeId })
          .where(eq(schoolAdmissionOutcome.id, previous.id));
        const [row] = await tx
          .insert(schoolAdmissionOutcome)
          .values({
            caseId: previous.caseId,
            decisionOn: input.decisionOn ?? previous.decisionOn,
            evidenceReferenceId: previous.evidenceReferenceId,
            evidenceReferenceSha256: previous.evidenceReferenceSha256,
            evidenceReferenceVersion: previous.evidenceReferenceVersion,
            expiresOn: previous.expiresOn,
            id: outcomeId,
            kind: previous.kind,
            operationId: input.operation.operationId,
            projectId: previous.projectId,
            provenance: previous.provenance,
            receivedOn: previous.receivedOn,
            reportedByUserId: previous.reportedByUserId,
            requestSha256: input.operation.requestSha256,
            state: input.state,
            validFrom: previous.validFrom,
            validTo: previous.validTo,
            version,
          })
          .returning();
        if (!row) {
          fail("integrity_conflict");
        }
        const next = await bumpCase(tx, {
          caseId: current.id,
          patch: {},
          revision: current.revision,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          caseId: current.id,
          caseRevision: next.revision,
          eventType:
            previous.kind === "offer"
              ? "school_admission_offer_transition"
              : "school_admission_coe_transition",
          operationRecordId: claim.operationRecordId,
          projectId: input.projectId,
          subjectId: row.id,
          subjectKind:
            previous.kind === "offer"
              ? "school_admission_offer"
              : "school_admission_coe",
        });
        return { replayed: false, value: toOutcomeRecord(row) };
      });
    },

    async recordExternalAction(input) {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const actionId = randomUUID();
        const claim = await claimOperation(tx, {
          caseId: input.caseId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: actionId,
          resultKind: "school_admission_external_action",
        });
        if (claim.kind === "replay") {
          const [row] = await tx
            .select()
            .from(schoolAdmissionExternalAction)
            .where(eq(schoolAdmissionExternalAction.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toExternalActionRecord(row) };
        }
        const current = await lockCase(tx, {
          caseId: input.caseId,
          expectedRevision: input.expectedRevision,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const [counted] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schoolAdmissionExternalAction)
          .where(eq(schoolAdmissionExternalAction.caseId, current.id));
        if ((counted?.count ?? 0) >= 40) {
          fail("limit_exceeded");
        }
        const [row] = await tx
          .insert(schoolAdmissionExternalAction)
          .values({
            acknowledged: true,
            actionKind: input.action.actionKind,
            caseId: current.id,
            id: actionId,
            note: input.action.note,
            operationId: input.operation.operationId,
            performedOn: input.action.performedOn,
            projectId: input.projectId,
            provenance: "customer_reported",
            reportedByUserId: input.operation.actorUserId,
            requestSha256: input.operation.requestSha256,
          })
          .returning();
        if (!row) {
          fail("integrity_conflict");
        }
        const next = await bumpCase(tx, {
          caseId: current.id,
          patch: {},
          revision: current.revision,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          caseId: current.id,
          caseRevision: next.revision,
          eventType: "school_admission_external_action_recorded",
          operationRecordId: claim.operationRecordId,
          projectId: input.projectId,
          subjectId: row.id,
          subjectKind: "school_admission_external_action",
        });
        return { replayed: false, value: toExternalActionRecord(row) };
      });
    },

    async recordException(input) {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const exceptionId = randomUUID();
        const claim = await claimOperation(tx, {
          caseId: input.caseId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: exceptionId,
          resultKind: "school_admission_exception",
        });
        if (claim.kind === "replay") {
          const [row] = await tx
            .select()
            .from(schoolAdmissionException)
            .where(eq(schoolAdmissionException.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toExceptionRecord(row) };
        }
        const current = await lockCase(tx, {
          caseId: input.caseId,
          expectedRevision: input.expectedRevision,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const versions = await tx
          .select({ version: schoolAdmissionException.version })
          .from(schoolAdmissionException)
          .where(eq(schoolAdmissionException.caseId, current.id));
        const version = nextVersion(
          versions.map((entry) => entry.version),
          12
        );
        const [previous] = await tx
          .select({
            id: schoolAdmissionException.id,
            reportedByUserId: schoolAdmissionException.reportedByUserId,
          })
          .from(schoolAdmissionException)
          .where(
            and(
              eq(schoolAdmissionException.caseId, current.id),
              isNull(schoolAdmissionException.supersededById)
            )
          )
          .limit(1);
        const decided =
          input.claim.state === "verified" || input.claim.state === "rejected";
        /** Supersede first: the live-row partial unique index is immediate. */
        if (previous) {
          await tx
            .update(schoolAdmissionException)
            .set({ supersededById: exceptionId })
            .where(eq(schoolAdmissionException.id, previous.id));
        }
        const [row] = await tx
          .insert(schoolAdmissionException)
          .values({
            authorityReference: input.claim.authorityReference,
            caseId: current.id,
            claimKind: input.claim.claimKind,
            decidedAt: decided ? sql`now()` : null,
            decidedByUserId: decided ? input.operation.actorUserId : null,
            description: input.claim.description,
            id: exceptionId,
            operationId: input.operation.operationId,
            projectId: input.projectId,
            reportedByUserId:
              previous?.reportedByUserId ?? input.operation.actorUserId,
            requestSha256: input.operation.requestSha256,
            state: input.claim.state,
            version,
          })
          .returning();
        if (!row) {
          fail("integrity_conflict");
        }
        const next = await bumpCase(tx, {
          caseId: current.id,
          patch: {},
          revision: current.revision,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          caseId: current.id,
          caseRevision: next.revision,
          eventType:
            input.claim.state === "verified"
              ? "school_admission_exception_verified"
              : input.claim.state === "rejected"
                ? "school_admission_exception_rejected"
                : "school_admission_exception_claimed",
          operationRecordId: claim.operationRecordId,
          projectId: input.projectId,
          subjectId: row.id,
          subjectKind: "school_admission_exception",
        });
        return { replayed: false, value: toExceptionRecord(row) };
      });
    },

    async recordManagedReadiness(input) {
      return db.transaction(async (tx) => {
        await lockProjectAuthority(tx, {
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const claim = await claimOperation(tx, {
          caseId: input.caseId,
          operation: input.operation,
          projectId: input.projectId,
          resultId: input.caseId,
          resultKind: "school_admission_case",
        });
        if (claim.kind === "replay") {
          const [row] = await tx
            .select()
            .from(schoolAdmissionCase)
            .where(eq(schoolAdmissionCase.id, claim.resultId))
            .limit(1);
          if (!row) {
            fail("integrity_conflict");
          }
          return { replayed: true, value: toCaseRecord(row) };
        }
        const current = await lockCase(tx, {
          caseId: input.caseId,
          expectedRevision: input.expectedRevision,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        });
        const next = await bumpCase(tx, {
          caseId: current.id,
          patch: {
            managedReadinessCheckedAt: input.readiness.checkedAt,
            managedReadinessReasonCodes: [...input.readiness.reasonCodes],
            managedReadinessStatus: input.readiness.status,
            managedReadinessToken: input.readiness.token || null,
          },
          revision: current.revision,
        });
        await appendEvent(tx, {
          actorUserId: input.operation.actorUserId,
          caseId: current.id,
          caseRevision: next.revision,
          eventType: "school_admission_readiness_evaluated",
          operationRecordId: claim.operationRecordId,
          projectId: input.projectId,
          subjectId: current.id,
          subjectKind: "school_admission_case",
        });
        return { replayed: false, value: next };
      });
    },
  };
}

export const postgresSchoolAdmissionsStore =
  createPostgresSchoolAdmissionsStore();

/**
 * M2 document selection for evidence attachment.
 *
 * This deliberately reuses the accepted M5.1 document rules instead of inventing
 * an access model: the asset must be `active`, the actor must be its uploader
 * (documents are private to the uploader; Project membership and staff roles do
 * not grant access), and the latest version must be scan-`clean` and
 * storage-`stored`. Only an opaque reference id, its version and the original
 * filename label are returned — never content, never a storage locator.
 */
export function createPostgresSchoolAdmissionsDocumentResolver(): SchoolAdmissionsDocumentPort {
  return {
    async list(input) {
      const [project] = await db
        .select({ id: studyJourneyProject.id })
        .from(studyJourneyProject)
        .where(eq(studyJourneyProject.id, input.projectId))
        .limit(1);
      if (!project) {
        return { status: "unavailable" };
      }
      const assets = await db
        .select({
          id: projectDocumentAsset.id,
          lifecycle: projectDocumentAsset.lifecycle,
        })
        .from(projectDocumentAsset)
        .where(
          and(
            eq(projectDocumentAsset.projectId, input.projectId),
            eq(projectDocumentAsset.createdByUserId, input.actorUserId),
            eq(projectDocumentAsset.lifecycle, "active")
          )
        )
        .orderBy(desc(projectDocumentAsset.createdAt))
        .limit(40);
      const documents: SchoolAdmissionsDocumentOption[] = [];
      for (const asset of assets) {
        const [version] = await db
          .select({
            canonicalMime: projectDocumentVersion.canonicalMime,
            securityStatus: projectDocumentVersion.securityStatus,
            storageStatus: projectDocumentVersion.storageStatus,
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
          // A pending or failed scan is never offered as attachable evidence.
          continue;
        }
        documents.push({
          // Neutral, non-content label: version, MIME class and a short opaque
          // suffix. No filename, no storage key, no extracted text.
          label: `Document ${version.versionNumber} · ${version.canonicalMime} · ${asset.id.slice(0, 8)}`,
          referenceId: asset.id,
          version: version.versionNumber,
        });
      }
      return { documents, status: "listed" };
    },
  };
}

export const postgresSchoolAdmissionsDocumentResolver =
  createPostgresSchoolAdmissionsDocumentResolver();
