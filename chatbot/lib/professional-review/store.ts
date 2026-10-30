// biome-ignore-all lint/suspicious/useAwait: this adapter implements an asynchronous persistence port; the in-memory
// implementation has no I/O to await, while a future database adapter will.
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import { ProfessionalReviewError } from "./errors";
import type { ProfessionalReviewRecord } from "./policy";

/**
 * M4-006 persistence port.
 *
 * The contract is deliberately small and append-only:
 *
 * - `create` inserts revision 1 for a new review request.
 * - `append` inserts revision N+1 only when the caller proves it observed
 *   revision N (compare-and-set), so two concurrent decisions cannot both win.
 * - every write carries an `operationId`, enforced as an idempotency key: an
 *   exact replay returns the stored record, a changed request conflicts.
 *
 * No approved PostgreSQL schema exists for M4-006 yet (adding one requires a
 * separately authorized migration round), so this round ships the port plus a
 * deterministic in-memory implementation used for offline validation. The port is
 * the seam a later database adapter must implement without changing semantics.
 */
export type ProfessionalReviewStore = {
  readonly appendOnly: true;
  readonly kind: "in_memory" | "postgres";
  load(reviewRequestId: string): Promise<ProfessionalReviewRecord | null>;
  findCurrent(input: {
    projectId: string;
    targetId: string;
    targetKind: ManagedTargetKind;
  }): Promise<ProfessionalReviewRecord | null>;
  findOperation(operationId: string): Promise<ProfessionalReviewRecord | null>;
  listHistory(reviewRequestId: string): Promise<ProfessionalReviewRecord[]>;
  create(record: ProfessionalReviewRecord): Promise<{
    record: ProfessionalReviewRecord;
    replayed: boolean;
  }>;
  append(input: {
    expectedRevision: number;
    record: ProfessionalReviewRecord;
  }): Promise<{ record: ProfessionalReviewRecord; replayed: boolean }>;
};

function immutable(record: ProfessionalReviewRecord): ProfessionalReviewRecord {
  return Object.freeze({
    ...record,
    reviewScope: Object.freeze([...record.reviewScope]),
    target: Object.freeze({ ...record.target }),
    decision: record.decision ? Object.freeze({ ...record.decision }) : null,
  }) as ProfessionalReviewRecord;
}

export function createInMemoryProfessionalReviewStore(): ProfessionalReviewStore {
  const history = new Map<string, ProfessionalReviewRecord[]>();
  const operations = new Map<string, string>();

  const current = (reviewRequestId: string) =>
    history.get(reviewRequestId)?.at(-1) ?? null;

  return {
    appendOnly: true,
    kind: "in_memory",
    async load(reviewRequestId) {
      return current(reviewRequestId);
    },
    async findCurrent({ projectId, targetId, targetKind }) {
      let latest: ProfessionalReviewRecord | null = null;
      for (const records of history.values()) {
        const record = records.at(-1);
        if (
          record &&
          record.projectId === projectId &&
          record.target.targetId === targetId &&
          record.target.targetKind === targetKind &&
          (!latest || record.revision > latest.revision)
        ) {
          latest = record;
        }
      }
      return latest;
    },
    async findOperation(operationId) {
      for (const records of history.values()) {
        const match = records.find(
          (record) => record.operationId === operationId
        );
        if (match) {
          return match;
        }
      }
      return null;
    },
    async listHistory(reviewRequestId) {
      return [...(history.get(reviewRequestId) ?? [])];
    },
    async create(record) {
      const existingOperation = operations.get(record.operationId);
      const stored = immutable(record);
      if (existingOperation !== undefined) {
        for (const records of history.values()) {
          const match = records.find(
            (entry) => entry.operationId === record.operationId
          );
          if (match) {
            if (match.requestSha256 !== record.requestSha256) {
              throw new ProfessionalReviewError("idempotency_conflict");
            }
            return { record: match, replayed: true };
          }
        }
        throw new ProfessionalReviewError("idempotency_conflict");
      }
      if (current(record.reviewRequestId)) {
        throw new ProfessionalReviewError("revision_conflict");
      }
      operations.set(record.operationId, record.reviewRequestId);
      history.set(record.reviewRequestId, [stored]);
      return { record: stored, replayed: false };
    },
    async append({ expectedRevision, record }) {
      const existing = current(record.reviewRequestId);
      if (!existing) {
        throw new ProfessionalReviewError("not_found");
      }
      const replay = (history.get(record.reviewRequestId) ?? []).find(
        (entry) => entry.operationId === record.operationId
      );
      if (replay) {
        if (replay.requestSha256 !== record.requestSha256) {
          throw new ProfessionalReviewError("idempotency_conflict");
        }
        return { record: replay, replayed: true };
      }
      if (existing.revision !== expectedRevision) {
        throw new ProfessionalReviewError("revision_conflict");
      }
      const stored = immutable({ ...record, revision: existing.revision + 1 });
      operations.set(stored.operationId, stored.reviewRequestId);
      history.set(stored.reviewRequestId, [
        ...(history.get(stored.reviewRequestId) ?? []),
        stored,
      ]);
      return { record: stored, replayed: false };
    },
  };
}
