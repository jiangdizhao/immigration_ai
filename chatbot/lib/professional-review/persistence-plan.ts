import type { ProfessionalReviewRecord } from "./policy";

/**
 * Pure persistence decision procedure shared by the durable adapter.
 *
 * The database adapter reads the current head (locked) and the operation row, then
 * asks this module what to do. Keeping the decision pure means the concurrency and
 * idempotency contract is testable without a database, while PostgreSQL still owns
 * the actual guarantee (row lock, unique indexes, append-only trigger).
 */
export type ProfessionalReviewPersistedHead = {
  projectId: string;
  revision: number;
  state: string;
  targetBindingSha256: string;
};

export type ProfessionalReviewCreatePlan =
  | { kind: "insert" }
  | { kind: "replay"; reviewRequestId: string }
  | { kind: "conflict"; reason: "idempotency_conflict" };

export type ProfessionalReviewAppendPlan =
  | { kind: "insert"; revision: number }
  | { kind: "replay"; revision: number }
  | { kind: "not_found" }
  | {
      kind: "conflict";
      reason:
        | "idempotency_conflict"
        | "revision_conflict"
        | "integrity_conflict";
    };

export function planProfessionalReviewCreate(input: {
  existingOperation: {
    reviewRequestId: string;
    requestSha256: string;
  } | null;
  requestSha256: string;
}): ProfessionalReviewCreatePlan {
  if (!input.existingOperation) {
    return { kind: "insert" };
  }
  if (input.existingOperation.requestSha256 !== input.requestSha256) {
    return { kind: "conflict", reason: "idempotency_conflict" };
  }
  return {
    kind: "replay",
    reviewRequestId: input.existingOperation.reviewRequestId,
  };
}

export function planProfessionalReviewAppend(input: {
  current: ProfessionalReviewPersistedHead | null;
  expectedRevision: number;
  operation: { requestSha256: string; revision: number } | null;
  record: ProfessionalReviewRecord;
  requestSha256: string;
}): ProfessionalReviewAppendPlan {
  const { current } = input;
  if (!current || current.projectId !== input.record.projectId) {
    // A review of another Project is indistinguishable from an absent one.
    return { kind: "not_found" };
  }
  if (current.targetBindingSha256 !== input.record.targetBindingSha256) {
    return { kind: "conflict", reason: "integrity_conflict" };
  }
  if (input.operation) {
    if (input.operation.requestSha256 !== input.requestSha256) {
      return { kind: "conflict", reason: "idempotency_conflict" };
    }
    return { kind: "replay", revision: input.operation.revision };
  }
  if (current.revision !== input.expectedRevision) {
    return { kind: "conflict", reason: "revision_conflict" };
  }
  return { kind: "insert", revision: current.revision + 1 };
}
