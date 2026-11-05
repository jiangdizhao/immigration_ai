import type { ManagedHandoffResult } from "@/lib/managed-handoff/policy";
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import {
  AUTHORIZATION_TYPE_MODE,
  type AuthorizationValidityReason,
  type AuthorizationValidityStatus,
  authorizationDigest,
  type DerivedSubmissionState,
  EXTERNAL_EVIDENCE_PROVENANCES,
  type ExternalEvidenceProvenance,
  type ExternalEvidenceVerification,
  type ExternalOutcomeCode,
  type ExternalRecordKind,
  type ExternalSubmissionChannel,
  SUBMISSION_AUTHORIZATION_DISCLOSURE_POLICY_VERSION,
  SUBMISSION_HANDOFF_STATUSES,
  SUBMISSION_HANDOFF_TRANSITIONS,
  type SubmissionAuthorizationType,
  type SubmissionHandoffStatus,
} from "./contracts";

/**
 * Phase 13 M8.2 - deterministic authorization policy.
 *
 * Everything in this module is pure: no database, no HTTP, no clock and no provider.
 * It answers four separate questions and refuses to blur them:
 *
 *   1. is the *exact package version* the current one, intact, fresh and confirmed?
 *      (answered only from M8.1 evidence, never from the presence of a row)
 *   2. is the *M4 managed-service* predicate set currently satisfied?
 *   3. may this authorization be relied on right now?
 *   4. what may an external-evidence record actually claim?
 *
 * Question 4 is deliberately one-way: an authorization is not an input, so no
 * authorization can ever produce "submitted".
 */

/** M8.1 confirmation evidence, copied from the exact package view. */
export type ExactPackageConfirmationEvidence = {
  readonly confirmationId: string;
  readonly confirmationType: string;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly manifestSha256: string;
  /** M8.1: dependencies hold, no invalidation evidence, validation completed. */
  readonly current: boolean;
  readonly finalized: boolean;
  readonly invalidatedReasonCodes: readonly string[];
};

/** One immutable M8.1 package version, as the M8.1 service reported it. */
export type ExactPackageEvidence = {
  readonly packageVersionId: string;
  readonly version: number;
  readonly targetVersion: number;
  readonly manifestSha256: string;
  readonly integrityVerified: boolean;
  readonly freshness: {
    readonly current: boolean;
    readonly reasonCodes: readonly string[];
  };
  readonly confirmations: readonly ExactPackageConfirmationEvidence[];
};

export type ExactPackageAssessment = {
  readonly status: "valid" | "invalid" | "unknown";
  readonly reasonCodes: readonly AuthorizationValidityReason[];
  /** Raw M8.1 staleness codes, preserved for display and diagnostics. */
  readonly staleReasonCodes: readonly string[];
  readonly package: ExactPackageEvidence | null;
  /** Confirmations this assessment actually relied upon. */
  readonly effectiveConfirmationIds: readonly string[];
};
/**
 * Assess the exact package the caller named.
 *
 * The requested version must *be* the current one: authorizing an older version
 * while a newer version exists is refused, and an already-superseded version can
 * never be re-authorized by pointing at it directly.
 */
export function assessExactPackage(input: {
  readonly packages: readonly ExactPackageEvidence[];
  readonly currentPackageVersionId: string | null;
  readonly packageVersionId: string;
  readonly requiredConfirmations: readonly string[];
}): ExactPackageAssessment {
  const candidate =
    input.packages.find(
      (entry) => entry.packageVersionId === input.packageVersionId
    ) ?? null;
  if (candidate === null) {
    return {
      effectiveConfirmationIds: [],
      package: null,
      reasonCodes: ["package_not_current"],
      staleReasonCodes: [],
      status: "invalid",
    };
  }
  if (
    input.currentPackageVersionId === null ||
    candidate.packageVersionId !== input.currentPackageVersionId
  ) {
    return {
      effectiveConfirmationIds: [],
      package: candidate,
      reasonCodes: ["package_not_current"],
      staleReasonCodes: candidate.freshness.reasonCodes,
      status: "invalid",
    };
  }

  const reasons = new Set<AuthorizationValidityReason>();
  if (!candidate.integrityVerified) {
    reasons.add("package_integrity_unverified");
  }
  if (!candidate.freshness.current) {
    reasons.add("package_freshness_lost");
  }

  const effective: string[] = [];
  for (const required of input.requiredConfirmations) {
    const matching = candidate.confirmations.filter(
      (confirmation) =>
        confirmation.confirmationType === required &&
        confirmation.packageVersionId === candidate.packageVersionId
    );
    if (matching.length === 0) {
      reasons.add("confirmation_missing");
      continue;
    }
    const current = matching.filter((confirmation) => confirmation.current);
    if (current.length === 0) {
      // Distinguish "recorded but never validated" from "recorded then invalidated",
      // so the customer sees an honest reason instead of a generic failure.
      const unfinalized = matching.every(
        (confirmation) => !confirmation.finalized
      );
      reasons.add(
        unfinalized ? "confirmation_not_finalized" : "confirmation_not_current"
      );
      continue;
    }
    effective.push(
      ...current.map((confirmation) => confirmation.confirmationId)
    );
  }

  if (reasons.size > 0) {
    return {
      effectiveConfirmationIds: [],
      package: candidate,
      reasonCodes: sortAuthorizationReasons(reasons),
      staleReasonCodes: candidate.freshness.reasonCodes,
      status: "invalid",
    };
  }
  return {
    effectiveConfirmationIds: effective,
    package: candidate,
    reasonCodes: [],
    staleReasonCodes: [],
    status: "valid",
  };
}

/** Disclosures required before an authorization can be recorded, by type. */
export const SUBMISSION_AUTHORIZATION_DISCLOSURES = {
  managed_service_professional_handoff: [
    "named_professional_performs_external_submission",
    "engagement_terms_and_payment_apply",
    "professional_review_of_this_exact_version_required",
    "no_submission_before_handoff_acceptance",
    "no_outcome_guaranteed",
    "external_evidence_recorded_with_provenance",
  ],
  self_service_external_submission: [
    "customer_performs_external_submission_personally",
    "no_professional_review_included",
    "no_legal_correctness_asserted",
    "platform_does_not_submit_or_receive_receipts",
    "customer_responsible_for_accuracy_and_deadlines",
    "external_outcomes_remain_unverified",
  ],
} as const satisfies Record<SubmissionAuthorizationType, readonly string[]>;

export function requiredDisclosures(
  type: SubmissionAuthorizationType
): readonly string[] {
  return SUBMISSION_AUTHORIZATION_DISCLOSURES[type];
}

/** Every required disclosure must be acknowledged; extras are ignored. */
export function missingDisclosures(input: {
  readonly acknowledged: readonly unknown[];
  readonly required: readonly string[];
}): readonly string[] {
  const acknowledged = new Set(
    input.acknowledged.filter(
      (entry): entry is string => typeof entry === "string"
    )
  );
  return input.required.filter((entry) => !acknowledged.has(entry));
}

/**
 * The exact identity an authorization is bound to.
 *
 * A changed package version, manifest digest, target version, actor or disclosure
 * policy is a different authorization. The server recomputes this and never accepts
 * a browser-supplied digest as evidence of what the customer authorized.
 */
export type SubmissionAuthorizationBinding = {
  readonly projectId: string;
  readonly actorUserId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly targetVersion: number;
  readonly manifestSha256: string;
  readonly authorizationType: SubmissionAuthorizationType;
  readonly disclosurePolicyVersion: string;
};

export function authorizationBindingSha256(
  binding: SubmissionAuthorizationBinding
): string {
  return authorizationDigest({
    actorUserId: binding.actorUserId,
    authorizationType: binding.authorizationType,
    disclosurePolicyVersion: binding.disclosurePolicyVersion,
    manifestSha256: binding.manifestSha256,
    packageVersion: binding.packageVersion,
    packageVersionId: binding.packageVersionId,
    projectId: binding.projectId,
    targetId: binding.targetId,
    targetKind: binding.targetKind,
    targetVersion: binding.targetVersion,
  });
}

export function authorizationMode(
  type: SubmissionAuthorizationType
): (typeof AUTHORIZATION_TYPE_MODE)[SubmissionAuthorizationType] {
  return AUTHORIZATION_TYPE_MODE[type];
}

/**
 * M4-007 reason codes grouped by the M8.2 reason they imply. The mapping is static
 * so a new M4 code can never silently become "ready": an unmapped block reason still
 * blocks, it just reports the generic code.
 */
const REVIEW_REASON_MAP: Record<string, AuthorizationValidityReason> = {
  professional_credential_unavailable: "professional_credential_unverified",
  professional_credential_unverified: "professional_credential_unverified",
  review_authority_denied: "professional_authority_denied",
  review_authority_revoked: "professional_authority_denied",
  review_missing: "professional_review_not_approved",
  review_not_approved: "professional_review_not_approved",
  review_state_unavailable: "managed_readiness_unknown",
  review_target_changed: "professional_review_not_approved",
};

export type ManagedGateEvidence = ManagedHandoffResult | "unavailable" | null;

export type ManagedGateAssessment = {
  readonly status: AuthorizationValidityStatus;
  readonly reasonCodes: readonly AuthorizationValidityReason[];
  readonly readinessStatus: "READY" | "NOT_READY" | "UNKNOWN" | "unavailable";
  /** The raw M4-007 codes, preserved for the lawyer-facing explanation. */
  readonly readinessReasonCodes: readonly string[];
  readonly evidenceProvenance: "production" | "synthetic_test" | "unknown";
};

/**
 * Translate the M4-007 readiness result into an M8.2 gate.
 *
 * `READY` is necessary but not sufficient: the caller still requires an effective
 * exact-package authorization. A cached or historical READY is never relied upon -
 * the readiness port is re-invoked at every durable transition.
 */
export function assessManagedGate(
  evidence: ManagedGateEvidence
): ManagedGateAssessment {
  if (evidence === "unavailable" || evidence === null) {
    return {
      evidenceProvenance: "unknown",
      readinessReasonCodes: [],
      readinessStatus: "unavailable",
      reasonCodes: ["managed_readiness_unknown"],
      status: "unknown",
    };
  }
  const provenance = evidence.evidenceProvenance;
  if (evidence.status === "READY") {
    return {
      evidenceProvenance: provenance,
      readinessReasonCodes: [],
      readinessStatus: "READY",
      reasonCodes: [],
      status: "effective",
    };
  }
  const mapped = new Set<AuthorizationValidityReason>();
  for (const code of evidence.reasonCodes) {
    const reason = REVIEW_REASON_MAP[code];
    if (reason) {
      mapped.add(reason);
    }
  }
  if (evidence.status === "UNKNOWN") {
    mapped.add("managed_readiness_unknown");
    return {
      evidenceProvenance: provenance,
      readinessReasonCodes: [...evidence.reasonCodes],
      readinessStatus: "UNKNOWN",
      reasonCodes: sortAuthorizationReasons(mapped),
      status: "unknown",
    };
  }
  mapped.add("managed_readiness_not_ready");
  return {
    evidenceProvenance: provenance,
    readinessReasonCodes: [...evidence.reasonCodes],
    readinessStatus: "NOT_READY",
    reasonCodes: sortAuthorizationReasons(mapped),
    status: "ineffective",
  };
}

export function sortAuthorizationReasons(
  reasons: Iterable<AuthorizationValidityReason>
): AuthorizationValidityReason[] {
  return [...new Set(reasons)].sort();
}

/** Stored authorization evidence, without any derived field. */
export type StoredAuthorizationEvidence = {
  readonly authorizationId: string;
  readonly authorizationType: SubmissionAuthorizationType;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly targetVersion: number;
  readonly manifestSha256: string;
  readonly disclosurePolicyVersion: string;
  readonly acknowledgedDisclosures: readonly string[];
};

export type AuthorizationAssessment = {
  readonly status: AuthorizationValidityStatus;
  readonly reasonCodes: readonly AuthorizationValidityReason[];
};

/**
 * Is this authorization effective *now*?
 *
 * It is effective only while the exact package it names is still the current,
 * intact, fresh and confirmed version and (for managed authorization) while the M4
 * predicate set is still satisfied. Anything unreadable is `unknown`, never
 * effective.
 */
export function assessAuthorizationValidity(input: {
  readonly authorization: StoredAuthorizationEvidence;
  readonly assessment: ExactPackageAssessment;
  readonly managed: ManagedGateAssessment | null;
}): AuthorizationAssessment {
  if (
    input.authorization.disclosurePolicyVersion !==
    SUBMISSION_AUTHORIZATION_DISCLOSURE_POLICY_VERSION
  ) {
    // Different disclosure terms require fresh consent: an old acknowledgement is
    // not consent to a policy the customer never saw.
    return {
      reasonCodes: ["confirmation_policy_unknown"],
      status: "ineffective",
    };
  }
  const reasons = new Set<AuthorizationValidityReason>(
    input.assessment.reasonCodes
  );
  const pkg = input.assessment.package;
  if (
    pkg !== null &&
    (pkg.manifestSha256 !== input.authorization.manifestSha256 ||
      pkg.packageVersionId !== input.authorization.packageVersionId ||
      pkg.version !== input.authorization.packageVersion ||
      pkg.targetVersion !== input.authorization.targetVersion)
  ) {
    reasons.add("package_not_current");
  }
  if (
    missingDisclosures({
      acknowledged: input.authorization.acknowledgedDisclosures,
      required: requiredDisclosures(input.authorization.authorizationType),
    }).length > 0
  ) {
    reasons.add("confirmation_policy_unknown");
  }
  if (input.assessment.status === "unknown") {
    return {
      reasonCodes: sortAuthorizationReasons(
        reasons.size > 0 ? reasons : ["source_unavailable"]
      ),
      status: "unknown",
    };
  }
  if (input.managed !== null) {
    for (const reason of input.managed.reasonCodes) {
      reasons.add(reason);
    }
    if (input.managed.status === "unknown") {
      return {
        reasonCodes: sortAuthorizationReasons(reasons),
        status: "unknown",
      };
    }
  }
  if (reasons.size > 0) {
    return {
      reasonCodes: sortAuthorizationReasons(reasons),
      status: "ineffective",
    };
  }
  return { reasonCodes: [], status: "effective" };
}

/** Frozen handoff transition check; terminal states never leave themselves. */
export function handoffTransitionAllowed(
  from: SubmissionHandoffStatus,
  to: SubmissionHandoffStatus
): boolean {
  if (from === to) {
    return false;
  }
  return SUBMISSION_HANDOFF_TRANSITIONS[from].includes(to);
}

export const SUBMISSION_HANDOFF_TRANSITION_REQUESTS = [
  "accept",
  "decline",
  "cancel",
  "supersede",
] as const;
export type SubmissionHandoffTransitionRequest =
  (typeof SUBMISSION_HANDOFF_TRANSITION_REQUESTS)[number];

export const HANDOFF_REQUEST_TARGET_STATUS = {
  accept: "accepted",
  cancel: "cancelled",
  decline: "declined",
  supersede: "superseded",
} as const satisfies Record<
  SubmissionHandoffTransitionRequest,
  SubmissionHandoffStatus
>;

export type HandoffEligibility = {
  readonly status: "eligible" | "not_eligible" | "unknown";
  readonly reasonCodes: readonly AuthorizationValidityReason[];
};

/**
 * May a human handoff be requested or accepted for this exact package right now?
 *
 * Requires an *effective managed* authorization plus a satisfied M4 gate. A customer
 * self-service authorization is never sufficient, because it authorizes the customer
 * to act personally, not a professional to act for them.
 */
export function assessHandoffEligibility(input: {
  readonly authorizationType: SubmissionAuthorizationType | null;
  readonly authorization: AuthorizationAssessment | null;
  readonly managed: ManagedGateAssessment | null;
}): HandoffEligibility {
  if (input.authorizationType !== "managed_service_professional_handoff") {
    return {
      reasonCodes: ["authorization_superseded"],
      status: "not_eligible",
    };
  }
  if (input.authorization === null) {
    return {
      reasonCodes: ["authorization_superseded"],
      status: "not_eligible",
    };
  }
  if (input.authorization.status === "unknown") {
    return { reasonCodes: input.authorization.reasonCodes, status: "unknown" };
  }
  if (input.authorization.status === "ineffective") {
    return {
      reasonCodes: input.authorization.reasonCodes,
      status: "not_eligible",
    };
  }
  if (input.managed === null) {
    return { reasonCodes: ["managed_readiness_unknown"], status: "unknown" };
  }
  if (input.managed.status === "unknown") {
    return { reasonCodes: input.managed.reasonCodes, status: "unknown" };
  }
  if (input.managed.status === "ineffective") {
    return { reasonCodes: input.managed.reasonCodes, status: "not_eligible" };
  }
  return { reasonCodes: [], status: "eligible" };
}

/**
 * What an external-evidence record may claim.
 *
 * `provider_verified` is the only provenance that can verify, and it requires a
 * trusted verifier that does not exist in production. Every other provenance is
 * recorded honestly as unverified, including staff attestation.
 */
export function assessExternalEvidence(input: {
  readonly provenance: ExternalEvidenceProvenance;
  readonly kind: ExternalRecordKind;
  readonly channel: ExternalSubmissionChannel | null;
  readonly outcomeCode: ExternalOutcomeCode | null;
  readonly reference: string | null;
  readonly trustedVerifierCode: string | null;
}):
  | {
      readonly status: "accept";
      readonly verification: ExternalEvidenceVerification;
      readonly verifierCode: string | null;
    }
  | {
      readonly status: "reject";
      readonly reasonCode:
        | "evidence_provenance_invalid"
        | "evidence_verifier_unavailable";
    } {
  if (
    !(EXTERNAL_EVIDENCE_PROVENANCES as readonly string[]).includes(
      input.provenance
    )
  ) {
    return { reasonCode: "evidence_provenance_invalid", status: "reject" };
  }
  if (input.kind === "external_submission" && input.channel === null) {
    return { reasonCode: "evidence_provenance_invalid", status: "reject" };
  }
  if (input.kind === "external_outcome" && input.outcomeCode === null) {
    return { reasonCode: "evidence_provenance_invalid", status: "reject" };
  }
  if (
    (input.provenance === "provider_verified" ||
      input.provenance === "document_backed_unverified") &&
    input.reference === null
  ) {
    // An attested or provider-supplied record without an identifier cannot be
    // distinguished from a bare assertion, so it is refused rather than downgraded.
    return { reasonCode: "evidence_provenance_invalid", status: "reject" };
  }
  if (input.provenance === "provider_verified") {
    if (input.trustedVerifierCode === null) {
      return { reasonCode: "evidence_verifier_unavailable", status: "reject" };
    }
    return {
      status: "accept",
      verification: "verified",
      verifierCode: input.trustedVerifierCode,
    };
  }
  return { status: "accept", verification: "unverified", verifierCode: null };
}

export type ExternalRecordEvidence = {
  readonly kind: ExternalRecordKind;
  readonly verification: ExternalEvidenceVerification;
  readonly packageVersionId: string;
};

/**
 * Derived submission state.
 *
 * Deliberately derived *only* from recorded external records: an authorization, a
 * readiness result or an accepted handoff never appears in the input, so no amount
 * of internal state can produce "submitted".
 */
export function derivedSubmissionState(
  records: readonly ExternalRecordEvidence[],
  currentPackageVersionId: string | null
): DerivedSubmissionState {
  const forCurrent =
    currentPackageVersionId === null
      ? []
      : records.filter(
          (record) =>
            record.kind === "external_submission" &&
            record.packageVersionId === currentPackageVersionId
        );
  if (forCurrent.some((record) => record.verification === "verified")) {
    return "verified";
  }
  return forCurrent.length > 0 ? "reported_unverified" : "not_submitted";
}

/** Every status in the frozen vocabulary, for exhaustive view rendering. */
export const SUBMISSION_HANDOFF_STATUS_VALUES = SUBMISSION_HANDOFF_STATUSES;
