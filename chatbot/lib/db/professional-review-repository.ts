// biome-ignore-all lint/suspicious/useAwait: this adapter implements an asynchronous persistence port; every write path is
// awaited inside its transaction, while the read helpers are already synchronously
// resolved by drizzle.
import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import { ProfessionalReviewError } from "@/lib/professional-review/errors";
import {
  planProfessionalReviewAppend,
  planProfessionalReviewCreate,
} from "@/lib/professional-review/persistence-plan";
import type {
  ProfessionalReviewRecord,
  ProfessionalReviewScope,
  ProfessionalReviewState,
} from "@/lib/professional-review/policy";
import type { ProfessionalReviewStore } from "@/lib/professional-review/store";
import { getLazyDatabase } from "./runtime-client";
import {
  type ProfessionalReviewRequestRow,
  type ProfessionalReviewRevisionRow,
  professionalReviewRequest,
  professionalReviewRevision,
} from "./schema";

type Database = ReturnType<typeof getLazyDatabase>;
type Executor = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Both the pool and an open transaction can run the read helper. */
type QueryRunner = Executor | Database;

const db = getLazyDatabase();

/**
 * Phase 13 M4-006 durable store.
 *
 * Implements the existing `ProfessionalReviewStore` port with PostgreSQL, so the
 * review service, the evaluator and every offline test keep working unchanged.
 *
 * Invariants are owned by the database, not by an in-process mutex:
 *
 * - `SELECT … FOR UPDATE` on the request row serialises concurrent decisions;
 * - `unique (projectId, operationId)` and `unique (reviewRequestId, operationId)`
 *   make exact replay a lookup and a changed request a conflict;
 * - `unique (reviewRequestId, revision)` prevents two writers claiming one revision;
 * - the append-only trigger rejects UPDATE/DELETE on the history table;
 * - the projection trigger rejects revision skips and target rebinding.
 *
 * Every write happens in one transaction, so a partial failure leaves no revision
 * row without its request projection (and vice versa).
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

function isConstraintViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23514" || code === "23503" || code === "23502";
}

function toScope(value: readonly string[]): readonly ProfessionalReviewScope[] {
  return [...value] as readonly ProfessionalReviewScope[];
}

function toRecord(
  request: ProfessionalReviewRequestRow,
  revision: ProfessionalReviewRevisionRow | null
): ProfessionalReviewRecord {
  return {
    decision:
      revision && revision.action !== "create_request"
        ? {
            action: revision.action as NonNullable<
              ProfessionalReviewRecord["decision"]
            >["action"],
            authorityCode: revision.authorityCode ?? "",
            boundTargetSha256: revision.boundTargetSha256,
            boundTargetVersion: revision.boundTargetVersion,
            commentSha256: revision.commentSha256,
            credentialCode: revision.credentialCode,
            decidedAt: revision.decidedAt.toISOString(),
            decidedByUserId:
              revision.decidedByUserId ?? request.requestedByUserId,
            reasonCode: revision.reasonCode,
            revision: revision.revision,
          }
        : null,
    operationId: request.operationId,
    projectId: request.projectId,
    requestSha256: request.requestSha256,
    requestedAt: request.requestedAt.toISOString(),
    requestedByUserId: request.requestedByUserId,
    reviewPurpose:
      request.reviewPurpose as ProfessionalReviewRecord["reviewPurpose"],
    reviewRequestId: request.id,
    reviewScope: toScope(request.reviewScope),
    reviewerUserId: request.reviewerUserId,
    revision: request.revision,
    state: request.state as ProfessionalReviewState,
    target: {
      projectId: request.projectId,
      targetId: request.targetId,
      targetKind:
        request.targetKind as ProfessionalReviewRecord["target"]["targetKind"],
      targetSha256: request.targetSha256,
      targetVersion: request.targetVersion,
    },
    targetBindingSha256: request.targetBindingSha256,
  };
}

function toHistoryRecord(
  request: ProfessionalReviewRequestRow,
  revision: ProfessionalReviewRevisionRow
): ProfessionalReviewRecord {
  return toRecord(
    {
      ...request,
      revision: revision.revision,
      state: revision.state as ProfessionalReviewRequestRow["state"],
    },
    revision
  );
}

async function loadWithExecutor(
  tx: QueryRunner,
  reviewRequestId: string
): Promise<ProfessionalReviewRecord | null> {
  const [request] = await tx
    .select()
    .from(professionalReviewRequest)
    .where(eq(professionalReviewRequest.id, reviewRequestId))
    .limit(1);
  if (!request) {
    return null;
  }
  const [revision] = await tx
    .select()
    .from(professionalReviewRevision)
    .where(
      and(
        eq(professionalReviewRevision.reviewRequestId, request.id),
        eq(professionalReviewRevision.revision, request.revision)
      )
    )
    .limit(1);
  return toRecord(request, revision ?? null);
}

/**
 * Read the current review for a target through a caller-supplied executor.
 *
 * Exported so a composite read model (M4-007) can read the persisted review inside
 * its own transaction instead of taking a second connection from the pool, which
 * would break snapshot consistency.
 */
export async function loadCurrentProfessionalReviewForTarget(
  runner: QueryRunner,
  input: { projectId: string; targetId: string; targetKind: ManagedTargetKind }
): Promise<ProfessionalReviewRecord | null> {
  // A `PgTransaction` and the pool are both PgDatabase implementations with an
  // identical `select()`; the union only exists so callers can pass either one.
  const query = runner as unknown as Database;
  const [request] = await query
    .select()
    .from(professionalReviewRequest)
    .where(
      and(
        eq(professionalReviewRequest.projectId, input.projectId),
        eq(professionalReviewRequest.targetKind, input.targetKind),
        eq(professionalReviewRequest.targetId, input.targetId)
      )
    )
    .orderBy(
      desc(professionalReviewRequest.revision),
      desc(professionalReviewRequest.updatedAt),
      desc(professionalReviewRequest.id)
    )
    .limit(1);
  if (!request) {
    return null;
  }
  const [revision] = await query
    .select()
    .from(professionalReviewRevision)
    .where(
      and(
        eq(professionalReviewRevision.reviewRequestId, request.id),
        eq(professionalReviewRevision.revision, request.revision)
      )
    )
    .limit(1);
  return toRecord(request, revision ?? null);
}

export function createPostgresProfessionalReviewStore(
  options: { database?: Database } = {}
): ProfessionalReviewStore {
  const database = options.database ?? db;

  return {
    appendOnly: true,
    kind: "postgres",

    async load(reviewRequestId) {
      return loadWithExecutor(database, reviewRequestId);
    },

    async findCurrent({ projectId, targetId, targetKind }) {
      return loadCurrentProfessionalReviewForTarget(database, {
        projectId,
        targetId,
        targetKind,
      });
    },

    async findOperation(operationId) {
      const [revision] = await database
        .select()
        .from(professionalReviewRevision)
        .where(eq(professionalReviewRevision.operationId, operationId))
        .orderBy(
          desc(professionalReviewRevision.decidedAt),
          desc(professionalReviewRevision.id)
        )
        .limit(1);
      if (!revision) {
        return null;
      }
      const [request] = await database
        .select()
        .from(professionalReviewRequest)
        .where(eq(professionalReviewRequest.id, revision.reviewRequestId))
        .limit(1);
      if (!request) {
        return null;
      }
      return toHistoryRecord(request, revision);
    },

    async listHistory(reviewRequestId) {
      const [request] = await database
        .select()
        .from(professionalReviewRequest)
        .where(eq(professionalReviewRequest.id, reviewRequestId))
        .limit(1);
      if (!request) {
        return [];
      }
      const revisions = await database
        .select()
        .from(professionalReviewRevision)
        .where(eq(professionalReviewRevision.reviewRequestId, reviewRequestId))
        .orderBy(asc(professionalReviewRevision.revision));
      return revisions.map((revision) => toHistoryRecord(request, revision));
    },

    async create(record) {
      try {
        return await database.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(professionalReviewRequest)
            .where(
              and(
                eq(professionalReviewRequest.projectId, record.projectId),
                eq(professionalReviewRequest.operationId, record.operationId)
              )
            )
            .limit(1);
          const plan = planProfessionalReviewCreate({
            existingOperation: existing
              ? {
                  requestSha256: existing.requestSha256,
                  reviewRequestId: existing.id,
                }
              : null,
            requestSha256: record.requestSha256,
          });
          if (plan.kind === "conflict") {
            throw new ProfessionalReviewError(plan.reason);
          }
          if (plan.kind === "replay") {
            const replay = await loadWithExecutor(tx, plan.reviewRequestId);
            if (!replay) {
              throw new ProfessionalReviewError("integrity_conflict");
            }
            return { record: replay, replayed: true };
          }
          const [inserted] = await tx
            .insert(professionalReviewRequest)
            .values({
              id: record.reviewRequestId,
              operationId: record.operationId,
              projectId: record.projectId,
              requestSha256: record.requestSha256,
              requestedAt: new Date(record.requestedAt),
              requestedByUserId: record.requestedByUserId,
              reviewPurpose: record.reviewPurpose,
              reviewScope: [...record.reviewScope],
              revision: 1,
              state: "requested",
              targetBindingSha256: record.targetBindingSha256,
              targetId: record.target.targetId,
              targetKind: record.target.targetKind,
              targetSha256: record.target.targetSha256,
              targetVersion: record.target.targetVersion,
              updatedAt: new Date(record.requestedAt),
            })
            .returning();
          if (!inserted) {
            throw new ProfessionalReviewError("integrity_conflict");
          }
          const [createdRevision] = await tx
            .insert(professionalReviewRevision)
            .values({
              action: "create_request",
              authorityCode: null,
              boundTargetSha256: record.target.targetSha256,
              boundTargetVersion: record.target.targetVersion,
              commentSha256: null,
              credentialCode: null,
              decidedAt: new Date(record.requestedAt),
              decidedByUserId: record.requestedByUserId,
              operationId: record.operationId,
              reasonCode: null,
              requestSha256: record.requestSha256,
              reviewRequestId: inserted.id,
              revision: 1,
              state: "requested",
            })
            .returning();
          return {
            record: toRecord(inserted, createdRevision ?? null),
            replayed: false,
          };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ProfessionalReviewError("idempotency_conflict");
        }
        if (
          isConstraintViolation(error) &&
          !(error instanceof ProfessionalReviewError)
        ) {
          throw new ProfessionalReviewError("integrity_conflict");
        }
        throw error;
      }
    },

    async append({ expectedRevision, record }) {
      const decision = record.decision;
      if (!decision) {
        throw new ProfessionalReviewError("invalid_request");
      }
      try {
        return await database.transaction(async (tx) => {
          const [head] = await tx
            .select()
            .from(professionalReviewRequest)
            .where(eq(professionalReviewRequest.id, record.reviewRequestId))
            .for("update")
            .limit(1);
          const [operation] = head
            ? await tx
                .select()
                .from(professionalReviewRevision)
                .where(
                  and(
                    eq(
                      professionalReviewRevision.reviewRequestId,
                      record.reviewRequestId
                    ),
                    eq(
                      professionalReviewRevision.operationId,
                      record.operationId
                    )
                  )
                )
                .limit(1)
            : [];
          const plan = planProfessionalReviewAppend({
            current: head
              ? {
                  projectId: head.projectId,
                  revision: head.revision,
                  state: head.state,
                  targetBindingSha256: head.targetBindingSha256,
                }
              : null,
            expectedRevision,
            operation: operation
              ? {
                  requestSha256: operation.requestSha256,
                  revision: operation.revision,
                }
              : null,
            record,
            requestSha256: record.requestSha256,
          });
          if (plan.kind === "not_found") {
            throw new ProfessionalReviewError("not_found");
          }
          if (plan.kind === "conflict") {
            throw new ProfessionalReviewError(plan.reason);
          }
          if (plan.kind === "replay") {
            const replay = await loadWithExecutor(tx, record.reviewRequestId);
            if (!replay) {
              throw new ProfessionalReviewError("integrity_conflict");
            }
            return { record: replay, replayed: true };
          }
          const [inserted] = await tx
            .insert(professionalReviewRevision)
            .values({
              action: decision.action,
              authorityCode: decision.authorityCode,
              boundTargetSha256: decision.boundTargetSha256,
              boundTargetVersion: decision.boundTargetVersion,
              commentSha256: decision.commentSha256,
              credentialCode: decision.credentialCode,
              decidedAt: new Date(decision.decidedAt),
              decidedByUserId: decision.decidedByUserId,
              operationId: record.operationId,
              reasonCode: decision.reasonCode,
              requestSha256: record.requestSha256,
              reviewRequestId: record.reviewRequestId,
              revision: plan.revision,
              state: record.state,
            })
            .returning();
          if (!inserted) {
            throw new ProfessionalReviewError("integrity_conflict");
          }
          const [updated] = await tx
            .update(professionalReviewRequest)
            .set({
              authorityCode: decision.authorityCode,
              credentialCode: decision.credentialCode,
              invalidationReasonCode:
                record.state === "invalidated" ? decision.reasonCode : null,
              invalidatedAt:
                record.state === "invalidated"
                  ? new Date(decision.decidedAt)
                  : null,
              operationId: record.operationId,
              requestSha256: record.requestSha256,
              reviewerUserId: record.reviewerUserId,
              revision: plan.revision,
              state: record.state,
              updatedAt: new Date(decision.decidedAt),
            })
            .where(
              and(
                eq(professionalReviewRequest.id, record.reviewRequestId),
                eq(professionalReviewRequest.revision, expectedRevision)
              )
            )
            .returning();
          if (!updated) {
            // The row moved between the lock and the update: never serve stale state.
            throw new ProfessionalReviewError("revision_conflict");
          }
          return {
            record: toRecord(updated, inserted),
            replayed: false,
          };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ProfessionalReviewError("revision_conflict");
        }
        if (
          isConstraintViolation(error) &&
          !(error instanceof ProfessionalReviewError)
        ) {
          throw new ProfessionalReviewError("integrity_conflict");
        }
        throw error;
      }
    },
  };
}
