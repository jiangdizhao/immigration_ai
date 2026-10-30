import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import type { ProfessionalReviewValidity } from "@/lib/professional-review/policy";
import type { ManagedTargetProvider } from "@/lib/professional-review/target-provider";

/**
 * M4-007 read-only state ports.
 *
 * M4-007 composes M4-002, M4-004, frozen M4-005 and M4-006 by *reading* their
 * current authoritative state. It never writes, never infers and never repairs:
 * every port distinguishes "definitely absent" (a definitive block) from
 * "cannot be established" (an `UNKNOWN` outcome).
 *
 * Production wires `denyAllManagedHandoffPorts` (every port unavailable), so this
 * gate can never produce READY until independently approved adapters exist.
 */
export type ManagedHandoffProjectState =
  | { status: "active" | "closed"; revision: number }
  | { status: "missing" }
  | "unavailable";

export type ManagedHandoffMembershipState =
  | {
      status: "owner" | "member" | "none";
      /** `ProjectMembership` has no revision column or expiry column. */
      membershipId: string | null;
      expiresAt: string | null;
    }
  | "unavailable";

export type ManagedHandoffAssignmentState =
  | {
      status: "active" | "pending" | "revoked" | "missing";
      reviewerUserId: string | null;
      assignmentId: string | null;
      /** `ProjectStaffAssignment.lastProjectRevision`, when a row exists. */
      assignmentRevision: number | null;
    }
  | "unavailable";

export type ManagedHandoffEngagementState =
  | {
      status: "current" | "superseded" | "missing";
      engagementId: string | null;
      scopeCodes: readonly string[];
      /** M4-004 `serviceMode`: only `managed` may carry a managed handoff. */
      serviceMode: string | null;
      revision: number;
    }
  | "unavailable";

export type ManagedHandoffAgreementState =
  | {
      status: "accepted" | "not_accepted" | "superseded" | "missing";
      agreementVersionId: string | null;
      termsSha256: string | null;
      revision: number;
    }
  | "unavailable";

export type ManagedHandoffSignatureState =
  | {
      status: "verified" | "unverified" | "missing";
      authorityCode: string;
      /** The signing/verification authority policy itself is trusted. */
      authorityTrusted: boolean;
    }
  | "unavailable";

export type ManagedHandoffDisclosureState =
  | {
      status: "granted" | "missing" | "expired";
      resourceKey: string;
      /** Live `ProjectResourceDisclosureGrant.id`, when one exists. */
      disclosureId: string | null;
    }
  | "unavailable";

export type ManagedHandoffPaymentState =
  | {
      status: "not_required";
      conditionId: string;
      contractualBasisCode: string;
      contractualBasisRef: string | null;
    }
  | {
      status: "satisfied";
      conditionId: string;
      evidenceId: string | null;
    }
  | { status: "required_unsatisfied"; conditionId: string }
  | { status: "evidence_pending"; conditionId: string }
  | { status: "disputed" | "reversed" | "void"; conditionId: string }
  | { status: "missing" }
  | "unavailable";

/**
 * Authoritative customer-confirmation observation.
 *
 * A caller-supplied "confirmation" field is deliberately absent: only an approved
 * requirement policy plus recorded evidence can produce a positive. `policy_unknown`
 * is the production behaviour because no approved policy exists.
 */
export type ManagedHandoffConfirmationState =
  | { status: "not_required"; policyCode: string }
  | {
      status: "required_and_confirmed";
      policyCode: string;
      confirmationRef: string;
    }
  | { status: "required_not_confirmed"; policyCode: string }
  | { status: "policy_unknown" }
  | "unavailable";

export type ManagedHandoffPayload = {
  actorUserId: string;
  /** Communication context only; never an authorization predicate. */
  messagingConsentPresent: boolean;
  projectId: string;
  target: { targetId: string; targetKind: ManagedTargetKind };
  /** Active VIP subscription; context only, never readiness evidence. */
  vipEntitlementActive: boolean;
};

export type ManagedHandoffPorts = {
  project: { load(input: { projectId: string }): ManagedHandoffProjectState };
  membership: {
    load(input: {
      actorUserId: string;
      projectId: string;
    }): ManagedHandoffMembershipState;
  };
  assignment: {
    load(input: { projectId: string }): ManagedHandoffAssignmentState;
  };
  engagement: {
    load(input: { projectId: string }): ManagedHandoffEngagementState;
  };
  agreement: {
    load(input: {
      engagementId: string | null;
      projectId: string;
    }): ManagedHandoffAgreementState;
  };
  signature: {
    load(input: {
      agreementVersionId: string | null;
      projectId: string;
    }): ManagedHandoffSignatureState;
  };
  disclosure: {
    load(input: {
      actorUserId: string;
      projectId: string;
      targetId: string;
      targetKind: ManagedTargetKind;
    }): ManagedHandoffDisclosureState;
  };
  payment: {
    load(input: {
      agreementVersionId: string | null;
      engagementId: string | null;
      projectId: string;
    }): ManagedHandoffPaymentState;
  };
  confirmation: {
    load(input: {
      actorUserId: string;
      projectId: string;
      targetId: string;
      targetKind: ManagedTargetKind;
    }): ManagedHandoffConfirmationState;
  };
  review: {
    evaluate(input: {
      projectId: string;
      targetId: string;
      targetKind: ManagedTargetKind;
      targetSha256: string;
      targetVersion: number;
      assignment: {
        status: "active" | "revoked" | "missing";
        reviewerUserId: string | null;
      };
    }): Promise<ProfessionalReviewValidity>;
  };
  targetProvider: ManagedTargetProvider;
  now: () => Date;
};

/**
 * Production default: no managed-handoff adapter is approved, so every source is
 * unavailable and the gate can only ever answer UNKNOWN.
 */
export function denyAllManagedHandoffPorts(
  targetProvider: ManagedTargetProvider,
  now: () => Date = () => new Date()
): ManagedHandoffPorts {
  return {
    agreement: { load: () => "unavailable" },
    assignment: { load: () => "unavailable" },
    confirmation: { load: () => ({ status: "policy_unknown" }) },
    disclosure: { load: () => "unavailable" },
    engagement: { load: () => "unavailable" },
    membership: { load: () => "unavailable" },
    now,
    payment: { load: () => "unavailable" },
    project: { load: () => "unavailable" },
    review: {
      evaluate: async () => ({
        status: "unknown",
        reasonCode: "review_state_unavailable",
        reviewRequestId: null,
      }),
    },
    signature: { load: () => "unavailable" },
    targetProvider,
  };
}
