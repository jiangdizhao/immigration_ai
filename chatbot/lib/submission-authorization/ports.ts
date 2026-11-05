import type { ManagedHandoffResult } from "@/lib/managed-handoff/policy";
import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import type {
  ExternalEvidenceProvenance,
  ExternalEvidenceVerification,
  ExternalOutcomeCode,
  ExternalRecordKind,
  ExternalSubmissionChannel,
  SubmissionAuthorizationType,
  SubmissionHandoffStatus,
} from "./contracts";
import type { ExactPackageEvidence } from "./policy";

/**
 * Phase 13 M8.2 - injected ports.
 *
 * The service owns authorization, disclosure acknowledgement, exact-version
 * binding, handoff transitions and provenance. Adapters own persistence, the M8.1
 * package read, the M4-007 readiness read and the authority decisions.
 *
 * No port may return customer documents, agreement text, review notes, bank
 * references or credential detail: M8.2 stores and serves identities, digests,
 * status codes and provenance only.
 */

export type AuthorizationMembershipStatus =
  | "owner"
  | "active_member"
  | "pending"
  | "revoked"
  | "missing";

/**
 * Server-derived actor context.
 *
 * `staff` is true for any non-customer account, and staff participation never grants
 * private application access by itself: a staff actor additionally needs an active
 * Project assignment *and* an explicit authority decision.
 */
export type AuthorizationActorContext = {
  readonly registeredCustomer: boolean;
  readonly staff: boolean;
  readonly project: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly status: "active" | "closed";
  } | null;
  readonly membershipStatus: AuthorizationMembershipStatus;
  /** M4-002 assignment, when one exists for this project and actor. */
  readonly staffAssignment: {
    readonly id: string;
    readonly status: "active" | "pending" | "revoked";
    readonly reviewerUserId: string | null;
  } | null;
  /** Server-derived account role; informational only, never sufficient. */
  readonly staffRole: string | null;
};

export type SubmissionAuthorizationRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly targetVersion: number;
  readonly manifestSha256: string;
  readonly authorizationType: SubmissionAuthorizationType;
  readonly disclosurePolicyVersion: string;
  readonly acknowledgedDisclosures: readonly string[];
  readonly bindingSha256: string;
  readonly actorUserId: string;
  readonly operationId: string;
  readonly requestSha256: string;
  readonly authorizedAt: Date;
};

export type SubmissionHandoffRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly manifestSha256: string;
  readonly authorizationId: string;
  readonly status: SubmissionHandoffStatus;
  readonly revision: number;
  readonly requestedByUserId: string;
  /** The named human recipient, or `null` when the Project assigns one. */
  readonly recipientUserId: string | null;
  readonly operationId: string;
  readonly requestSha256: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type SubmissionHandoffEventRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly handoffId: string;
  readonly status: SubmissionHandoffStatus;
  readonly actorUserId: string;
  readonly reasonCode: string | null;
  readonly createdAt: Date;
};

export type SubmissionExternalRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly handoffId: string | null;
  readonly packageVersionId: string;
  readonly kind: ExternalRecordKind;
  readonly channel: ExternalSubmissionChannel | null;
  readonly outcomeCode: ExternalOutcomeCode | null;
  readonly reference: string | null;
  readonly provenance: ExternalEvidenceProvenance;
  readonly verification: ExternalEvidenceVerification;
  readonly verifierCode: string | null;
  readonly occurredAt: string;
  readonly reportedByUserId: string;
  readonly operationId: string;
  readonly requestSha256: string;
  readonly createdAt: Date;
};

export type AuthorizationOperationStamp = {
  readonly actorUserId: string;
  readonly operationId: string;
  readonly requestSha256: string;
};

/**
 * What must still hold *inside* the durable write transaction. Authority is
 * re-derived from persisted rows at commit time, so a revocation between the
 * preliminary read and the write cannot produce a successful invalid record.
 */
export type AuthorizationWriteGuard = {
  readonly actorUserId: string;
  readonly requireActiveProject: boolean;
  /** When true the guard accepts an assigned staff actor instead of a member. */
  readonly allowAssignedStaff: boolean;
};

export type AuthorizationWriteResult<T> = {
  readonly replayed: boolean;
  readonly value: T;
};

export type NewSubmissionAuthorizationValues = {
  readonly id: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly targetVersion: number;
  readonly manifestSha256: string;
  readonly authorizationType: SubmissionAuthorizationType;
  readonly disclosurePolicyVersion: string;
  readonly acknowledgedDisclosures: readonly string[];
  readonly bindingSha256: string;
};

export type NewSubmissionHandoffValues = {
  readonly id: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly packageVersionId: string;
  readonly packageVersion: number;
  readonly manifestSha256: string;
  readonly authorizationId: string;
  readonly recipientUserId: string | null;
};

export type NewSubmissionExternalRecordValues = {
  readonly id: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly handoffId: string | null;
  readonly packageVersionId: string;
  readonly kind: ExternalRecordKind;
  readonly channel: ExternalSubmissionChannel | null;
  readonly outcomeCode: ExternalOutcomeCode | null;
  readonly reference: string | null;
  readonly provenance: ExternalEvidenceProvenance;
  readonly verification: ExternalEvidenceVerification;
  readonly verifierCode: string | null;
  readonly occurredAt: string;
};

export type SubmissionAuthorizationStore = {
  readActorContext(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<AuthorizationActorContext>;

  listAuthorizations(input: {
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<readonly SubmissionAuthorizationRecord[]>;

  findAuthorizationOperation(input: {
    readonly projectId: string;
    readonly operationId: string;
  }): Promise<SubmissionAuthorizationRecord | null>;

  insertAuthorization(input: {
    readonly projectId: string;
    readonly values: NewSubmissionAuthorizationValues;
    readonly operation: AuthorizationOperationStamp;
    readonly guard: AuthorizationWriteGuard;
  }): Promise<AuthorizationWriteResult<SubmissionAuthorizationRecord>>;

  listHandoffs(input: {
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<readonly SubmissionHandoffRecord[]>;

  findHandoffOperation(input: {
    readonly projectId: string;
    readonly operationId: string;
  }): Promise<SubmissionHandoffRecord | null>;

  insertHandoff(input: {
    readonly projectId: string;
    readonly values: NewSubmissionHandoffValues;
    readonly operation: AuthorizationOperationStamp;
    readonly guard: AuthorizationWriteGuard;
  }): Promise<AuthorizationWriteResult<SubmissionHandoffRecord>>;

  /**
   * Compare-and-set transition plus its audit event in one transaction. A stale
   * revision, a terminal source state or an illegal edge fails without writing.
   */
  transitionHandoff(input: {
    readonly projectId: string;
    readonly handoffId: string;
    readonly expectedRevision: number;
    readonly toStatus: SubmissionHandoffStatus;
    readonly actorUserId: string;
    readonly reasonCode: string | null;
    readonly guard: AuthorizationWriteGuard;
    readonly eventId: string;
  }): Promise<SubmissionHandoffRecord>;

  listHandoffEvents(input: {
    readonly projectId: string;
    readonly handoffId: string;
  }): Promise<readonly SubmissionHandoffEventRecord[]>;

  listExternalRecords(input: {
    readonly projectId: string;
    readonly targetKind: ManagedTargetKind;
    readonly targetId: string;
  }): Promise<readonly SubmissionExternalRecord[]>;

  findExternalRecordOperation(input: {
    readonly projectId: string;
    readonly operationId: string;
  }): Promise<SubmissionExternalRecord | null>;

  insertExternalRecord(input: {
    readonly projectId: string;
    readonly values: NewSubmissionExternalRecordValues;
    readonly operation: AuthorizationOperationStamp;
    readonly guard: AuthorizationWriteGuard;
  }): Promise<AuthorizationWriteResult<SubmissionExternalRecord>>;
};

/**
 * The authoritative M8.1 read.
 *
 * `null` means the package state could not be read at all, which is `unknown` and
 * never "no package". The two are deliberately different outcomes.
 */
export type ExactPackageState = {
  readonly currentPackageVersionId: string | null;
  readonly packages: readonly ExactPackageEvidence[];
};

export type ExactPackageReader = (input: {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
}) => Promise<ExactPackageState | null>;

/**
 * The authoritative M4-007 readiness read, re-invoked at every durable transition.
 * `unavailable` is a distinct outcome from `NOT_READY` and from `UNKNOWN`.
 */
export type ManagedReadinessReader = (input: {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly targetVersion: number;
  readonly targetSha256: string;
}) => Promise<ManagedHandoffResult | "unavailable">;

/**
 * Staff-side authority for handoff actions.
 *
 * Deliberately synchronous and side-effect free, exactly like the M4-006
 * professional-review authority: the production default is `unavailable`, so no
 * handoff action can succeed until an approved policy exists.
 */
export const HANDOFF_AUTHORITY_ACTIONS = [
  "request_handoff",
  "accept_handoff",
  "record_external_evidence",
] as const;
export type HandoffAuthorityAction = (typeof HANDOFF_AUTHORITY_ACTIONS)[number];

export type HandoffAuthorityDecision =
  | {
      readonly status: "allowed";
      readonly authorityCode: string;
      readonly policyVersion: string;
      readonly provenance: "production" | "synthetic_test";
    }
  | {
      readonly status: "denied";
      readonly reasonCode: string;
      readonly provenance: "production" | "synthetic_test";
    }
  | { readonly status: "unavailable"; readonly reasonCode: string };

export type HandoffAuthorityRequest = {
  readonly action: HandoffAuthorityAction;
  readonly actorUserId: string;
  readonly staffRole: string | null;
  readonly projectId: string;
  readonly targetKind: ManagedTargetKind;
  readonly targetId: string;
  readonly staffAssignmentId: string | null;
  readonly staffAssignmentStatus: "active" | "pending" | "revoked" | "missing";
};

export type HandoffAuthorityPort = {
  readonly code: string;
  readonly decide: (
    request: HandoffAuthorityRequest
  ) => HandoffAuthorityDecision;
};

export const DENY_HANDOFF_AUTHORITY_CODE =
  "unavailable_handoff_authority" as const;

/**
 * Production default: no approved staff-handoff authority policy exists, so nobody
 * may request, accept or attest anything. An account role never changes this.
 */
export const unavailableHandoffAuthority: HandoffAuthorityPort = {
  code: DENY_HANDOFF_AUTHORITY_CODE,
  decide() {
    return {
      reasonCode: "handoff_authority_policy_unavailable",
      status: "unavailable",
    };
  },
};

/**
 * External verification port. No approved provider exists, so production can never
 * produce a `verified` external record.
 */
export type ExternalVerifier = {
  readonly code: string;
  readonly verify: (input: {
    readonly reference: string;
    readonly kind: ExternalRecordKind;
  }) =>
    | { readonly status: "verified"; readonly verifierCode: string }
    | { readonly status: "unavailable" };
};

export const UNAVAILABLE_EXTERNAL_VERIFIER_CODE =
  "unavailable_external_submission_verifier" as const;

export const unavailableExternalVerifier: ExternalVerifier = {
  code: UNAVAILABLE_EXTERNAL_VERIFIER_CODE,
  verify() {
    return { status: "unavailable" };
  },
};
