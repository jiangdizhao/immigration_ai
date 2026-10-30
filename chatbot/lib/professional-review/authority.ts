import type { ManagedTargetPurpose } from "@/lib/managed-target/policy";

/**
 * M4-006 professional authority ports.
 *
 * Two independent decisions are required, because "this person is assigned as the
 * lawyer" and "this person is professionally qualified to sign off this exact
 * package" are different approvals:
 *
 * - `ProfessionalReviewAuthority` authorizes the exact action on the exact
 *   immutable target for the exact Project.
 * - `ProfessionalCredentialVerifier` establishes the professional qualification
 *   itself. It is a separate port because no credential registry integration
 *   exists, and a `User.role = "lawyer"` value is never evidence of qualification.
 *
 * Neither port receives package content, review notes or customer documents; both
 * receive opaque identifiers, hashes and typed scope fields only.
 */

export const PROFESSIONAL_REVIEW_AUTHORITY_ACTIONS = [
  "request_review",
  "record_decision",
  "read_review",
] as const;
export type ProfessionalReviewAuthorityAction =
  (typeof PROFESSIONAL_REVIEW_AUTHORITY_ACTIONS)[number];

export type ProfessionalReviewAssignmentStatus =
  | "active"
  | "pending"
  | "revoked"
  | "missing"
  | "unavailable";

export type ProfessionalReviewAuthorityRequest = {
  action: ProfessionalReviewAuthorityAction;
  actorUserId: string;
  /** Server-derived account role; informational only, never sufficient. */
  actorRole: string;
  projectId: string;
  targetKind: string;
  targetId: string;
  targetVersion: number;
  targetSha256: string;
  targetBindingSha256: string;
  reviewPurpose: ManagedTargetPurpose;
  reviewerAssignmentId: string | null;
  reviewerAssignmentStatus: ProfessionalReviewAssignmentStatus;
  /** Canonical hash of the material fields above; re-derived before persist. */
  requestSha256: string;
};

export type ProfessionalReviewAuthorityDecision =
  | { allowed: true; authorityCode: string; policyVersion: string }
  | {
      allowed: false;
      reasonCode:
        | "review_authority_unavailable"
        | "review_authority_denied"
        | "review_target_denied";
    };

export type ProfessionalReviewAuthority = {
  readonly code: string;
  decide: (
    request: ProfessionalReviewAuthorityRequest
  ) => ProfessionalReviewAuthorityDecision;
};

export const DENY_ALL_PROFESSIONAL_REVIEW_AUTHORITY_CODE =
  "deny_by_default_professional_review_authority" as const;

/**
 * Production default: no approved professional-review authority policy exists, so
 * nobody may request, decide or read a professional review. A global `lawyer` or
 * `admin` account role does not change this.
 */
export const denyAllProfessionalReviewAuthority: ProfessionalReviewAuthority = {
  code: DENY_ALL_PROFESSIONAL_REVIEW_AUTHORITY_CODE,
  decide() {
    return { allowed: false, reasonCode: "review_authority_unavailable" };
  },
};

export type ProfessionalCredentialVerificationRequest = {
  actorUserId: string;
  projectId: string;
  targetKind: string;
  targetId: string;
};

export type ProfessionalCredentialVerification =
  | { status: "verified"; credentialCode: string; verifiedAt: string }
  | { status: "unverified"; reasonCode: string }
  | { status: "unavailable"; reasonCode: string };

export type ProfessionalCredentialVerifier = {
  readonly code: string;
  verify: (
    request: ProfessionalCredentialVerificationRequest
  ) => ProfessionalCredentialVerification;
};

export const UNAVAILABLE_PROFESSIONAL_CREDENTIAL_VERIFIER_CODE =
  "unavailable_professional_credential_verifier" as const;

/**
 * Production default: no professional credential registry or practising-
 * certificate source is integrated, so qualification can never be claimed.
 */
export const unavailableProfessionalCredentialVerifier: ProfessionalCredentialVerifier =
  {
    code: UNAVAILABLE_PROFESSIONAL_CREDENTIAL_VERIFIER_CODE,
    verify() {
      return {
        status: "unavailable",
        reasonCode: "professional_credential_registry_unavailable",
      };
    },
  };
