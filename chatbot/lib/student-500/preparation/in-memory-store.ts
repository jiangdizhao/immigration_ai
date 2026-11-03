import { randomUUID } from "node:crypto";
import {
  STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS,
  STUDENT_500_PREPARATION_MAX_FACT_REFERENCES,
  STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS,
  Student500PreparationError,
} from "./contracts";
import type {
  NewGsDraftValues,
  Student500FactReferenceRecord,
  Student500GsDraftRecord,
  Student500PreparationOperationLookup,
  Student500PreparationOperationStamp,
  Student500PreparationSnapshotRecord,
  Student500PreparationStore,
  Student500PreparationWriteResult,
  Student500SchoolContextRecord,
} from "./ports";

/**
 * Deterministic in-memory mirror of the Phase 13 M6.2 preparation store.
 *
 * It reproduces the invariants the SQL adapter enforces (operation identity,
 * write order, version monotonicity, optimistic concurrency, bounded counts) so an
 * offline suite can prove service behaviour without a database. It is never used
 * by the runtime wiring.
 */
export type InMemoryPreparationStore = Student500PreparationStore & {
  /** Test-only: forces the next insert to fail as if the DB had rejected it. */
  failNextWriteWith(error: Error): void;
  readonly writes: readonly string[];
};

export function createInMemoryPreparationStore(): InMemoryPreparationStore {
  const operations = new Map<
    string,
    {
      operationType: string;
      requestSha256: string;
      resultId: string;
      resultKind: string;
    }
  >();
  const references = new Map<string, Student500FactReferenceRecord>();
  const schoolContexts = new Map<string, Student500SchoolContextRecord>();
  const drafts = new Map<string, Student500GsDraftRecord>();
  const snapshots = new Map<string, Student500PreparationSnapshotRecord>();
  const writes: string[] = [];
  let injectedFailure: Error | null = null;

  function guard() {
    if (injectedFailure) {
      const error = injectedFailure;
      injectedFailure = null;
      throw error;
    }
  }

  function operationKey(stamp: { actorUserId: string; operationId: string }) {
    return `${stamp.actorUserId}:${stamp.operationId}`;
  }

  function recordOperation(
    stamp: Student500PreparationOperationStamp,
    resultId: string
  ): void {
    const key = operationKey(stamp);
    const existing = operations.get(key);
    if (existing) {
      if (
        existing.requestSha256 !== stamp.requestSha256 ||
        existing.operationType !== stamp.operationType
      ) {
        throw new Student500PreparationError("idempotency_conflict");
      }
      return;
    }
    operations.set(key, {
      operationType: stamp.operationType,
      requestSha256: stamp.requestSha256,
      resultId,
      resultKind: stamp.resultKind,
    });
  }

  function draftsFor(applicationId: string) {
    return [...drafts.values()]
      .filter((draft) => draft.applicationId === applicationId)
      .sort((left, right) => left.version - right.version);
  }

  function snapshotsFor(applicationId: string) {
    return [...snapshots.values()]
      .filter((row) => row.applicationId === applicationId)
      .sort((left, right) => left.version - right.version);
  }

  return {
    failNextWriteWith(error: Error) {
      injectedFailure = error;
    },

    get writes() {
      return writes;
    },

    findOperation(stamp): Promise<Student500PreparationOperationLookup> {
      const existing = operations.get(operationKey(stamp));
      if (!existing) {
        return Promise.resolve({ status: "absent" });
      }
      if (
        existing.operationType !== stamp.operationType ||
        existing.requestSha256 !== stamp.requestSha256 ||
        existing.resultKind !== stamp.resultKind
      ) {
        return Promise.resolve({ status: "conflict" });
      }
      return Promise.resolve({
        resultId: existing.resultId,
        resultKind: stamp.resultKind,
        status: "replay",
      });
    },

    listFactReferences(input) {
      return Promise.resolve(
        [...references.values()]
          .filter((row) => row.applicationId === input.applicationId)
          .sort((left, right) =>
            left.createdAt.getTime() === right.createdAt.getTime()
              ? left.id.localeCompare(right.id)
              : left.createdAt.getTime() - right.createdAt.getTime()
          )
      );
    },

    insertFactReference(
      input
    ): Promise<
      Student500PreparationWriteResult<Student500FactReferenceRecord>
    > {
      guard();
      // Only an *active* reference blocks re-selection; revoked rows are immutable
      // history and may be followed by a fresh active reference.
      const duplicate = [...references.values()].find(
        (row) =>
          row.applicationId === input.applicationId &&
          row.factAssertionId === input.factAssertionId &&
          row.factVersion === input.factVersion &&
          row.revokedAt === null
      );
      if (duplicate) {
        throw new Student500PreparationError("integrity_conflict");
      }
      if (
        [...references.values()].filter(
          (row) =>
            row.applicationId === input.applicationId && row.revokedAt === null
        ).length >= STUDENT_500_PREPARATION_MAX_FACT_REFERENCES
      ) {
        throw new Student500PreparationError("limit_exceeded");
      }
      const record: Student500FactReferenceRecord = {
        aiUseAuthorizedAtSelection: input.aiUseAuthorizedAtSelection,
        applicationId: input.applicationId,
        authorizationActorUserId: input.authorizationActorUserId,
        authorizationAudience: input.authorizationAudience,
        createdAt: new Date(),
        createdByUserId: input.createdByUserId,
        factAssertionId: input.factAssertionId,
        factKey: input.factKey,
        factVersion: input.factVersion,
        id: randomUUID(),
        originKind: input.originKind,
        projectId: input.projectId,
        revokedAt: null,
        sourceEvidenceRef: input.sourceEvidenceRef,
        stateAtUse: input.stateAtUse,
      };
      // Entity first, then the operation row that references it (FK-safe order).
      references.set(record.id, record);
      recordOperation(input.operation, record.id);
      writes.push("fact_reference");
      return Promise.resolve({ replayed: false, value: record });
    },

    revokeFactReference(
      input
    ): Promise<
      Student500PreparationWriteResult<Student500FactReferenceRecord>
    > {
      guard();
      const existing = references.get(input.factReferenceId);
      if (
        !(existing && existing.applicationId === input.applicationId) ||
        existing.projectId !== input.projectId
      ) {
        throw new Student500PreparationError("integrity_conflict");
      }
      if (existing.revokedAt !== null) {
        throw new Student500PreparationError("state_conflict");
      }
      const revoked: Student500FactReferenceRecord = {
        ...existing,
        revokedAt: new Date(),
      };
      references.set(revoked.id, revoked);
      recordOperation(input.operation, revoked.id);
      writes.push("fact_reference_revoked");
      return Promise.resolve({ replayed: false, value: revoked });
    },

    getSchoolContext(input) {
      return Promise.resolve(schoolContexts.get(input.applicationId) ?? null);
    },

    putSchoolContext(
      input
    ): Promise<
      Student500PreparationWriteResult<Student500SchoolContextRecord>
    > {
      guard();
      const existing = schoolContexts.get(input.applicationId);
      if (existing && input.expectedRevision === null) {
        throw new Student500PreparationError("revision_conflict");
      }
      if (!existing && input.expectedRevision !== null) {
        throw new Student500PreparationError("revision_conflict");
      }
      if (existing && existing.revision !== input.expectedRevision) {
        throw new Student500PreparationError("revision_conflict");
      }
      const now = new Date();
      const record: Student500SchoolContextRecord = {
        admissionCaseId: input.values.admissionCaseId,
        admissionOutcomeKind: input.values.admissionOutcomeKind,
        admissionOutcomeProvenance: input.values.admissionOutcomeProvenance,
        admissionOutcomeVerified: input.values.admissionOutcomeVerified,
        admissionOutcomeVersion: input.values.admissionOutcomeVersion,
        applicationId: input.applicationId,
        createdAt: existing?.createdAt ?? now,
        id: existing?.id ?? randomUUID(),
        kind: input.values.kind,
        projectId: input.projectId,
        revision: (existing?.revision ?? 0) + 1,
        schoolApplicationId: input.values.schoolApplicationId,
        studyEvidenceKind: input.values.studyEvidenceKind,
        updatedAt: now,
        updatedByUserId: input.actorUserId,
      };
      schoolContexts.set(input.applicationId, record);
      recordOperation(input.operation, record.id);
      writes.push("school_context");
      return Promise.resolve({ replayed: false, value: record });
    },

    listDrafts(input) {
      return Promise.resolve(draftsFor(input.applicationId));
    },

    getDraft(input) {
      const draft = drafts.get(input.draftId);
      if (
        !draft ||
        draft.applicationId !== input.applicationId ||
        draft.projectId !== input.projectId
      ) {
        return Promise.resolve(null);
      }
      return Promise.resolve(draft);
    },

    insertDraft(
      input
    ): Promise<Student500PreparationWriteResult<Student500GsDraftRecord>> {
      guard();
      const current = draftsFor(input.applicationId);
      if (current.length >= STUDENT_500_PREPARATION_MAX_DRAFT_VERSIONS) {
        throw new Student500PreparationError("limit_exceeded");
      }
      const nextVersion = (current.at(-1)?.version ?? 0) + 1;
      if (
        input.values.expectedPreviousVersion !== null &&
        input.values.expectedPreviousVersion !== nextVersion - 1
      ) {
        // Optimistic concurrency: the edit was based on a superseded version.
        throw new Student500PreparationError("version_conflict");
      }
      const record: Student500GsDraftRecord = {
        applicationId: input.applicationId,
        contentSha256: input.values.contentSha256,
        createdAt: new Date(),
        createdByUserId: input.actorUserId,
        id: randomUUID(),
        inputDigest: input.values.inputDigest,
        origin: input.values.origin,
        projectId: input.projectId,
        sectionCount: input.values.sections.length,
        sections: input.values.sections,
        sourceFactReferenceIds: input.values.sourceFactReferenceIds,
        supersedesDraftId: input.values.supersedesDraftId,
        version: nextVersion,
      } satisfies Student500GsDraftRecord & { sectionCount: number };
      drafts.set(record.id, record);
      recordOperation(input.operation, record.id);
      writes.push("draft");
      return Promise.resolve({ replayed: false, value: record });
    },

    listSnapshots(input) {
      return Promise.resolve(snapshotsFor(input.applicationId));
    },

    getSnapshot(input) {
      const snapshot = snapshots.get(input.snapshotId);
      if (
        !snapshot ||
        snapshot.applicationId !== input.applicationId ||
        snapshot.projectId !== input.projectId
      ) {
        return Promise.resolve(null);
      }
      return Promise.resolve(snapshot);
    },

    insertSnapshot(
      input
    ): Promise<
      Student500PreparationWriteResult<Student500PreparationSnapshotRecord>
    > {
      guard();
      const current = snapshotsFor(input.applicationId);
      if (current.length >= STUDENT_500_PREPARATION_MAX_SNAPSHOT_VERSIONS) {
        throw new Student500PreparationError("limit_exceeded");
      }
      const record: Student500PreparationSnapshotRecord = {
        applicationId: input.applicationId,
        applicationRevision: input.values.applicationRevision,
        content: input.values.content,
        contentSha256: input.values.contentSha256,
        createdAt: new Date(),
        createdByUserId: input.actorUserId,
        gsDraftId: input.values.gsDraftId,
        id: randomUUID(),
        inputDigest: input.values.inputDigest,
        projectId: input.projectId,
        version: (current.at(-1)?.version ?? 0) + 1,
      };
      snapshots.set(record.id, record);
      recordOperation(input.operation, record.id);
      writes.push("snapshot");
      return Promise.resolve({ replayed: false, value: record });
    },

    countFactReferences(input) {
      return Promise.resolve(
        [...references.values()].filter(
          (row) =>
            row.applicationId === input.applicationId && row.revokedAt === null
        ).length
      );
    },

    countDrafts(input) {
      return Promise.resolve(draftsFor(input.applicationId).length);
    },

    countSnapshots(input) {
      return Promise.resolve(snapshotsFor(input.applicationId).length);
    },
  };
}

export type { NewGsDraftValues };
