import { randomUUID } from "node:crypto";
import { SubmissionAuthorizationError } from "./contracts";
import type {
  AuthorizationActorContext,
  AuthorizationMembershipStatus,
  AuthorizationWriteGuard,
  NewSubmissionAuthorizationValues,
  NewSubmissionExternalRecordValues,
  NewSubmissionHandoffValues,
  SubmissionAuthorizationRecord,
  SubmissionAuthorizationStore,
  SubmissionExternalRecord,
  SubmissionHandoffEventRecord,
  SubmissionHandoffRecord,
} from "./ports";

/**
 * Phase 13 M8.2 - in-memory store for offline contract tests.
 *
 * It reproduces the database-owned invariants the real repository relies on, so a
 * test proves the *service* contract rather than an easier fiction:
 *
 *   - `unique (projectId, operationId)` per row family (insert-once replay);
 *   - append-only authorizations and external records;
 *   - one live handoff per package version;
 *   - compare-and-set handoff transitions with an append-only event per transition;
 *   - terminal handoff states never move again.
 *
 * `await Promise.resolve()` yields are deliberate: they let concurrent callers
 * interleave exactly as two database sessions would.
 */

export type AuthorizationTestAccount = {
  readonly registeredCustomer: boolean;
  readonly staff: boolean;
  readonly staffRole?: string | null;
};

export type AuthorizationTestProject = {
  readonly ownerUserId: string;
  status: "active" | "closed";
  readonly members: Map<string, "active" | "pending" | "revoked">;
  readonly assignments: Map<
    string,
    { readonly id: string; status: "active" | "pending" | "revoked" }
  >;
};

export type AuthorizationTestWorld = {
  readonly accounts: Map<string, AuthorizationTestAccount>;
  readonly projects: Map<string, AuthorizationTestProject>;
};

export function createAuthorizationTestWorld(): AuthorizationTestWorld {
  return { accounts: new Map(), projects: new Map() };
}

function membershipStatus(
  project: AuthorizationTestProject,
  actorUserId: string
): AuthorizationMembershipStatus {
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
export type AuthorizationTestHooks = {
  onBeforeAuthorizationInsert?: () => void | Promise<void>;
  onBeforeHandoffInsert?: () => void | Promise<void>;
  onBeforeHandoffTransition?: () => void | Promise<void>;
  onBeforeExternalRecordInsert?: () => void | Promise<void>;
};

export function createInMemorySubmissionAuthorizationStore(
  world: AuthorizationTestWorld,
  hooks: AuthorizationTestHooks = {}
): SubmissionAuthorizationStore {
  const authorizations: SubmissionAuthorizationRecord[] = [];
  const handoffs: SubmissionHandoffRecord[] = [];
  const handoffEvents: SubmissionHandoffEventRecord[] = [];
  const externalRecords: SubmissionExternalRecord[] = [];

  function assertGuard(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly guard: AuthorizationWriteGuard;
  }): void {
    const account = world.accounts.get(input.actorUserId);
    const project = world.projects.get(input.projectId);
    if (!project) {
      throw new SubmissionAuthorizationError("project_not_found");
    }
    if (input.guard.allowAssignedStaff) {
      if (!account || !account.staff) {
        throw new SubmissionAuthorizationError("actor_not_eligible");
      }
      const assignment = project.assignments.get(input.actorUserId);
      if (!assignment || assignment.status !== "active") {
        throw new SubmissionAuthorizationError("handoff_actor_not_authorized");
      }
    } else {
      if (!account || !account.registeredCustomer || account.staff) {
        throw new SubmissionAuthorizationError("actor_not_eligible");
      }
      const membership = membershipStatus(project, input.actorUserId);
      if (membership !== "owner" && membership !== "active_member") {
        throw new SubmissionAuthorizationError("project_forbidden");
      }
    }
    if (input.guard.requireActiveProject && project.status !== "active") {
      throw new SubmissionAuthorizationError("project_closed");
    }
  }

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

  return {
    async readActorContext(input): Promise<AuthorizationActorContext> {
      await Promise.resolve();
      const account = world.accounts.get(input.actorUserId);
      const project = world.projects.get(input.projectId);
      const assignment = project?.assignments.get(input.actorUserId) ?? null;
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
        registeredCustomer: account?.registeredCustomer ?? false,
        staff: account?.staff ?? false,
        staffAssignment: assignment
          ? {
              id: assignment.id,
              reviewerUserId: input.actorUserId,
              status: assignment.status,
            }
          : null,
        staffRole: account?.staffRole ?? null,
      };
    },

    async listAuthorizations(input) {
      await Promise.resolve();
      return authorizations.filter((record) => sameTarget(record, input));
    },

    async findAuthorizationOperation(input) {
      await Promise.resolve();
      return (
        authorizations.find(
          (record) =>
            record.projectId === input.projectId &&
            record.operationId === input.operationId
        ) ?? null
      );
    },

    async insertAuthorization(input) {
      await hooks.onBeforeAuthorizationInsert?.();
      await Promise.resolve();
      assertGuard({
        actorUserId: input.operation.actorUserId,
        guard: input.guard,
        projectId: input.projectId,
      });
      const existing = authorizations.find(
        (record) =>
          record.projectId === input.projectId &&
          record.operationId === input.operation.operationId
      );
      if (existing) {
        if (existing.requestSha256 !== input.operation.requestSha256) {
          throw new SubmissionAuthorizationError("idempotency_conflict");
        }
        return { replayed: true, value: existing };
      }
      if (
        authorizations.some(
          (record) =>
            record.projectId === input.projectId &&
            record.targetKind === input.values.targetKind &&
            record.targetId === input.values.targetId &&
            record.authorizationType === input.values.authorizationType &&
            record.bindingSha256 === input.values.bindingSha256
        )
      ) {
        // The unique binding index in migration 0052 makes a concurrent duplicate
        // impossible; the same rule is enforced here so a race is visible in a test
        // rather than only in production.
        throw new SubmissionAuthorizationError("integrity_conflict");
      }
      const values: NewSubmissionAuthorizationValues = input.values;
      const record: SubmissionAuthorizationRecord = {
        acknowledgedDisclosures: [...values.acknowledgedDisclosures],
        actorUserId: input.operation.actorUserId,
        authorizationType: values.authorizationType,
        authorizedAt: new Date(),
        bindingSha256: values.bindingSha256,
        disclosurePolicyVersion: values.disclosurePolicyVersion,
        id: values.id,
        manifestSha256: values.manifestSha256,
        operationId: input.operation.operationId,
        packageVersion: values.packageVersion,
        packageVersionId: values.packageVersionId,
        projectId: input.projectId,
        requestSha256: input.operation.requestSha256,
        targetId: values.targetId,
        targetKind: values.targetKind,
        targetVersion: values.targetVersion,
      };
      authorizations.push(record);
      return { replayed: false, value: record };
    },

    async listHandoffs(input) {
      await Promise.resolve();
      return handoffs.filter((record) => sameTarget(record, input));
    },

    async findHandoffOperation(input) {
      await Promise.resolve();
      return (
        handoffs.find(
          (record) =>
            record.projectId === input.projectId &&
            record.operationId === input.operationId
        ) ?? null
      );
    },

    async insertHandoff(input) {
      await hooks.onBeforeHandoffInsert?.();
      await Promise.resolve();
      assertGuard({
        actorUserId: input.operation.actorUserId,
        guard: input.guard,
        projectId: input.projectId,
      });
      const existing = handoffs.find(
        (record) =>
          record.projectId === input.projectId &&
          record.operationId === input.operation.operationId
      );
      if (existing) {
        if (existing.requestSha256 !== input.operation.requestSha256) {
          throw new SubmissionAuthorizationError("idempotency_conflict");
        }
        return { replayed: true, value: existing };
      }
      if (
        handoffs.some(
          (record) =>
            record.packageVersionId === input.values.packageVersionId &&
            (record.status === "requested" || record.status === "accepted")
        )
      ) {
        // One live handoff per package version, enforced by a partial unique index in
        // the database and by the same rule here.
        throw new SubmissionAuthorizationError("handoff_state_conflict");
      }
      const values: NewSubmissionHandoffValues = input.values;
      const timestamp = new Date();
      const record: SubmissionHandoffRecord = {
        authorizationId: values.authorizationId,
        createdAt: timestamp,
        id: values.id,
        manifestSha256: values.manifestSha256,
        operationId: input.operation.operationId,
        packageVersion: values.packageVersion,
        packageVersionId: values.packageVersionId,
        projectId: input.projectId,
        recipientUserId: values.recipientUserId,
        requestSha256: input.operation.requestSha256,
        requestedByUserId: input.operation.actorUserId,
        revision: 1,
        status: "requested",
        targetId: values.targetId,
        targetKind: values.targetKind,
        updatedAt: timestamp,
      };
      handoffs.push(record);
      handoffEvents.push({
        actorUserId: input.operation.actorUserId,
        createdAt: timestamp,
        handoffId: record.id,
        id: randomUUID(),
        projectId: input.projectId,
        reasonCode: null,
        status: "requested",
      });
      return { replayed: false, value: record };
    },

    async transitionHandoff(input) {
      await hooks.onBeforeHandoffTransition?.();
      await Promise.resolve();
      assertGuard({
        actorUserId: input.actorUserId,
        guard: input.guard,
        projectId: input.projectId,
      });
      const index = handoffs.findIndex(
        (record) =>
          record.projectId === input.projectId && record.id === input.handoffId
      );
      const current = handoffs[index];
      if (!current) {
        throw new SubmissionAuthorizationError("handoff_not_found");
      }
      if (current.revision !== input.expectedRevision) {
        throw new SubmissionAuthorizationError("revision_conflict");
      }
      if (
        !(current.status === "requested" || current.status === "accepted") ||
        current.status === input.toStatus
      ) {
        throw new SubmissionAuthorizationError("handoff_state_conflict");
      }
      const next: SubmissionHandoffRecord = {
        ...current,
        revision: current.revision + 1,
        status: input.toStatus,
        updatedAt: new Date(),
      };
      handoffs[index] = next;
      handoffEvents.push({
        actorUserId: input.actorUserId,
        createdAt: next.updatedAt,
        handoffId: next.id,
        id: input.eventId,
        projectId: input.projectId,
        reasonCode: input.reasonCode,
        status: input.toStatus,
      });
      return next;
    },

    async listHandoffEvents(input) {
      await Promise.resolve();
      return handoffEvents
        .filter(
          (event) =>
            event.projectId === input.projectId &&
            event.handoffId === input.handoffId
        )
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
        );
    },

    async listExternalRecords(input) {
      await Promise.resolve();
      return externalRecords
        .filter((record) => sameTarget(record, input))
        .sort(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
        );
    },

    async findExternalRecordOperation(input) {
      await Promise.resolve();
      return (
        externalRecords.find(
          (record) =>
            record.projectId === input.projectId &&
            record.operationId === input.operationId
        ) ?? null
      );
    },

    async insertExternalRecord(input) {
      await hooks.onBeforeExternalRecordInsert?.();
      await Promise.resolve();
      assertGuard({
        actorUserId: input.operation.actorUserId,
        guard: input.guard,
        projectId: input.projectId,
      });
      const existing = externalRecords.find(
        (record) =>
          record.projectId === input.projectId &&
          record.operationId === input.operation.operationId
      );
      if (existing) {
        if (existing.requestSha256 !== input.operation.requestSha256) {
          throw new SubmissionAuthorizationError("idempotency_conflict");
        }
        return { replayed: true, value: existing };
      }
      const values: NewSubmissionExternalRecordValues = input.values;
      const record: SubmissionExternalRecord = {
        channel: values.channel,
        createdAt: new Date(),
        handoffId: values.handoffId,
        id: values.id,
        kind: values.kind,
        occurredAt: values.occurredAt,
        operationId: input.operation.operationId,
        outcomeCode: values.outcomeCode,
        packageVersionId: values.packageVersionId,
        projectId: input.projectId,
        provenance: values.provenance,
        reference: values.reference,
        reportedByUserId: input.operation.actorUserId,
        requestSha256: input.operation.requestSha256,
        targetId: values.targetId,
        targetKind: values.targetKind,
        verification: values.verification,
        verifierCode: values.verifierCode,
      };
      externalRecords.push(record);
      return { replayed: false, value: record };
    },
  };
}
