import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import { PROFESSIONAL_REVIEW_POLICY_VERSION } from "@/lib/professional-review/policy";
import { SERVICE_PAYMENT_POLICY_VERSION } from "@/lib/service-payment/policy";
import {
  MANAGED_HANDOFF_POLICY_VERSION,
  MANAGED_HANDOFF_REQUIRED_SERVICE_MODE,
  type ManagedHandoffCheckedRevisions,
  type ManagedHandoffPaymentPredicate,
  type ManagedHandoffPolicyVersions,
  type ManagedHandoffReasonCode,
  type ManagedHandoffResult,
  managedHandoffReasonCodes,
  managedHandoffRequiredScope,
  managedHandoffRevalidationToken,
  managedHandoffStatusFor,
} from "./policy";
import type { ManagedHandoffPayload, ManagedHandoffPorts } from "./ports";

type Outcome =
  | { kind: "pass" }
  | { kind: "block"; code: ManagedHandoffReasonCode }
  | { kind: "unknown"; code: ManagedHandoffReasonCode };

/**
 * M4-007 deterministic readiness evaluator.
 *
 * Read-only and side-effect free. Every predicate is evaluated in a fixed order
 * and each yields pass / definitive block / unknown. Precedence (frozen): any
 * definitive block wins over any unknown, and any unknown wins over READY.
 *
 * Explicitly *not* readiness inputs: VIP subscription state and M4-003 messaging
 * consent. They are carried as context only and are never consulted below.
 */
export async function evaluateManagedHandoffReadiness(
  input: ManagedHandoffPayload,
  ports: ManagedHandoffPorts
): Promise<ManagedHandoffResult> {
  const blocking: ManagedHandoffReasonCode[] = [];
  const unknown: ManagedHandoffReasonCode[] = [];
  const evidenceRefs = new Set<string>();
  const record = (outcome: Outcome) => {
    if (outcome.kind === "block") {
      blocking.push(outcome.code);
    } else if (outcome.kind === "unknown") {
      unknown.push(outcome.code);
    }
  };

  let paymentPredicate: ManagedHandoffPaymentPredicate = "UNKNOWN";
  const observed: ManagedHandoffCheckedRevisions = {
    agreement: null,
    assignment: null,
    disclosure: null,
    engagement: null,
    membership: null,
    payment: null,
    project: null,
    review: null,
    target: null,
  };

  // 1. Immutable target from the trusted provider (never from the caller).
  const observation = ports.targetProvider.resolve({
    projectId: input.projectId,
    targetId: input.target.targetId,
    targetKind: input.target.targetKind,
  });
  let resolvedTarget: {
    targetSha256: string;
    targetVersion: number;
  } | null = null;
  if (observation.status === "resolved") {
    const identity = observation.identity;
    if (
      identity.projectId !== input.projectId ||
      identity.targetId !== input.target.targetId ||
      identity.targetKind !== input.target.targetKind
    ) {
      record({ kind: "block", code: "target_metadata_untrusted" });
    } else {
      resolvedTarget = {
        targetSha256: identity.targetSha256,
        targetVersion: identity.targetVersion,
      };
      observed.target = `${identity.targetKind}:${identity.targetId}@${identity.targetVersion}:${identity.targetSha256}`;
      evidenceRefs.add(
        `target:${identity.targetKind}:${identity.targetId}@${identity.targetVersion}`
      );
    }
  } else if (observation.status === "unavailable") {
    record({ kind: "unknown", code: "target_provider_unavailable" });
  } else if (observation.status === "unsupported_kind") {
    record({ kind: "block", code: "target_kind_unsupported" });
  } else if (observation.status === "untrusted") {
    record({ kind: "block", code: "target_metadata_untrusted" });
  } else {
    record({ kind: "block", code: "target_not_found" });
  }

  // 2. Project status.
  const project = ports.project.load({ projectId: input.projectId });
  let projectRevision: number | null = null;
  if (project === "unavailable") {
    record({ kind: "unknown", code: "project_state_unavailable" });
  } else if (project.status === "missing") {
    record({ kind: "block", code: "project_not_found" });
  } else if (project.status === "closed") {
    record({ kind: "block", code: "project_not_active" });
    projectRevision = project.revision;
  } else {
    projectRevision = project.revision;
  }

  // 3. Requesting customer membership/ownership.
  const membership = ports.membership.load({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
  });
  if (membership === "unavailable") {
    record({ kind: "unknown", code: "membership_unavailable" });
  } else if (membership.status === "none") {
    record({ kind: "block", code: "actor_not_authorized" });
  } else if (
    membership.expiresAt !== null &&
    Date.parse(membership.expiresAt) <= ports.now().getTime()
  ) {
    record({ kind: "block", code: "membership_expired" });
  }

  // 4. M4-002 named-lawyer assignment.
  const assignment = ports.assignment.load({ projectId: input.projectId });
  if (assignment === "unavailable") {
    record({ kind: "unknown", code: "lawyer_assignment_unavailable" });
  } else if (assignment.status === "missing") {
    record({ kind: "block", code: "lawyer_assignment_missing" });
  } else if (assignment.status === "revoked") {
    record({ kind: "block", code: "lawyer_assignment_revoked" });
  } else if (assignment.status === "pending") {
    record({ kind: "block", code: "lawyer_assignment_pending" });
  }

  // 5. M4-004 engagement + exact service scope.
  const engagement = ports.engagement.load({ projectId: input.projectId });
  let engagementId: string | null = null;
  let engagementRevision: number | null = null;
  if (engagement === "unavailable") {
    record({ kind: "unknown", code: "engagement_unavailable" });
  } else if (engagement.status === "missing") {
    record({ kind: "block", code: "engagement_missing" });
  } else if (engagement.status === "superseded") {
    record({ kind: "block", code: "engagement_superseded" });
  } else {
    engagementId = engagement.engagementId;
    engagementRevision = engagement.revision;
    observed.engagement = engagement.revision;
    const requiredScope = managedHandoffRequiredScope(input.target.targetKind);
    if (!requiredScope || !engagement.scopeCodes.includes(requiredScope)) {
      record({ kind: "block", code: "engagement_scope_mismatch" });
    }
    if (engagement.serviceMode !== MANAGED_HANDOFF_REQUIRED_SERVICE_MODE) {
      record({ kind: "block", code: "engagement_service_mode_mismatch" });
    }
    if (engagement.engagementId) {
      evidenceRefs.add(`engagement:${engagement.engagementId}`);
    }
  }

  // 6. Accepted agreement version with immutable terms hash.
  const agreement = ports.agreement.load({
    engagementId,
    projectId: input.projectId,
  });
  let agreementVersionId: string | null = null;
  if (agreement === "unavailable") {
    record({ kind: "unknown", code: "agreement_unavailable" });
  } else if (agreement.status === "missing") {
    record({ kind: "block", code: "agreement_missing" });
  } else if (agreement.status === "not_accepted") {
    record({ kind: "block", code: "agreement_not_accepted" });
  } else if (agreement.status === "superseded") {
    record({ kind: "block", code: "agreement_superseded" });
  } else {
    agreementVersionId = agreement.agreementVersionId;
    if (agreement.agreementVersionId) {
      evidenceRefs.add(`agreement:${agreement.agreementVersionId}`);
    }
  }

  // 7. Verified signature under a trusted authority policy.
  const signature = ports.signature.load({
    agreementVersionId,
    projectId: input.projectId,
  });
  if (signature === "unavailable") {
    record({ kind: "unknown", code: "signature_authority_unavailable" });
  } else if (signature.status === "missing") {
    record({ kind: "block", code: "signature_missing" });
  } else if (!signature.authorityTrusted) {
    record({ kind: "block", code: "signature_authority_untrusted" });
  } else if (signature.status !== "verified") {
    record({ kind: "block", code: "signature_unverified" });
  }

  // 8. Required resource disclosure (never implied by messaging consent).
  const disclosure = ports.disclosure.load({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    targetId: input.target.targetId,
    targetKind: input.target.targetKind,
  });
  if (disclosure === "unavailable") {
    record({ kind: "unknown", code: "resource_disclosure_unavailable" });
  } else if (disclosure.status === "missing") {
    record({ kind: "block", code: "resource_disclosure_missing" });
  } else if (disclosure.status === "expired") {
    record({ kind: "block", code: "resource_disclosure_expired" });
  }

  // 9. Frozen M4-005 payment predicate.
  const payment = ports.payment.load({
    agreementVersionId,
    engagementId,
    projectId: input.projectId,
  });
  if (payment === "unavailable") {
    paymentPredicate = "UNKNOWN";
    record({ kind: "unknown", code: "payment_state_unavailable" });
  } else if (payment.status === "missing") {
    paymentPredicate = "UNSATISFIED";
    record({ kind: "block", code: "payment_condition_missing" });
  } else if (payment.status === "not_required") {
    if (payment.contractualBasisCode.trim()) {
      paymentPredicate = "NOT_REQUIRED";
      evidenceRefs.add(`payment-condition:${payment.conditionId}`);
    } else {
      paymentPredicate = "UNSATISFIED";
      record({ kind: "block", code: "payment_condition_missing" });
    }
  } else if (payment.status === "satisfied") {
    paymentPredicate = "REQUIRED_SATISFIED";
    evidenceRefs.add(`payment-condition:${payment.conditionId}`);
    if (payment.evidenceId) {
      evidenceRefs.add(`payment-evidence:${payment.evidenceId}`);
    }
  } else if (payment.status === "required_unsatisfied") {
    paymentPredicate = "UNSATISFIED";
    record({ kind: "block", code: "payment_required_unsatisfied" });
  } else if (payment.status === "evidence_pending") {
    paymentPredicate = "UNSATISFIED";
    record({ kind: "block", code: "payment_evidence_pending" });
  } else if (payment.status === "disputed") {
    paymentPredicate = "DISPUTED";
    record({ kind: "block", code: "payment_disputed" });
  } else if (payment.status === "reversed") {
    paymentPredicate = "REVERSED";
    record({ kind: "block", code: "payment_reversed" });
  } else {
    paymentPredicate = "REVERSED";
    record({ kind: "block", code: "payment_void" });
  }

  // 10. Current M4-006 review for exactly this immutable target.
  let reviewRevision: number | null = null;
  if (resolvedTarget) {
    const validity = await ports.review.evaluate({
      assignment: {
        reviewerUserId:
          assignment !== "unavailable" ? assignment.reviewerUserId : null,
        status:
          assignment === "unavailable"
            ? "revoked"
            : assignment.status === "active"
              ? "active"
              : assignment.status === "missing"
                ? "missing"
                : "revoked",
      },
      projectId: input.projectId,
      targetId: input.target.targetId,
      targetKind: input.target.targetKind as ManagedTargetKind,
      targetSha256: resolvedTarget.targetSha256,
      targetVersion: resolvedTarget.targetVersion,
    });
    if (validity.status === "valid") {
      reviewRevision = validity.revision;
      evidenceRefs.add(`professional-review:${validity.reviewRequestId}`);
    } else {
      const map: Record<
        string,
        { code: ManagedHandoffReasonCode; kind: "block" | "unknown" }
      > = {
        professional_credential_unavailable: {
          code: "professional_credential_unavailable",
          kind: "unknown",
        },
        professional_credential_unverified: {
          code: "professional_credential_unverified",
          kind: "block",
        },
        review_authority_revoked: {
          code: "review_authority_revoked",
          kind: "block",
        },
        review_not_approved: { code: "review_not_approved", kind: "block" },
        review_request_missing: { code: "review_missing", kind: "block" },
        review_state_unavailable: {
          code: "review_state_unavailable",
          kind: "unknown",
        },
        review_target_changed: {
          code: "review_target_changed",
          kind: "block",
        },
      };
      const mapped = map[validity.reasonCode];
      record(
        mapped
          ? { kind: mapped.kind, code: mapped.code }
          : { kind: "unknown", code: "review_state_unavailable" }
      );
    }
  } else {
    record({ kind: "unknown", code: "review_state_unavailable" });
  }

  // 11. Customer confirmation from an authoritative policy plus recorded
  //     evidence. A caller-supplied field is never accepted, and "no policy" is
  //     UNKNOWN rather than "not required".
  const confirmation = ports.confirmation.load({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    targetId: input.target.targetId,
    targetKind: input.target.targetKind,
  });
  if (confirmation === "unavailable") {
    record({ kind: "unknown", code: "customer_confirmation_policy_unknown" });
  } else if (confirmation.status === "policy_unknown") {
    record({ kind: "unknown", code: "customer_confirmation_policy_unknown" });
  } else if (confirmation.status === "required_not_confirmed") {
    record({ kind: "block", code: "customer_confirmation_missing" });
  } else if (confirmation.status === "required_and_confirmed") {
    evidenceRefs.add(`customer-confirmation:${confirmation.confirmationRef}`);
  }

  // 12. Concurrency: re-read the authoritative revisions that gate a handoff.
  const projectAfter = ports.project.load({ projectId: input.projectId });
  const engagementAfter = ports.engagement.load({ projectId: input.projectId });
  const projectRevisionAfter =
    projectAfter === "unavailable" || projectAfter.status === "missing"
      ? null
      : projectAfter.revision;
  const engagementRevisionAfter =
    engagementAfter === "unavailable" || engagementAfter.status === "missing"
      ? engagementRevision
      : engagementAfter.revision;
  if (
    (projectRevision !== null &&
      projectRevisionAfter !== null &&
      projectRevisionAfter !== projectRevision) ||
    (engagementRevision !== null &&
      engagementRevisionAfter !== null &&
      engagementRevisionAfter !== engagementRevision)
  ) {
    record({ kind: "unknown", code: "concurrent_revision_change" });
  }

  const reasonCodes = managedHandoffReasonCodes([...blocking, ...unknown]);
  const status = managedHandoffStatusFor({ blocking, unknown });
  const target = {
    targetId: input.target.targetId,
    targetKind: input.target.targetKind,
    targetSha256: resolvedTarget?.targetSha256 ?? null,
    targetVersion: resolvedTarget?.targetVersion ?? null,
  };
  // Observed authoritative vector: revisions where persistence provides one,
  // row identities otherwise. Never a fabricated number.
  observed.project = projectRevision;
  observed.membership =
    membership === "unavailable" ? null : membership.membershipId;
  observed.assignment =
    assignment === "unavailable" ? null : assignment.assignmentId;
  observed.agreement =
    agreement === "unavailable" || !agreement.agreementVersionId
      ? null
      : `${agreement.agreementVersionId}@${agreement.termsSha256 ?? ""}`;
  observed.disclosure =
    disclosure === "unavailable" ? null : disclosure.disclosureId;
  observed.payment =
    payment === "unavailable" || payment.status === "missing"
      ? null
      : payment.conditionId;
  observed.review = reviewRevision;

  const checkedRevisions = observed;
  const policyVersions: ManagedHandoffPolicyVersions = {
    handoff: MANAGED_HANDOFF_POLICY_VERSION,
    payment: SERVICE_PAYMENT_POLICY_VERSION,
    review: PROFESSIONAL_REVIEW_POLICY_VERSION,
  };

  return {
    actorUserId: input.actorUserId,
    checkedAt: ports.now().toISOString(),
    checkedRevisions,
    engagementId,
    evidenceProvenance:
      ports.targetProvider.provenance === "synthetic_test"
        ? "synthetic_test"
        : "production",
    evidenceRefs: [...evidenceRefs].sort(),
    paymentPredicate,
    policyVersion: MANAGED_HANDOFF_POLICY_VERSION,
    projectId: input.projectId,
    reasonCodes,
    policyVersions,
    revalidationToken: managedHandoffRevalidationToken({
      actorUserId: input.actorUserId,
      checkedRevisions,
      paymentPredicate,
      policyVersions,
      projectId: input.projectId,
      reasonCodes,
      status,
      target,
    }),
    status,
    target,
  };
}
