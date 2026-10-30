// biome-ignore-all lint/suspicious/useAwait: this test-only store implements an
// asynchronous persistence port; the read helpers resolve synchronously so the
// domain service can be awaited without a database.
import { randomUUID } from "node:crypto";
import {
  SCHOOL_APPLICATION_MAX_APPLICATIONS_PER_PROJECT,
  SchoolApplicationError,
  type SchoolApplicationOperationResultKind,
  type SchoolApplicationOperationType,
  schoolApplicationStatusAfterMaterialChange,
} from "./contracts";
import type {
  SchoolApplicationActorContext,
  SchoolApplicationEventRecord,
  SchoolApplicationMembershipStatus,
  SchoolApplicationOperationStamp,
  SchoolApplicationPackageRecord,
  SchoolApplicationRecord,
  SchoolApplicationReferenceRecord,
  SchoolApplicationReferenceResolver,
  SchoolApplicationStore,
  SchoolApplicationWriteResult,
} from "./ports";

/**
 * Deterministic in-memory School Application store.
 *
 * It exists so the domain service, authorization boundaries, idempotency, CAS
 * concurrency and package invalidation are executable without PostgreSQL. It
 * deliberately mirrors the SQL adapter's invariants:
 *   - every mutation is serialized (the SQL adapter uses a row lock),
 *   - every mutation is copy-on-write, so a rejected request leaves no partial
 *     state,
 *   - operations are unique per (actor, operationId) with a request digest,
 *   - one current package per application (partial unique index in SQL).
 */

export type InMemoryProjectSeed = {
  readonly ownerUserId: string;
  readonly status: "active" | "closed";
};

export type InMemoryActorSeed = {
  readonly registeredCustomer: boolean;
  readonly staff?: boolean;
  readonly memberships?: Readonly<
    Record<string, "active" | "pending" | "revoked">
  >;
};

export type InMemorySchoolApplicationStore = SchoolApplicationStore & {
  seedProject(projectId: string, project: InMemoryProjectSeed): void;
  seedActor(userId: string, actor: InMemoryActorSeed): void;
  /** Simulates a concurrent Project closure committing outside the write. */
  setProjectStatus(projectId: string, status: "active" | "closed"): void;
  /** Simulates a concurrent membership revocation committing outside the write. */
  setMembership(
    projectId: string,
    userId: string,
    status: "active" | "pending" | "revoked"
  ): void;
  /**
   * Runs inside the next serialized write, after the service-level authorization
   * read and before the store's own revalidation. This is how the absorbed
   * authorization TOCTOU window is reproduced without PostgreSQL.
   */
  setWriteBarrier(barrier: (() => void | Promise<void>) | null): void;
  /** Resolver that only exposes references owned by the requesting actor. */
  referenceResolver(): SchoolApplicationReferenceResolver;
  seedReferenceOwner(input: {
    readonly projectId: string;
    readonly kind: "fact" | "requirement" | "document";
    readonly referenceId: string;
    readonly ownerUserId: string;
    readonly version: number;
    readonly sha256: string;
    readonly available?: boolean;
  }): void;
  state(): {
    readonly applications: readonly SchoolApplicationRecord[];
    readonly references: readonly SchoolApplicationReferenceRecord[];
    readonly packages: readonly SchoolApplicationPackageRecord[];
    readonly events: readonly SchoolApplicationEventRecord[];
    readonly operations: readonly {
      readonly actorUserId: string;
      readonly operationId: string;
      readonly operationType: string;
      readonly requestSha256: string;
      readonly resultKind: string;
      readonly resultId: string;
    }[];
  };
};

type OperationRecord = {
  actorUserId: string;
  operationId: string;
  operationType: SchoolApplicationOperationType;
  requestSha256: string;
  resultKind: SchoolApplicationOperationResultKind;
  resultId: string;
};

export function createInMemorySchoolApplicationStore(
  options: { readonly now?: () => Date; readonly newId?: () => string } = {}
): InMemorySchoolApplicationStore {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => randomUUID());

  const projects = new Map<string, InMemoryProjectSeed>();
  const actors = new Map<string, InMemoryActorSeed>();
  const applications = new Map<string, SchoolApplicationRecord>();
  const references = new Map<string, SchoolApplicationReferenceRecord>();
  const packages = new Map<string, SchoolApplicationPackageRecord>();
  const events: SchoolApplicationEventRecord[] = [];
  const operations = new Map<string, OperationRecord>();
  const ownedReferences = new Map<
    string,
    {
      projectId: string;
      kind: string;
      referenceId: string;
      ownerUserId: string;
      version: number;
      sha256: string;
      available: boolean;
    }
  >();

  let queue: Promise<unknown> = Promise.resolve();

  /**
   * Test seam that mirrors a competing transaction committing between the
   * service-level authorization read and the store write. It runs at the start of
   * every serialized mutation, before the mirrored in-transaction authorization
   * revalidation, so a revocation/closure injected here must be observed.
   */
  let writeBarrier: (() => void | Promise<void>) | null = null;

  async function runWriteBarrier() {
    await writeBarrier?.();
  }

  /**
   * In-transaction authorization revalidation (mirrors the SQL adapter).
   *
   * The service authorizes first; a revocation or closure can still land before
   * the write. Every mutation therefore re-derives authority here, in the same
   * Project-then-Membership order the SQL adapter uses.
   */
  function assertWriteAuthority(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }) {
    const actor = actors.get(input.actorUserId);
    if (!actor || actor.staff || !actor.registeredCustomer) {
      throw new SchoolApplicationError("actor_not_eligible");
    }
    const project = projects.get(input.projectId);
    if (!project) {
      throw new SchoolApplicationError("project_not_found");
    }
    const membership = actor.memberships?.[input.projectId] ?? "missing";
    if (project.ownerUserId !== input.actorUserId && membership !== "active") {
      throw new SchoolApplicationError("project_forbidden");
    }
    if (project.status !== "active") {
      throw new SchoolApplicationError("project_closed");
    }
  }

  /** Serializes every mutation, mirroring the SQL row lock acquisition order. */
  function serialize<T>(action: () => Promise<T> | T): Promise<T> {
    const run = queue.then(action, action);
    queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function claim(
    operation: SchoolApplicationOperationStamp
  ): OperationRecord | null {
    const existing = operations.get(
      `${operation.actorUserId}:${operation.operationId}`
    );
    if (!existing) {
      return null;
    }
    if (
      existing.requestSha256 !== operation.requestSha256 ||
      existing.operationType !== operation.operationType
    ) {
      throw new SchoolApplicationError("idempotency_conflict");
    }
    return existing;
  }

  function record(
    operation: SchoolApplicationOperationStamp,
    resultKind: SchoolApplicationOperationResultKind,
    resultId: string
  ) {
    operations.set(`${operation.actorUserId}:${operation.operationId}`, {
      actorUserId: operation.actorUserId,
      operationId: operation.operationId,
      operationType: operation.operationType,
      requestSha256: operation.requestSha256,
      resultId,
      resultKind,
    });
  }

  /**
   * Resolves the application of a mutation with existence-hiding semantics.
   *
   * `replay` is only meaningful for application-result operations (create/update/
   * archive), where the recorded result id *is* the application id. Reference and
   * package operations record their own result id, so they resolve the
   * application from `input.applicationId` and pass `null` here.
   */
  function applicationOf(
    input: {
      readonly projectId: string;
      readonly ownerUserId: string;
      readonly applicationId: string;
    },
    replay: OperationRecord | null
  ): SchoolApplicationRecord {
    const application = applications.get(
      replay ? replay.resultId : input.applicationId
    );
    if (
      !application ||
      application.projectId !== input.projectId ||
      application.ownerUserId !== input.ownerUserId
    ) {
      throw new SchoolApplicationError(
        replay ? "integrity_conflict" : "application_not_found"
      );
    }
    return application;
  }

  function appendEvent(input: {
    application: SchoolApplicationRecord;
    actorUserId: string;
    eventType: string;
    subjectKind:
      | "school_application"
      | "school_application_reference"
      | "school_application_package";
    subjectId: string;
    applicationRevision: number;
    at: Date;
  }) {
    events.push({
      actorUserId: input.actorUserId,
      applicationId: input.application.id,
      applicationRevision: input.applicationRevision,
      createdAt: input.at,
      eventType: input.eventType,
      id: newId(),
      projectId: input.application.projectId,
      subjectId: input.subjectId,
      subjectKind: input.subjectKind,
    });
  }

  function packagesFor(applicationId: string) {
    return [...packages.values()].filter(
      (entry) => entry.applicationId === applicationId
    );
  }

  function referencesFor(applicationId: string) {
    return [...references.values()].filter(
      (entry) => entry.applicationId === applicationId
    );
  }

  function invalidateCurrentPackage(input: {
    application: SchoolApplicationRecord;
    actorUserId: string;
    at: Date;
  }) {
    const current = packagesFor(input.application.id).find(
      (entry) => entry.status === "current"
    );
    if (!current) {
      return null;
    }
    const stale: SchoolApplicationPackageRecord = {
      ...current,
      status: "stale",
    };
    packages.set(current.id, stale);
    appendEvent({
      actorUserId: input.actorUserId,
      application: input.application,
      applicationRevision: input.application.revision,
      at: input.at,
      eventType: "school_application_package_invalidated",
      subjectId: stale.id,
      subjectKind: "school_application_package",
    });
    return stale;
  }

  return {
    seedProject(projectId, project) {
      projects.set(projectId, project);
    },

    seedActor(userId, actor) {
      actors.set(userId, actor);
    },

    setProjectStatus(projectId, status) {
      const project = projects.get(projectId);
      if (project) {
        projects.set(projectId, { ...project, status });
      }
    },

    setMembership(projectId, userId, status) {
      const actor = actors.get(userId);
      if (!actor) {
        return;
      }
      actors.set(userId, {
        ...actor,
        memberships: { ...actor.memberships, [projectId]: status },
      });
    },

    setWriteBarrier(barrier) {
      writeBarrier = barrier;
    },

    async findOperation(input) {
      const existing = operations.get(
        `${input.actorUserId}:${input.operationId}`
      );
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
        resultKind: existing.resultKind,
        status: "replay",
      } as const;
    },

    seedReferenceOwner(input) {
      ownedReferences.set(
        `${input.kind}:${input.projectId}:${input.referenceId}`,
        {
          available: input.available ?? true,
          kind: input.kind,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          referenceId: input.referenceId,
          sha256: input.sha256,
          version: input.version,
        }
      );
    },

    async readActorContext(input): Promise<SchoolApplicationActorContext> {
      const actor = actors.get(input.actorUserId);
      const project = projects.get(input.projectId);
      const seeded = actor?.memberships?.[input.projectId] ?? "missing";
      const membershipStatus: SchoolApplicationMembershipStatus =
        project && project.ownerUserId === input.actorUserId
          ? "owner"
          : seeded === "active"
            ? "active_member"
            : seeded;
      return {
        membershipStatus,
        project: project
          ? {
              id: input.projectId,
              ownerUserId: project.ownerUserId,
              status: project.status,
            }
          : null,
        registeredCustomer: actor?.registeredCustomer ?? false,
        staff: actor?.staff ?? false,
      };
    },

    async listApplications(input) {
      return [...applications.values()]
        .filter(
          (entry) =>
            entry.projectId === input.projectId &&
            entry.ownerUserId === input.ownerUserId
        )
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id)
        );
    },

    async getApplication(input) {
      const application = applications.get(input.applicationId);
      if (
        !application ||
        application.projectId !== input.projectId ||
        application.ownerUserId !== input.ownerUserId
      ) {
        return null;
      }
      return application;
    },

    async listReferences(input) {
      return referencesFor(input.applicationId).sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id)
      );
    },

    async listPackages(input) {
      return packagesFor(input.applicationId).sort(
        (left, right) => left.version - right.version
      );
    },

    async listEvents(input) {
      return events
        .filter((event) => event.applicationId === input.applicationId)
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id)
        );
    },

    async countApplications(input) {
      return [...applications.values()].filter(
        (entry) =>
          entry.projectId === input.projectId &&
          entry.ownerUserId === input.ownerUserId
      ).length;
    },

    createApplication(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationRecord>> {
      return serialize(async () => {
        await runWriteBarrier();
        assertWriteAuthority({
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        if (replay) {
          return {
            replayed: true,
            value: applicationOf(
              {
                applicationId: replay.resultId,
                ownerUserId: input.values.ownerUserId,
                projectId: input.projectId,
              },
              replay
            ),
          };
        }
        const owned = [...applications.values()].filter(
          (entry) =>
            entry.projectId === input.projectId &&
            entry.ownerUserId === input.values.ownerUserId
        ).length;
        if (owned >= SCHOOL_APPLICATION_MAX_APPLICATIONS_PER_PROJECT) {
          throw new SchoolApplicationError("limit_exceeded");
        }
        const at = now();
        const application: SchoolApplicationRecord = {
          archivedAt: null,
          catalogRecordClass: input.values.catalogRecordClass,
          catalogSnapshotToken: input.values.catalogSnapshotToken,
          courseId: input.values.courseId,
          courseTitle: input.values.courseTitle,
          createdAt: at,
          deliveryId: input.values.deliveryId,
          id: newId(),
          institutionId: input.values.institutionId,
          institutionName: input.values.institutionName,
          intakeId: input.values.intakeId,
          intakeLabel: input.values.intakeLabel,
          ownerUserId: input.values.ownerUserId,
          projectId: input.projectId,
          revision: 1,
          sourceStatus: input.values.sourceStatus,
          status: "draft",
          updatedAt: at,
        };
        applications.set(application.id, application);
        record(input.operation, "school_application", application.id);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          application,
          applicationRevision: 1,
          at,
          eventType: "school_application_created",
          subjectId: application.id,
          subjectKind: "school_application",
        });
        return { replayed: false, value: application };
      });
    },

    updateApplication(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationRecord>> {
      return serialize(async () => {
        await runWriteBarrier();
        assertWriteAuthority({
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        const application = applicationOf(input, replay);
        if (replay) {
          return { replayed: true, value: application };
        }
        if (application.revision !== input.expectedRevision) {
          throw new SchoolApplicationError("revision_conflict");
        }
        const at = now();
        const revision = application.revision + 1;
        const current = packagesFor(application.id).find(
          (entry) => entry.status === "current"
        );
        const transition = schoolApplicationStatusAfterMaterialChange({
          hasCurrentPackage: Boolean(current),
        });
        const updated: SchoolApplicationRecord = {
          ...application,
          catalogRecordClass: input.values.catalogRecordClass,
          catalogSnapshotToken: input.values.catalogSnapshotToken,
          courseId: input.values.courseId,
          courseTitle: input.values.courseTitle,
          deliveryId: input.values.deliveryId,
          institutionId: input.values.institutionId,
          institutionName: input.values.institutionName,
          intakeId: input.values.intakeId,
          intakeLabel: input.values.intakeLabel,
          revision,
          sourceStatus: input.values.sourceStatus,
          status: transition.status,
          updatedAt: at,
        };
        applications.set(updated.id, updated);
        invalidateCurrentPackage({
          actorUserId: input.operation.actorUserId,
          application: updated,
          at,
        });
        record(input.operation, "school_application", updated.id);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          application: updated,
          applicationRevision: revision,
          at,
          eventType: "school_application_updated",
          subjectId: updated.id,
          subjectKind: "school_application",
        });
        return { replayed: false, value: updated };
      });
    },

    archiveApplication(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationRecord>> {
      return serialize(async () => {
        await runWriteBarrier();
        assertWriteAuthority({
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        const application = applicationOf(input, replay);
        if (replay) {
          return { replayed: true, value: application };
        }
        if (application.revision !== input.expectedRevision) {
          throw new SchoolApplicationError("revision_conflict");
        }
        const at = now();
        const revision = application.revision + 1;
        const updated: SchoolApplicationRecord = {
          ...application,
          archivedAt: at,
          revision,
          status: "archived",
          updatedAt: at,
        };
        applications.set(updated.id, updated);
        record(input.operation, "school_application", updated.id);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          application: updated,
          applicationRevision: revision,
          at,
          eventType: "school_application_archived",
          subjectId: updated.id,
          subjectKind: "school_application",
        });
        return { replayed: false, value: updated };
      });
    },

    bindReference(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationReferenceRecord>> {
      return serialize(async () => {
        await runWriteBarrier();
        assertWriteAuthority({
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        const application = applicationOf(input, null);
        if (replay) {
          const reference = references.get(replay.resultId);
          if (!reference) {
            throw new SchoolApplicationError("integrity_conflict");
          }
          return { replayed: true, value: reference };
        }
        if (application.revision !== input.expectedRevision) {
          throw new SchoolApplicationError("revision_conflict");
        }
        const at = now();
        const revision = application.revision + 1;
        const existing = referencesFor(application.id).find(
          (entry) =>
            entry.revokedAt === null &&
            entry.kind === input.kind &&
            entry.referenceId === input.referenceId
        );
        const reference: SchoolApplicationReferenceRecord = existing
          ? {
              ...existing,
              referenceSha256: input.referenceSha256,
              referenceVersion: input.referenceVersion,
            }
          : {
              applicationId: application.id,
              createdAt: at,
              createdByUserId: input.operation.actorUserId,
              id: newId(),
              kind: input.kind,
              projectId: input.projectId,
              referenceId: input.referenceId,
              referenceSha256: input.referenceSha256,
              referenceVersion: input.referenceVersion,
              revokedAt: null,
            };
        references.set(reference.id, reference);
        const current = packagesFor(application.id).find(
          (entry) => entry.status === "current"
        );
        const transition = schoolApplicationStatusAfterMaterialChange({
          hasCurrentPackage: Boolean(current),
        });
        const updated: SchoolApplicationRecord = {
          ...application,
          revision,
          status: transition.status,
          updatedAt: at,
        };
        applications.set(updated.id, updated);
        invalidateCurrentPackage({
          actorUserId: input.operation.actorUserId,
          application: updated,
          at,
        });
        record(input.operation, "school_application_reference", reference.id);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          application: updated,
          applicationRevision: revision,
          at,
          eventType: "school_application_reference_bound",
          subjectId: reference.id,
          subjectKind: "school_application_reference",
        });
        return { replayed: false, value: reference };
      });
    },

    revokeReference(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationReferenceRecord>> {
      return serialize(async () => {
        await runWriteBarrier();
        assertWriteAuthority({
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        const application = applicationOf(input, null);
        if (replay) {
          const reference = references.get(replay.resultId);
          if (!reference) {
            throw new SchoolApplicationError("integrity_conflict");
          }
          return { replayed: true, value: reference };
        }
        if (application.revision !== input.expectedRevision) {
          throw new SchoolApplicationError("revision_conflict");
        }
        const existing = references.get(input.referenceRecordId);
        if (
          !existing ||
          existing.applicationId !== application.id ||
          existing.revokedAt !== null
        ) {
          throw new SchoolApplicationError("state_conflict");
        }
        const at = now();
        const revision = application.revision + 1;
        const reference: SchoolApplicationReferenceRecord = {
          ...existing,
          revokedAt: at,
        };
        references.set(reference.id, reference);
        const current = packagesFor(application.id).find(
          (entry) => entry.status === "current"
        );
        const transition = schoolApplicationStatusAfterMaterialChange({
          hasCurrentPackage: Boolean(current),
        });
        const updated: SchoolApplicationRecord = {
          ...application,
          revision,
          status: transition.status,
          updatedAt: at,
        };
        applications.set(updated.id, updated);
        invalidateCurrentPackage({
          actorUserId: input.operation.actorUserId,
          application: updated,
          at,
        });
        record(input.operation, "school_application_reference", reference.id);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          application: updated,
          applicationRevision: revision,
          at,
          eventType: "school_application_reference_revoked",
          subjectId: reference.id,
          subjectKind: "school_application_reference",
        });
        return { replayed: false, value: reference };
      });
    },

    buildPackage(
      input
    ): Promise<SchoolApplicationWriteResult<SchoolApplicationPackageRecord>> {
      return serialize(async () => {
        await runWriteBarrier();
        assertWriteAuthority({
          actorUserId: input.operation.actorUserId,
          projectId: input.projectId,
        });
        const replay = claim(input.operation);
        const application = applicationOf(input, null);
        if (replay) {
          const existing = packages.get(replay.resultId);
          if (!existing) {
            throw new SchoolApplicationError("integrity_conflict");
          }
          return { replayed: true, value: existing };
        }
        if (application.revision !== input.expectedRevision) {
          throw new SchoolApplicationError("revision_conflict");
        }
        const at = now();
        const current = packagesFor(application.id).find(
          (entry) => entry.status === "current"
        );
        if (
          current &&
          current.version === input.package.version &&
          current.inputsSha256 === input.package.inputsSha256
        ) {
          // Same immutable inputs at the same version: reuse the current package
          // instead of minting a redundant version. Replay stays deterministic.
          record(input.operation, "school_application_package", current.id);
          return { replayed: false, value: current };
        }
        for (const refresh of input.references) {
          const existing = references.get(refresh.referenceRecordId);
          if (
            !existing ||
            existing.applicationId !== application.id ||
            existing.revokedAt !== null
          ) {
            throw new SchoolApplicationError("integrity_conflict");
          }
          references.set(existing.id, {
            ...existing,
            referenceSha256: refresh.referenceSha256,
            referenceVersion: refresh.referenceVersion,
          });
        }
        if (current) {
          packages.set(current.id, { ...current, status: "superseded" });
        }
        const revision = application.revision + 1;
        const created: SchoolApplicationPackageRecord = {
          applicationId: application.id,
          contentSha256: input.package.contentSha256,
          createdAt: at,
          createdByUserId: input.operation.actorUserId,
          id: newId(),
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
        };
        packages.set(created.id, created);
        const updated: SchoolApplicationRecord = {
          ...application,
          revision,
          status: "package_prepared",
          updatedAt: at,
        };
        applications.set(updated.id, updated);
        record(input.operation, "school_application_package", created.id);
        appendEvent({
          actorUserId: input.operation.actorUserId,
          application: updated,
          applicationRevision: revision,
          at,
          eventType: "school_application_package_built",
          subjectId: created.id,
          subjectKind: "school_application_package",
        });
        return { replayed: false, value: created };
      });
    },

    referenceResolver() {
      return {
        async resolve(resolveInput: {
          readonly actorUserId: string;
          readonly projectId: string;
          readonly kind: "fact" | "requirement" | "document";
          readonly referenceId: string;
        }) {
          const owned = ownedReferences.get(
            `${resolveInput.kind}:${resolveInput.projectId}:${resolveInput.referenceId}`
          );
          if (!owned) {
            return { status: "not_found" } as const;
          }
          if (!owned.available) {
            return { status: "forbidden" } as const;
          }
          if (owned.ownerUserId !== resolveInput.actorUserId) {
            // Another member's private fact/document is existence-hidden.
            return { status: "not_found" } as const;
          }
          return {
            referenceSha256: owned.sha256,
            referenceVersion: owned.version,
            status: "resolved" as const,
          };
        },
      };
    },

    state() {
      return {
        applications: [...applications.values()],
        events: [...events],
        operations: [...operations.values()],
        packages: [...packages.values()],
        references: [...references.values()],
      };
    },
  };
}
