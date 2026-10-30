// biome-ignore-all lint/suspicious/useAwait: these private helpers keep one asynchronous call surface for ports that a
// database or network adapter will implement asynchronously.
import { randomUUID } from "node:crypto";
import {
  canonicalJson,
  isUuid,
  type ManagedTargetIdentity,
  type ManagedTargetKind,
  type ManagedTargetPurpose,
  managedTargetIdentitySha256,
  managedTargetKey,
  sameManagedTargetVersion,
  sha256Hex,
} from "@/lib/managed-target/policy";
import type {
  ProfessionalCredentialVerifier,
  ProfessionalReviewAssignmentStatus,
  ProfessionalReviewAuthority,
  ProfessionalReviewAuthorityAction,
} from "./authority";
import { ProfessionalReviewError } from "./errors";
import {
  evaluateProfessionalReviewValidity,
  isProfessionalReviewAction,
  normalizeProfessionalReviewScope,
  PROFESSIONAL_REVIEW_POLICY_VERSION,
  type ProfessionalCredentialObservation,
  type ProfessionalReviewAction,
  type ProfessionalReviewAssignmentObservation,
  type ProfessionalReviewRecord,
  type ProfessionalReviewScope,
  type ProfessionalReviewState,
  type ProfessionalReviewValidity,
  professionalReviewOperationSha256,
  professionalReviewRequestOperationIdentity,
  professionalReviewScopeValid,
  professionalReviewTransitionAllowed,
} from "./policy";
import type { ProfessionalReviewStore } from "./store";
import {
  type ManagedTargetObservation,
  type ManagedTargetProvider,
  managedTargetObservationMatches,
} from "./target-provider";

/**
 * M4-006 review workflow service.
 *
 * Deterministic and dependency-injected: the store, the professional authority,
 * the credential verifier and the trusted target provider are all ports, so the
 * production composition can be deny-all while tests inject explicit synthetic
 * adapters.
 *
 * Invariants enforced here (not by the caller):
 *   - the target is authoritative from the provider, never from the request body;
 *   - a decision must bind the exact target version/hash that authority approved;
 *   - approvals require a positive credential verification, not a role string;
 *   - state transitions follow the frozen graph;
 *   - revisions are compare-and-set and operations are idempotent.
 */
export type ProfessionalReviewActorContext = {
  actorUserId: string;
  actorRole: string;
  reviewerAssignmentId: string | null;
  reviewerAssignmentStatus: ProfessionalReviewAssignmentStatus;
};

export type ProfessionalReviewServiceDependencies = {
  store: ProfessionalReviewStore;
  authority: ProfessionalReviewAuthority;
  credentialVerifier: ProfessionalCredentialVerifier;
  targetProvider: ManagedTargetProvider;
  now?: () => Date;
  newReviewRequestId?: () => string;
};

const NEXT_STATE: Record<ProfessionalReviewAction, ProfessionalReviewState> = {
  approve: "approved",
  invalidate: "invalidated",
  reject: "rejected",
  request_changes: "changes_requested",
  start_review: "in_review",
};

function mapAuthorityDenial(reasonCode: string): ProfessionalReviewError {
  if (reasonCode === "review_authority_unavailable") {
    return new ProfessionalReviewError("unavailable");
  }
  return new ProfessionalReviewError("authority_denied");
}

function targetFromObservation(
  observation: ManagedTargetObservation
): ManagedTargetIdentity | null {
  return observation.status === "resolved" ? observation.identity : null;
}

function observationFailure(
  observation: ManagedTargetObservation
): ProfessionalReviewError {
  switch (observation.status) {
    case "unsupported_kind":
      return new ProfessionalReviewError("target_kind_unsupported");
    case "untrusted":
      return new ProfessionalReviewError("target_untrusted");
    case "unavailable":
      return new ProfessionalReviewError("unavailable");
    default:
      return new ProfessionalReviewError("target_mismatch");
  }
}

export function createProfessionalReviewService(
  deps: ProfessionalReviewServiceDependencies
) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newReviewRequestId ?? (() => randomUUID());

  async function decide(
    action: ProfessionalReviewAuthorityAction,
    input: {
      actor: ProfessionalReviewActorContext;
      projectId: string;
      target: ManagedTargetIdentity;
      reviewPurpose: ManagedTargetPurpose;
    }
  ) {
    const request = {
      action,
      actorRole: input.actor.actorRole,
      actorUserId: input.actor.actorUserId,
      projectId: input.projectId,
      requestSha256: "",
      reviewPurpose: input.reviewPurpose,
      reviewerAssignmentId: input.actor.reviewerAssignmentId,
      reviewerAssignmentStatus: input.actor.reviewerAssignmentStatus,
      targetBindingSha256: managedTargetIdentitySha256(input.target),
      targetId: input.target.targetId,
      targetKind: input.target.targetKind,
      targetSha256: input.target.targetSha256,
      targetVersion: input.target.targetVersion,
    };
    request.requestSha256 = sha256Hex(canonicalJson({ ...request }));
    const decision = deps.authority.decide(request);
    if (!decision.allowed) {
      throw mapAuthorityDenial(decision.reasonCode);
    }
    return decision;
  }

  async function credential(
    actor: ProfessionalReviewActorContext,
    target: ManagedTargetIdentity
  ): Promise<ProfessionalCredentialObservation> {
    try {
      const result = deps.credentialVerifier.verify({
        actorUserId: actor.actorUserId,
        projectId: target.projectId,
        targetId: target.targetId,
        targetKind: target.targetKind,
      });
      if (result.status === "unavailable") {
        return "unavailable";
      }
      if (result.status === "unverified") {
        return { status: "unverified" };
      }
      return { credentialCode: result.credentialCode, status: "verified" };
    } catch {
      // A verifier that cannot answer is unavailable, never unverified-therefore-approved.
      return "unavailable";
    }
  }

  return {
    async createReviewRequest(input: {
      actor: ProfessionalReviewActorContext;
      operationId: string;
      projectId: string;
      reviewPurpose: ManagedTargetPurpose;
      reviewScope: readonly ProfessionalReviewScope[];
      target: {
        targetId: string;
        targetKind: ManagedTargetKind;
        targetSha256: string;
        targetVersion: number;
      };
    }) {
      if (
        !isUuid(input.projectId) ||
        !isUuid(input.actor.actorUserId) ||
        !professionalReviewScopeValid(input.reviewScope) ||
        !input.operationId
      ) {
        throw new ProfessionalReviewError("invalid_request");
      }
      const observation = deps.targetProvider.resolve({
        projectId: input.projectId,
        targetId: input.target.targetId,
        targetKind: input.target.targetKind,
      });
      const target = targetFromObservation(observation);
      if (
        !target ||
        !managedTargetObservationMatches(observation, {
          projectId: input.projectId,
          targetId: input.target.targetId,
          targetKind: input.target.targetKind,
          targetSha256: input.target.targetSha256,
          targetVersion: input.target.targetVersion,
        })
      ) {
        throw observationFailure(observation);
      }
      await decide("request_review", {
        actor: input.actor,
        projectId: input.projectId,
        reviewPurpose: input.reviewPurpose,
        target,
      });
      const scope = normalizeProfessionalReviewScope(input.reviewScope);
      const requestSha256 = professionalReviewRequestOperationIdentity({
        actorUserId: input.actor.actorUserId,
        projectId: input.projectId,
        reviewPurpose: input.reviewPurpose,
        reviewScope: scope,
        targetBindingSha256: managedTargetIdentitySha256(target),
      });
      const existing = await deps.store.findOperation(input.operationId);
      if (existing) {
        if (existing.requestSha256 !== requestSha256) {
          throw new ProfessionalReviewError("idempotency_conflict");
        }
        return { record: existing, replayed: true };
      }
      const record: ProfessionalReviewRecord = {
        decision: null,
        operationId: input.operationId,
        projectId: input.projectId,
        requestSha256,
        requestedAt: now().toISOString(),
        requestedByUserId: input.actor.actorUserId,
        reviewPurpose: input.reviewPurpose,
        reviewRequestId: newId(),
        reviewScope: scope,
        reviewerUserId: null,
        revision: 1,
        state: "requested",
        target,
        targetBindingSha256: managedTargetIdentitySha256(target),
      };
      return deps.store.create(record);
    },

    async recordDecision(input: {
      action: string;
      actor: ProfessionalReviewActorContext;
      boundTargetSha256: string;
      boundTargetVersion: number;
      comment?: string | null;
      expectedRevision: number;
      operationId: string;
      projectId: string;
      reasonCode?: string | null;
      reviewRequestId: string;
    }) {
      if (
        !isProfessionalReviewAction(input.action) ||
        !isUuid(input.projectId) ||
        !isUuid(input.reviewRequestId) ||
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 1 ||
        (input.comment ?? "").length > 512
      ) {
        throw new ProfessionalReviewError("invalid_request");
      }
      const action = input.action as ProfessionalReviewAction;
      const record = await deps.store.load(input.reviewRequestId);
      if (!record || record.projectId !== input.projectId) {
        throw new ProfessionalReviewError("not_found");
      }
      const commentSha256 = input.comment?.trim()
        ? sha256Hex(input.comment.trim())
        : null;
      const reasonCode = input.reasonCode?.trim()
        ? input.reasonCode.trim().slice(0, 64)
        : null;
      const requestSha256 = professionalReviewOperationSha256({
        action,
        actorUserId: input.actor.actorUserId,
        boundTargetSha256: input.boundTargetSha256,
        boundTargetVersion: input.boundTargetVersion,
        commentSha256,
        expectedRevision: input.expectedRevision,
        projectId: record.projectId,
        reasonCode,
        reviewRequestId: record.reviewRequestId,
      });
      // Exact replay is answered before any state, target or authority check: an
      // already-applied operation must stay idempotent even after the record moved
      // on, while a changed request under the same operationId is a conflict.
      const replay = await deps.store.findOperation(input.operationId);
      if (replay) {
        if (replay.requestSha256 !== requestSha256) {
          throw new ProfessionalReviewError("idempotency_conflict");
        }
        return { record: replay, replayed: true };
      }
      if (record.revision !== input.expectedRevision) {
        throw new ProfessionalReviewError("revision_conflict");
      }
      if (!professionalReviewTransitionAllowed(record.state, action)) {
        throw new ProfessionalReviewError("state_conflict");
      }
      let observation: ManagedTargetObservation = {
        status: "unavailable",
      };
      if (action !== "invalidate") {
        observation = deps.targetProvider.resolve({
          projectId: record.projectId,
          targetId: record.target.targetId,
          targetKind: record.target.targetKind,
        });
        const currentTarget = targetFromObservation(observation);
        if (
          !currentTarget ||
          !sameManagedTargetVersion(currentTarget, {
            targetSha256: input.boundTargetSha256,
            targetVersion: input.boundTargetVersion,
          })
        ) {
          throw new ProfessionalReviewError("state_conflict");
        }
      }
      const authority = await decide("record_decision", {
        actor: input.actor,
        projectId: record.projectId,
        reviewPurpose: record.reviewPurpose,
        target: record.target,
      });
      let credentialCode: string | null = null;
      if (action === "approve") {
        const verified = await credential(input.actor, record.target);
        if (verified === "unavailable" || verified.status !== "verified") {
          throw new ProfessionalReviewError(
            verified === "unavailable" ? "unavailable" : "authority_denied"
          );
        }
        credentialCode = verified.credentialCode;
      }
      const next: ProfessionalReviewRecord = {
        ...record,
        decision: {
          action,
          authorityCode: authority.authorityCode,
          boundTargetSha256: input.boundTargetSha256,
          boundTargetVersion: input.boundTargetVersion,
          commentSha256,
          credentialCode,
          decidedAt: now().toISOString(),
          decidedByUserId: input.actor.actorUserId,
          reasonCode,
          revision: record.revision + 1,
        },
        operationId: input.operationId,
        requestSha256,
        reviewerUserId: record.reviewerUserId ?? input.actor.actorUserId,
        state: NEXT_STATE[action] ?? record.state,
      };
      return deps.store.append({
        expectedRevision: input.expectedRevision,
        record: next,
      });
    },

    async evaluateCurrentValidity(input: {
      assignment: ProfessionalReviewAssignmentObservation;
      credential?: ProfessionalCredentialObservation;
      projectId: string;
      targetId: string;
      targetKind: ManagedTargetKind;
      targetSha256: string;
      targetVersion: number;
    }): Promise<ProfessionalReviewValidity> {
      if (!isUuid(input.projectId)) {
        throw new ProfessionalReviewError("invalid_request");
      }
      const record = await deps.store.findCurrent({
        projectId: input.projectId,
        targetId: input.targetId,
        targetKind: input.targetKind,
      });
      const observation = deps.targetProvider.resolve({
        projectId: input.projectId,
        targetId: input.targetId,
        targetKind: input.targetKind,
      });
      const currentTarget = targetFromObservation(observation);
      const requestedTargetMatches =
        currentTarget !== null &&
        currentTarget.projectId === input.projectId &&
        currentTarget.targetId === input.targetId &&
        currentTarget.targetKind === input.targetKind;
      const credentialObservation =
        input.credential ??
        (record
          ? await credential(
              {
                actorRole: "",
                actorUserId: record.reviewerUserId ?? record.requestedByUserId,
                reviewerAssignmentId: null,
                reviewerAssignmentStatus: "active",
              },
              record.target
            )
          : "unavailable");
      return evaluateProfessionalReviewValidity({
        assignment: input.assignment,
        credential: credentialObservation,
        currentTarget: requestedTargetMatches
          ? {
              targetSha256: currentTarget.targetSha256,
              targetVersion: currentTarget.targetVersion,
            }
          : null,
        providerTrustsTarget: observation.status === "resolved",
        record,
      });
    },

    /** Privacy-safe projection: no package content and no reviewer free text. */
    async readReview(input: {
      actor: ProfessionalReviewActorContext;
      projectId: string;
      reviewRequestId: string;
    }) {
      const record = await deps.store.load(input.reviewRequestId);
      if (!record || record.projectId !== input.projectId) {
        throw new ProfessionalReviewError("not_found");
      }
      await decide("read_review", {
        actor: input.actor,
        projectId: record.projectId,
        reviewPurpose: record.reviewPurpose,
        target: record.target,
      });
      return {
        decision: record.decision
          ? {
              action: record.decision.action,
              authorityCode: record.decision.authorityCode,
              boundTargetSha256: record.decision.boundTargetSha256,
              boundTargetVersion: record.decision.boundTargetVersion,
              commentSha256: record.decision.commentSha256,
              credentialCode: record.decision.credentialCode,
              decidedAt: record.decision.decidedAt,
              reasonCode: record.decision.reasonCode,
              revision: record.decision.revision,
            }
          : null,
        policyVersion: PROFESSIONAL_REVIEW_POLICY_VERSION,
        projectId: record.projectId,
        requestedAt: record.requestedAt,
        reviewPurpose: record.reviewPurpose,
        reviewRequestId: record.reviewRequestId,
        reviewScope: [...record.reviewScope],
        revision: record.revision,
        state: record.state,
        target: {
          targetId: record.target.targetId,
          targetKind: record.target.targetKind,
          targetSha256: record.target.targetSha256,
          targetVersion: record.target.targetVersion,
        },
        targetBindingSha256: record.targetBindingSha256,
        targetKey: managedTargetKey(record.target),
      };
    },

    async listHistory(input: {
      actor: ProfessionalReviewActorContext;
      projectId: string;
      reviewRequestId: string;
    }) {
      const record = await deps.store.load(input.reviewRequestId);
      if (!record || record.projectId !== input.projectId) {
        throw new ProfessionalReviewError("not_found");
      }
      await decide("read_review", {
        actor: input.actor,
        projectId: record.projectId,
        reviewPurpose: record.reviewPurpose,
        target: record.target,
      });
      const history = await deps.store.listHistory(input.reviewRequestId);
      return history.map((entry) => ({
        action: entry.decision?.action ?? null,
        authorityCode: entry.decision?.authorityCode ?? null,
        boundTargetSha256: entry.decision?.boundTargetSha256 ?? null,
        boundTargetVersion: entry.decision?.boundTargetVersion ?? null,
        decidedAt: entry.decision?.decidedAt ?? null,
        revision: entry.revision,
        state: entry.state,
      }));
    },
  };
}

export type ProfessionalReviewService = ReturnType<
  typeof createProfessionalReviewService
>;
