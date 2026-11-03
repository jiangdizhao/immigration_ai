// biome-ignore-all lint/suspicious/useAwait: this test-only store implements an
// asynchronous persistence port; the read helpers resolve synchronously so the
// domain service can be awaited without a database.
import { randomUUID } from "node:crypto";
import {
  STUDENT_500_MAX_APPLICATIONS_PER_PROJECT,
  Student500Error,
  type Student500OperationType,
} from "./contracts";
import type {
  Student500ActorContext,
  Student500ApplicationRecord,
  Student500ApplicationStore,
  Student500EventRecord,
  Student500MembershipStatus,
  Student500OperationStamp,
  Student500WriteResult,
} from "./ports";

/**
 * Deterministic in-memory Student 500 store.
 *
 * It exists so authorization boundaries, idempotency, CAS, archive terminality and
 * the per-Project bound are executable without PostgreSQL. It mirrors the SQL
 * adapter's invariants:
 *   - every mutation is serialized,
 *   - every mutation is copy-on-write, so a rejected request leaves no partial
 *     state,
 *   - operations are unique per (actor, operationId) with a request digest,
 *   - the actor's Project authority is re-derived inside the mutation.
 */

export type InMemoryStudent500ProjectSeed = {
  readonly ownerUserId: string;
  readonly status: "active" | "closed";
};

export type InMemoryStudent500ActorSeed = {
  readonly registeredCustomer: boolean;
  readonly staff?: boolean;
  readonly memberships?: Readonly<
    Record<string, "active" | "pending" | "revoked">
  >;
};

export type InMemoryStudent500Store = Student500ApplicationStore & {
  seedProject(projectId: string, project: InMemoryStudent500ProjectSeed): void;
  seedActor(userId: string, actor: InMemoryStudent500ActorSeed): void;
  /** Simulates a concurrent Project closure committing outside the write. */
  setProjectStatus(projectId: string, status: "active" | "closed"): void;
  /** Simulates a concurrent membership revocation. */
  setMembership(
    projectId: string,
    userId: string,
    status: "active" | "pending" | "revoked"
  ): void;
  /** Applies any queued state change before the next store call. */
  tick(): Promise<void>;
  readonly writes: readonly {
    readonly operationType: Student500OperationType;
    readonly applicationId: string;
  }[];
};

export function createInMemoryStudent500Store(): InMemoryStudent500Store {
  const projects = new Map<string, InMemoryStudent500ProjectSeed>();
  const actors = new Map<string, InMemoryStudent500ActorSeed>();
  const applications = new Map<string, Student500ApplicationRecord>();
  const events = new Map<string, Student500EventRecord[]>();
  const operations = new Map<
    string,
    {
      readonly operationType: Student500OperationType;
      readonly requestSha256: string;
      readonly resultId: string;
    }
  >();
  const writes: {
    operationType: Student500OperationType;
    applicationId: string;
  }[] = [];

  function membershipStatus(
    projectId: string,
    actorUserId: string
  ): Student500MembershipStatus {
    const project = projects.get(projectId);
    if (!project) {
      return "missing";
    }
    if (project.ownerUserId === actorUserId) {
      return "owner";
    }
    const status = actors.get(actorUserId)?.memberships?.[projectId];
    if (status === "active") {
      return "active_member";
    }
    if (status === "pending") {
      return "pending";
    }
    if (status === "revoked") {
      return "revoked";
    }
    return "missing";
  }

  function requireAuthority(projectId: string, actorUserId: string) {
    const actor = actors.get(actorUserId);
    if (!actor || !actor.registeredCustomer || actor.staff) {
      throw new Student500Error("actor_not_eligible");
    }
    const project = projects.get(projectId);
    if (!project) {
      throw new Student500Error("project_not_found");
    }
    const status = membershipStatus(projectId, actorUserId);
    if (status !== "owner" && status !== "active_member") {
      throw new Student500Error("project_forbidden");
    }
    if (project.status !== "active") {
      throw new Student500Error("project_closed");
    }
  }

  /**
   * Read-only operation lookup, mirroring the SQL adapter: an exact retry is
   * resolved from the *persisted* result id before anything is written, and a
   * materially different request under the same operation id is a conflict.
   */
  function readOperation(
    operation: Student500OperationStamp
  ):
    | { status: "absent" }
    | { status: "conflict" }
    | { status: "replay"; resultId: string } {
    const existing = operations.get(
      `${operation.actorUserId}:${operation.operationId}`
    );
    if (!existing) {
      return { status: "absent" };
    }
    if (
      existing.requestSha256 !== operation.requestSha256 ||
      existing.operationType !== operation.operationType
    ) {
      return { status: "conflict" };
    }
    return { resultId: existing.resultId, status: "replay" };
  }

  /**
   * Records the operation and returns whether this call won the claim. Losing the
   * `(actorUserId, operationId)` race returns `replayed: true` so the caller can
   * roll its own write back instead of leaving an orphan.
   */
  function recordOperation(
    operation: Student500OperationStamp,
    resultId: string
  ): { replayed: boolean; resultId: string } {
    const operationKey = `${operation.actorUserId}:${operation.operationId}`;
    const existing = operations.get(operationKey);
    if (existing) {
      if (
        existing.requestSha256 !== operation.requestSha256 ||
        existing.operationType !== operation.operationType
      ) {
        throw new Student500Error("idempotency_conflict");
      }
      return { replayed: true, resultId: existing.resultId };
    }
    operations.set(operationKey, {
      operationType: operation.operationType,
      requestSha256: operation.requestSha256,
      resultId,
    });
    return { replayed: false, resultId };
  }

  function ownedBy(
    application: Student500ApplicationRecord,
    input: { projectId: string; ownerUserId: string }
  ): boolean {
    return (
      application.projectId === input.projectId &&
      application.ownerUserId === input.ownerUserId
    );
  }

  function appendEvent(input: {
    actorUserId: string;
    application: Student500ApplicationRecord;
    eventType: string;
    subjectKind: string;
    subjectId: string;
  }) {
    const list = events.get(input.application.id) ?? [];
    list.push({
      actorUserId: input.actorUserId,
      applicationId: input.application.id,
      applicationRevision: input.application.revision,
      createdAt: new Date(),
      eventType: input.eventType,
      id: randomUUID(),
      projectId: input.application.projectId,
      subjectId: input.subjectId,
      subjectKind: input.subjectKind,
    });
    events.set(input.application.id, list);
  }

  return {
    async readActorContext(input): Promise<Student500ActorContext> {
      const actor = actors.get(input.actorUserId);
      const project = projects.get(input.projectId);
      return {
        membershipStatus: membershipStatus(input.projectId, input.actorUserId),
        project: project
          ? {
              id: input.projectId,
              ownerUserId: project.ownerUserId,
              status: project.status,
            }
          : null,
        registeredCustomer: Boolean(actor?.registeredCustomer),
        staff: Boolean(actor?.staff),
      };
    },

    async findOperation(input) {
      const existing = operations.get(
        `${input.actorUserId}:${input.operationId}`
      );
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
        resultKind: "student_500_application",
        status: "replay",
      };
    },

    async listApplications(input) {
      return [...applications.values()]
        .filter((application) => ownedBy(application, input))
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
        );
    },

    async getApplication(input) {
      const application = applications.get(input.applicationId);
      return application && ownedBy(application, input) ? application : null;
    },

    async listEvents(input) {
      return [...(events.get(input.applicationId) ?? [])];
    },

    async countApplications(input) {
      return [...applications.values()].filter((application) =>
        ownedBy(application, input)
      ).length;
    },

    createApplication(
      input
    ): Promise<Student500WriteResult<Student500ApplicationRecord>> {
      requireAuthority(input.projectId, input.operation.actorUserId);
      // Resolve an exact retry from the persisted operation before writing, using
      // the recorded result id (never a freshly generated one).
      const recorded = readOperation(input.operation);
      if (recorded.status === "conflict") {
        throw new Student500Error("idempotency_conflict");
      }
      if (recorded.status === "replay") {
        const existing = applications.get(recorded.resultId);
        if (
          !(
            existing &&
            ownedBy(existing, {
              ownerUserId: input.values.ownerUserId,
              projectId: input.projectId,
            })
          )
        ) {
          throw new Student500Error("application_not_found");
        }
        return Promise.resolve({ replayed: true, value: existing });
      }
      const owned = [...applications.values()].filter((application) =>
        ownedBy(application, {
          ownerUserId: input.values.ownerUserId,
          projectId: input.projectId,
        })
      );
      if (owned.length >= STUDENT_500_MAX_APPLICATIONS_PER_PROJECT) {
        throw new Student500Error("limit_exceeded");
      }
      const now = new Date();
      const created: Student500ApplicationRecord = {
        applicantUserId: input.values.applicantUserId,
        archivedAt: null,
        context: input.values.context,
        createdAt: now,
        id: randomUUID(),
        ownerUserId: input.values.ownerUserId,
        projectId: input.projectId,
        revision: 1,
        status: "draft",
        updatedAt: now,
      };
      // Application first, then the operation that references it (mirrors the SQL
      // adapter's immediate composite foreign key ordering).
      const recordedAgain = recordOperation(input.operation, created.id);
      if (recordedAgain.replayed) {
        // Another call won the same operation id: leave no orphan behind.
        throw new Student500Error("idempotency_conflict");
      }
      applications.set(created.id, created);
      appendEvent({
        actorUserId: input.operation.actorUserId,
        application: created,
        eventType: "student_500_created",
        subjectId: created.id,
        subjectKind: "student_500_application",
      });
      writes.push({
        applicationId: created.id,
        operationType: input.operation.operationType,
      });
      return Promise.resolve({ replayed: false, value: created });
    },

    updateApplication(
      input
    ): Promise<Student500WriteResult<Student500ApplicationRecord>> {
      requireAuthority(input.projectId, input.operation.actorUserId);
      const existing = applications.get(input.applicationId);
      if (!existing || !ownedBy(existing, input)) {
        throw new Student500Error("application_not_found");
      }
      const claimed = recordOperation(input.operation, existing.id);
      if (claimed.replayed) {
        return Promise.resolve({ replayed: true, value: existing });
      }
      if (existing.revision !== input.expectedRevision) {
        throw new Student500Error("revision_conflict");
      }
      if (existing.status === "archived") {
        throw new Student500Error("application_archived");
      }
      const updated: Student500ApplicationRecord = {
        ...existing,
        applicantUserId: input.values.applicantUserId,
        context: input.values.context,
        revision: existing.revision + 1,
        status: "in_progress",
        updatedAt: new Date(),
      };
      applications.set(updated.id, updated);
      appendEvent({
        actorUserId: input.operation.actorUserId,
        application: updated,
        eventType: "student_500_updated",
        subjectId: updated.id,
        subjectKind: "student_500_application",
      });
      writes.push({
        applicationId: updated.id,
        operationType: input.operation.operationType,
      });
      return Promise.resolve({ replayed: false, value: updated });
    },

    archiveApplication(
      input
    ): Promise<Student500WriteResult<Student500ApplicationRecord>> {
      requireAuthority(input.projectId, input.operation.actorUserId);
      const existing = applications.get(input.applicationId);
      if (!existing || !ownedBy(existing, input)) {
        throw new Student500Error("application_not_found");
      }
      const claimed = recordOperation(input.operation, existing.id);
      if (claimed.replayed) {
        return Promise.resolve({ replayed: true, value: existing });
      }
      if (existing.revision !== input.expectedRevision) {
        throw new Student500Error("revision_conflict");
      }
      if (existing.status === "archived") {
        throw new Student500Error("application_archived");
      }
      const now = new Date();
      const archived: Student500ApplicationRecord = {
        ...existing,
        archivedAt: now,
        revision: existing.revision + 1,
        status: "archived",
        updatedAt: now,
      };
      applications.set(archived.id, archived);
      appendEvent({
        actorUserId: input.operation.actorUserId,
        application: archived,
        eventType: "student_500_archived",
        subjectId: archived.id,
        subjectKind: "student_500_application",
      });
      writes.push({
        applicationId: archived.id,
        operationType: input.operation.operationType,
      });
      return Promise.resolve({ replayed: false, value: archived });
    },

    seedProject(projectId, project) {
      projects.set(projectId, project);
    },

    seedActor(userId, actor) {
      actors.set(userId, actor);
    },

    setProjectStatus(projectId, status) {
      const project = projects.get(projectId);
      if (!project) {
        throw new Error("project_not_seeded");
      }
      projects.set(projectId, { ...project, status });
    },

    setMembership(projectId, userId, status) {
      const actor = actors.get(userId);
      if (!actor) {
        throw new Error("actor_not_seeded");
      }
      actors.set(userId, {
        ...actor,
        memberships: { ...actor.memberships, [projectId]: status },
      });
    },

    tick() {
      return Promise.resolve();
    },

    get writes() {
      return writes;
    },
  };
}
