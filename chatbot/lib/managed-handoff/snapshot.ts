import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import type { ProfessionalReviewValidity } from "@/lib/professional-review/policy";
import type { ManagedTargetProvider } from "@/lib/professional-review/target-provider";
import type {
  ManagedHandoffAgreementState,
  ManagedHandoffAssignmentState,
  ManagedHandoffConfirmationState,
  ManagedHandoffDisclosureState,
  ManagedHandoffEngagementState,
  ManagedHandoffMembershipState,
  ManagedHandoffPaymentState,
  ManagedHandoffPorts,
  ManagedHandoffProjectState,
  ManagedHandoffSignatureState,
} from "./ports";

/**
 * Phase 13 M4-007 read model.
 *
 * `loadManagedHandoffSnapshot` (database adapter) reads every authoritative
 * predicate in one repeatable-read, SELECT-only transaction. This module turns
 * that immutable snapshot into the existing `ManagedHandoffPorts` contract, so the
 * business rules stay in `evaluator.ts` and remain deterministic and testable
 * without a database.
 *
 * Absent rows are definitive `missing` states; a transaction failure is not a
 * snapshot at all (the caller must return UNKNOWN instead of guessing).
 */
export type ManagedHandoffProjectSnapshot =
  | { status: "active" | "closed"; revision: number }
  | { status: "missing" };

export type ManagedHandoffAssignmentSnapshot =
  | {
      status: "active" | "pending" | "revoked";
      reviewerUserId: string | null;
      assignmentId: string;
      assignmentRevision: number;
    }
  | { status: "missing" };

export type ManagedHandoffEngagementSnapshot =
  | {
      status: "current" | "suspended" | "awaiting_customer_action";
      engagementId: string;
      scopeCodes: readonly string[];
      serviceMode: string;
      revision: number;
    }
  | { status: "missing" };

export type ManagedHandoffAgreementSnapshot =
  | {
      status: "accepted" | "not_accepted" | "superseded";
      agreementVersionId: string;
      termsSha256: string;
      revision: number;
    }
  | { status: "missing" };

export type ManagedHandoffSignatureSnapshot =
  | { status: "verified" | "unverified"; signatureEvidenceId: string }
  | { status: "missing" };

export type ManagedHandoffReviewSnapshot = {
  validity: ProfessionalReviewValidity;
};

/** Raw frozen M4-005 status, before the payment-authority gate is applied. */
export type ManagedHandoffPaymentSnapshot =
  | {
      status:
        | "NOT_REQUIRED"
        | "SATISFIED"
        | "REQUIRED_UNSATISFIED"
        | "EVIDENCE_PENDING"
        | "DISPUTED"
        | "REVERSED"
        | "VOID"
        | "UNKNOWN";
      conditionId: string | null;
      contractualBasisCode: string | null;
      evidenceId: string | null;
    }
  | { status: "missing" };

export type ManagedHandoffSnapshot = {
  projectId: string;
  actorUserId: string;
  targetKind: ManagedTargetKind;
  targetId: string;
  loadedAt: string;
  project: ManagedHandoffProjectSnapshot;
  membership: ManagedHandoffMembershipState | null;
  assignment: ManagedHandoffAssignmentSnapshot;
  engagement: ManagedHandoffEngagementSnapshot;
  agreement: ManagedHandoffAgreementSnapshot;
  signature: ManagedHandoffSignatureSnapshot;
  disclosure: ManagedHandoffDisclosureState;
  payment: ManagedHandoffPaymentSnapshot;
  review: ManagedHandoffReviewSnapshot;
  /** Revision re-read inside the same snapshot, for concurrency detection. */
  projectRevisionAfter: number | null;
  engagementRevisionAfter: number | null;
};

export type ManagedHandoffSnapshotPolicy = {
  /**
   * Whether an approved signature-verification authority policy exists. Production
   * has none, so a `verified` row is downgraded to `unavailable` (UNKNOWN).
   */
  signatureAuthority: "approved" | "unapproved";
  /**
   * Whether positive payment validity (SATISFIED / NOT_REQUIRED) may be trusted.
   * Frozen M4-005 has no approved validity authority, so production is `untrusted`
   * and only conservative negatives pass through.
   */
  paymentValidity: "trusted" | "untrusted";
  /** Authoritative customer-confirmation observation (production: policy_unknown). */
  confirmation: ManagedHandoffConfirmationState;
};

function projectState(
  snapshot: ManagedHandoffSnapshot
): ManagedHandoffProjectState {
  if (snapshot.project.status === "missing") {
    // A genuinely absent Project row is definitive; an unreadable one never
    // reaches this mapper because the loader throws and the caller answers UNKNOWN.
    return { status: "missing" };
  }
  return {
    revision: snapshot.project.revision,
    status: snapshot.project.status,
  };
}

function assignmentState(
  snapshot: ManagedHandoffSnapshot
): ManagedHandoffAssignmentState {
  if (snapshot.assignment.status === "missing") {
    return {
      assignmentId: null,
      assignmentRevision: null,
      reviewerUserId: null,
      status: "missing",
    };
  }
  return {
    assignmentId: snapshot.assignment.assignmentId,
    assignmentRevision: snapshot.assignment.assignmentRevision,
    reviewerUserId: snapshot.assignment.reviewerUserId,
    status: snapshot.assignment.status,
  };
}

function engagementState(
  snapshot: ManagedHandoffSnapshot
): ManagedHandoffEngagementState {
  if (snapshot.engagement.status === "missing") {
    return {
      engagementId: null,
      revision: snapshot.engagementRevisionAfter ?? 0,
      scopeCodes: [],
      serviceMode: null,
      status: "missing",
    };
  }
  return {
    engagementId: snapshot.engagement.engagementId,
    revision: snapshot.engagement.revision,
    scopeCodes: snapshot.engagement.scopeCodes,
    serviceMode: snapshot.engagement.serviceMode,
    status: snapshot.engagement.status === "current" ? "current" : "superseded",
  };
}

function agreementState(
  snapshot: ManagedHandoffSnapshot
): ManagedHandoffAgreementState {
  if (snapshot.agreement.status === "missing") {
    return {
      agreementVersionId: null,
      revision: 0,
      status: "missing",
      termsSha256: null,
    };
  }
  return {
    agreementVersionId: snapshot.agreement.agreementVersionId,
    revision: snapshot.agreement.revision,
    status: snapshot.agreement.status,
    termsSha256: snapshot.agreement.termsSha256,
  };
}

function signatureState(
  snapshot: ManagedHandoffSnapshot,
  policy: ManagedHandoffSnapshotPolicy
): ManagedHandoffSignatureState {
  if (snapshot.signature.status === "missing") {
    return {
      authorityCode: "no_signature_evidence",
      authorityTrusted: false,
      status: "missing",
    };
  }
  if (snapshot.signature.status === "unverified") {
    return {
      authorityCode: "unverified_signature_evidence",
      authorityTrusted: policy.signatureAuthority === "approved",
      status: "unverified",
    };
  }
  if (policy.signatureAuthority !== "approved") {
    // Verified bytes are worthless while no authority policy is approved.
    return "unavailable";
  }
  return {
    authorityCode: "approved_signature_authority",
    authorityTrusted: true,
    status: "verified",
  };
}

/**
 * Payment gate: a positive assertion requires an approved payment-validity
 * authority. Frozen M4-005 is functionally incomplete, so production is
 * `untrusted` and positive states become `unavailable` (UNKNOWN) while every
 * conservative negative passes through unchanged.
 */
export function managedHandoffPaymentState(
  snapshot: ManagedHandoffPaymentSnapshot,
  policy: ManagedHandoffSnapshotPolicy
): ManagedHandoffPaymentState {
  if (snapshot.status === "missing") {
    return { status: "missing" };
  }
  const trusted = policy.paymentValidity === "trusted";
  switch (snapshot.status) {
    case "NOT_REQUIRED":
      return trusted && snapshot.conditionId && snapshot.contractualBasisCode
        ? {
            contractualBasisCode: snapshot.contractualBasisCode,
            contractualBasisRef: null,
            conditionId: snapshot.conditionId,
            status: "not_required",
          }
        : "unavailable";
    case "SATISFIED":
      return trusted && snapshot.conditionId
        ? {
            conditionId: snapshot.conditionId,
            evidenceId: snapshot.evidenceId,
            status: "satisfied",
          }
        : "unavailable";
    case "REQUIRED_UNSATISFIED":
      return snapshot.conditionId
        ? { conditionId: snapshot.conditionId, status: "required_unsatisfied" }
        : "unavailable";
    case "EVIDENCE_PENDING":
      return snapshot.conditionId
        ? { conditionId: snapshot.conditionId, status: "evidence_pending" }
        : "unavailable";
    case "DISPUTED":
      return snapshot.conditionId
        ? { conditionId: snapshot.conditionId, status: "disputed" }
        : "unavailable";
    case "REVERSED":
      return snapshot.conditionId
        ? { conditionId: snapshot.conditionId, status: "reversed" }
        : "unavailable";
    case "VOID":
      return snapshot.conditionId
        ? { conditionId: snapshot.conditionId, status: "void" }
        : "unavailable";
    default:
      return "unavailable";
  }
}

/**
 * Pure conversion of an immutable snapshot into the evaluator port contract.
 * No I/O, no authority decisions beyond the explicit policies passed in.
 */
export function managedHandoffPortsFromSnapshot(
  snapshot: ManagedHandoffSnapshot,
  options: {
    targetProvider: ManagedTargetProvider;
    policy: ManagedHandoffSnapshotPolicy;
    now?: () => Date;
  }
): ManagedHandoffPorts {
  const now = options.now ?? (() => new Date(snapshot.loadedAt));
  // First read reports the snapshot revision; a later read reports the revision
  // observed *after* the snapshot, so a concurrent change is genuinely visible to
  // the evaluator's re-read comparison instead of being hidden behind a cache.
  let projectReads = 0;
  let engagementReads = 0;
  return {
    agreement: { load: () => agreementState(snapshot) },
    assignment: { load: () => assignmentState(snapshot) },
    confirmation: { load: () => options.policy.confirmation },
    disclosure: { load: () => snapshot.disclosure },
    engagement: {
      load: () => {
        const state = engagementState(snapshot);
        engagementReads += 1;
        if (
          state !== "unavailable" &&
          engagementReads > 1 &&
          snapshot.engagementRevisionAfter !== null &&
          snapshot.engagement.status !== "missing" &&
          snapshot.engagementRevisionAfter !== snapshot.engagement.revision
        ) {
          return { ...state, revision: snapshot.engagementRevisionAfter };
        }
        return state;
      },
    },
    membership: {
      load: () =>
        snapshot.membership ?? {
          expiresAt: null,
          membershipId: null,
          status: "none",
        },
    },
    now,
    payment: {
      load: () => managedHandoffPaymentState(snapshot.payment, options.policy),
    },
    project: {
      load: () => {
        const state = projectState(snapshot);
        projectReads += 1;
        if (
          state !== "unavailable" &&
          state.status !== "missing" &&
          projectReads > 1 &&
          snapshot.projectRevisionAfter !== null &&
          snapshot.projectRevisionAfter !== state.revision
        ) {
          return {
            revision: snapshot.projectRevisionAfter,
            status: state.status,
          };
        }
        return state;
      },
    },
    review: { evaluate: async () => snapshot.review.validity },
    signature: { load: () => signatureState(snapshot, options.policy) },
    targetProvider: options.targetProvider,
  };
}
