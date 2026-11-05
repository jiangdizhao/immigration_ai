import {
  type SubmissionConfirmationType,
  SubmissionPackageError,
} from "./contracts";
import type {
  NewSubmissionPackageValues,
  SubmissionActorContext,
  SubmissionConfirmationRecord,
  SubmissionFinalizationRecord,
  SubmissionInvalidationRecord,
  SubmissionMembershipStatus,
  SubmissionOperationStamp,
  SubmissionPackageRecord,
  SubmissionPackageStore,
  SubmissionWriteResult,
} from "./ports";

/**
 * Phase 13 M8.1 - in-memory store for offline contract tests.
 *
 * It reproduces the database-owned invariants the real repository relies on, so a
 * test proves the *service* contract rather than an easier fiction:
 *
 *   - `unique (projectId, operationId)` per row family (insert-once replay);
 *   - `unique (projectId, targetKind, targetId, version)` (no two versions collide);
 *   - `unique (packageVersionId, confirmationType)` (one current confirmation);
 *   - insert-once invalidation evidence per `(confirmationId, dependencySha256)`;
 *   - rows are never mutated once written.
 *
 * `await Promise.resolve()` yields are deliberate: they let concurrent callers
 * interleave exactly as two database sessions would.
 */

export type SubmissionTestAccount = {
  readonly registeredCustomer: boolean;
  readonly staff: boolean;
};

export type SubmissionTestProject = {
  readonly ownerUserId: string;
  status: "active" | "closed";
  readonly members: Map<string, "active" | "pending" | "revoked">;
};

export type SubmissionTestWorld = {
  readonly accounts: Map<string, SubmissionTestAccount>;
  readonly projects: Map<string, SubmissionTestProject>;
};

export function createSubmissionTestWorld(): SubmissionTestWorld {
  return { accounts: new Map(), projects: new Map() };
}

function membershipStatus(
  project: SubmissionTestProject,
  actorUserId: string
): SubmissionMembershipStatus {
  if (project.ownerUserId === actorUserId) {
    return "owner";
  }
  const status = project.members.get(actorUserId);
  if (status === "active") {
    return "active_member";
  }
  return status ?? "missing";
}

/**
 * Test-only seams used to inject a state change *between* the service's preliminary
 * validation and the durable write. Production has no such hook.
 */
export type SubmissionTestHooks = {
  onBeforePackageInsert?: () => void | Promise<void>;
  onBeforeConfirmationInsert?: () => void | Promise<void>;
  /** Runs before the mandatory finalization row is written. */
  onBeforeFinalization?: () => void | Promise<void>;
  /** Runs before the mandatory invalidation row is written. */
  onBeforeInvalidation?: () => void | Promise<void>;
};

export function createInMemorySubmissionPackageStore(
  world: SubmissionTestWorld,
  hooks: SubmissionTestHooks = {}
): SubmissionPackageStore {
  const packages: SubmissionPackageRecord[] = [];
  const confirmations: SubmissionConfirmationRecord[] = [];
  const invalidations: SubmissionInvalidationRecord[] = [];
  const finalizations: SubmissionFinalizationRecord[] = [];

  function sameTarget(
    record: { projectId: string; targetKind: string; targetId: string },
    input: { projectId: string; targetKind: string; targetId: string }
  ): boolean {
    return (
      record.projectId === input.projectId &&
      record.targetKind === input.targetKind &&
      record.targetId === input.targetId
    );
  }

  function insertPackageOnce(
    values: NewSubmissionPackageValues,
    projectId: string,
    operation: SubmissionOperationStamp
  ): SubmissionPackageRecord {
    if (
      packages.some(
        (record) =>
          sameTarget(record, {
            projectId,
            targetId: values.targetId,
            targetKind: values.targetKind,
          }) && record.version === values.version
      )
    ) {
      throw new SubmissionPackageError("version_conflict");
    }
    if (
      packages.some(
        (record) =>
          record.projectId === projectId &&
          record.operationId === operation.operationId
      )
    ) {
      throw new SubmissionPackageError("idempotency_conflict");
    }
    const record: SubmissionPackageRecord = {
      createdAt: new Date(),
      createdByUserId: operation.actorUserId,
      dependencySha256: values.dependencySha256,
      id: values.id,
      manifest: values.manifest,
      manifestSha256: values.manifestSha256,
      operationId: operation.operationId,
      projectId,
      requestSha256: operation.requestSha256,
      schemaVersion: values.schemaVersion,
      statementPolicyVersion: values.statementPolicyVersion,
      status: "frozen",
      targetId: values.targetId,
      targetKind: values.targetKind,
      version: values.version,
    };
    packages.push(record);
    return record;
  }

  /**
   * The durable-write authorization re-check.
   *
   * The real repository performs the equivalent inside its transaction with the
   * Project row locked, so a revocation between the preliminary read and the write
   * cannot produce a successful invalid confirmation.
   */
  function assertGuard(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly requireActiveProject: boolean;
  }): void {
    const account = world.accounts.get(input.actorUserId);
    const project = world.projects.get(input.projectId);
    if (!account || !account.registeredCustomer || account.staff) {
      throw new SubmissionPackageError("actor_not_eligible");
    }
    if (!project) {
      throw new SubmissionPackageError("project_not_found");
    }
    const membership = membershipStatus(project, input.actorUserId);
    if (membership !== "owner" && membership !== "active_member") {
      throw new SubmissionPackageError("project_forbidden");
    }
    if (input.requireActiveProject && project.status !== "active") {
      throw new SubmissionPackageError("project_closed");
    }
  }

  return {
    async readActorContext(input): Promise<SubmissionActorContext> {
      await Promise.resolve();
      const account = world.accounts.get(input.actorUserId);
      const project = world.projects.get(input.projectId);
      if (account === undefined) {
        return {
          membershipStatus: "missing",
          project: project
            ? {
                id: input.projectId,
                ownerUserId: project.ownerUserId,
                status: project.status,
              }
            : null,
          registeredCustomer: false,
          staff: false,
        };
      }
      return {
        membershipStatus:
          project === undefined
            ? "missing"
            : membershipStatus(project, input.actorUserId),
        project: project
          ? {
              id: input.projectId,
              ownerUserId: project.ownerUserId,
              status: project.status,
            }
          : null,
        registeredCustomer: account.registeredCustomer,
        staff: account.staff,
      };
    },

    async listPackages(input) {
      await Promise.resolve();
      return packages
        .filter((record) => sameTarget(record, input))
        .sort((left, right) => left.version - right.version);
    },

    async getPackage(input) {
      await Promise.resolve();
      return (
        packages.find(
          (record) =>
            record.id === input.packageVersionId &&
            record.projectId === input.projectId
        ) ?? null
      );
    },

    async findPackageOperation(input) {
      await Promise.resolve();
      return (
        packages.find(
          (record) =>
            record.projectId === input.projectId &&
            record.operationId === input.operationId
        ) ?? null
      );
    },

    async latestVersion(input) {
      await Promise.resolve();
      const versions = packages
        .filter((record) => sameTarget(record, input))
        .map((record) => record.version);
      return versions.length === 0 ? 0 : Math.max(...versions);
    },

    async countPackages(input) {
      await Promise.resolve();
      return packages.filter((record) => sameTarget(record, input)).length;
    },

    async insertPackage(
      input
    ): Promise<SubmissionWriteResult<SubmissionPackageRecord>> {
      await Promise.resolve();
      // Adversarial seam: a test may change authorization or upstream state here,
      // exactly between the service's preliminary validation and the durable write.
      await hooks.onBeforePackageInsert?.();
      await Promise.resolve();
      assertGuard({
        actorUserId: input.guard.actorUserId,
        projectId: input.projectId,
        requireActiveProject: input.guard.requireActiveProject,
      });
      const record = insertPackageOnce(
        input.values,
        input.projectId,
        input.operation
      );
      return { replayed: false, value: record };
    },

    async listConfirmations(input) {
      await Promise.resolve();
      return confirmations
        .filter((record) => sameTarget(record, input))
        .sort(
          (left, right) =>
            left.confirmedAt.getTime() - right.confirmedAt.getTime()
        );
    },

    async getConfirmation(input: {
      readonly projectId: string;
      readonly packageVersionId: string;
      readonly confirmationType: SubmissionConfirmationType;
    }) {
      await Promise.resolve();
      return (
        confirmations.find(
          (record) =>
            record.projectId === input.projectId &&
            record.packageVersionId === input.packageVersionId &&
            record.confirmationType === input.confirmationType
        ) ?? null
      );
    },

    async findConfirmationOperation(input) {
      await Promise.resolve();
      return (
        confirmations.find(
          (record) =>
            record.projectId === input.projectId &&
            record.operationId === input.operationId
        ) ?? null
      );
    },

    async insertConfirmation(
      input
    ): Promise<SubmissionWriteResult<SubmissionConfirmationRecord>> {
      await Promise.resolve();
      await hooks.onBeforeConfirmationInsert?.();
      await Promise.resolve();
      assertGuard({
        actorUserId: input.guard.actorUserId,
        projectId: input.projectId,
        requireActiveProject: input.guard.requireActiveProject,
      });
      // The parent package must exist in this Project and target with exactly the
      // identity the confirmation claims (mirrored by the composite foreign key).
      const parent = packages.find(
        (record) =>
          record.id === input.values.packageVersionId &&
          record.projectId === input.projectId &&
          record.targetKind === input.values.targetKind &&
          record.targetId === input.values.targetId
      );
      if (!parent) {
        throw new SubmissionPackageError("package_not_found");
      }
      if (
        parent.manifestSha256 !== input.values.manifestSha256 ||
        parent.version !== input.values.packageVersion
      ) {
        throw new SubmissionPackageError("integrity_conflict");
      }
      // Only the newest version is confirmable, and a version that already carries
      // invalidation evidence can never be confirmed again.
      const targetVersions = packages
        .filter((record) =>
          sameTarget(record, {
            projectId: input.projectId,
            targetId: input.values.targetId,
            targetKind: input.values.targetKind,
          })
        )
        .map((record) => record.version);
      if (Math.max(...targetVersions) !== parent.version) {
        throw new SubmissionPackageError("state_conflict");
      }
      if (
        invalidations.some((record) => record.packageVersionId === parent.id)
      ) {
        throw new SubmissionPackageError("state_conflict");
      }
      if (
        confirmations.some(
          (record) =>
            record.projectId === input.projectId &&
            record.operationId === input.operation.operationId
        )
      ) {
        throw new SubmissionPackageError("idempotency_conflict");
      }
      if (
        confirmations.some(
          (record) =>
            record.projectId === input.projectId &&
            record.packageVersionId === input.values.packageVersionId &&
            record.confirmationType === input.values.confirmationType
        )
      ) {
        throw new SubmissionPackageError("state_conflict");
      }
      const record: SubmissionConfirmationRecord = {
        actorUserId: input.operation.actorUserId,
        confirmationType: input.values.confirmationType,
        confirmedAt: new Date(),
        id: input.values.id,
        manifestSha256: input.values.manifestSha256,
        operationId: input.operation.operationId,
        packageVersion: input.values.packageVersion,
        packageVersionId: input.values.packageVersionId,
        projectId: input.projectId,
        requestSha256: input.operation.requestSha256,
        statementPolicyVersion: input.values.statementPolicyVersion,
        targetId: input.values.targetId,
        targetKind: input.values.targetKind,
        targetVersion: input.values.targetVersion,
      };
      confirmations.push(record);
      return { replayed: false, value: record };
    },

    async listInvalidations(input) {
      await Promise.resolve();
      const ids = new Set(
        packages
          .filter((record) => sameTarget(record, input))
          .map((record) => record.id)
      );
      return invalidations.filter((record) => ids.has(record.packageVersionId));
    },

    async recordInvalidation(input) {
      await Promise.resolve();
      await hooks.onBeforeInvalidation?.();
      await Promise.resolve();
      if (
        invalidations.some(
          (record) =>
            record.confirmationId === input.confirmationId &&
            record.dependencySha256 === input.dependencySha256
        )
      ) {
        return;
      }
      invalidations.push({
        confirmationId: input.confirmationId,
        dependencySha256: input.dependencySha256,
        detectedAt: new Date(),
        detectedByUserId: input.detectedByUserId,
        id: input.id,
        packageVersionId: input.packageVersionId,
        projectId: input.projectId,
        reasonCodes: [...input.reasonCodes],
      });
    },

    async recordFinalization(input) {
      await Promise.resolve();
      await hooks.onBeforeFinalization?.();
      await Promise.resolve();
      // Insert-once: a repeated finalization for the same confirmation replays.
      const existing = finalizations.find(
        (record) => record.confirmationId === input.confirmationId
      );
      if (existing) {
        return existing;
      }
      const record: SubmissionFinalizationRecord = {
        confirmationId: input.confirmationId,
        id: input.id,
        packageVersionId: input.packageVersionId,
        projectId: input.projectId,
        validatedAt: new Date(),
        validatedByUserId: input.validatedByUserId,
        validatedDependencySha256: input.validatedDependencySha256,
      };
      finalizations.push(record);
      return record;
    },

    async listFinalizations(input) {
      await Promise.resolve();
      const ids = new Set(
        packages
          .filter((record) => sameTarget(record, input))
          .map((record) => record.id)
      );
      return finalizations.filter((record) => ids.has(record.packageVersionId));
    },
  };
}
