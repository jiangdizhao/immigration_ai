import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";
import type {
  ServicePaymentContractualBasisCode,
  ServicePaymentRequirement,
  ServicePaymentResolutionKind,
} from "./policy";

/**
 * M4-005 authority ports.
 *
 * Two independent authorities are required, because "this is what the signed
 * contract says" and "this employee may attest money" are different approvals
 * owned by different people:
 *
 * - `ServicePaymentContractAuthority` decides whether the exact signed agreement
 *   version requires an advance service fee, requires nothing, or cannot be
 *   determined. The repository never infers this from clause text, keywords or a
 *   model interpretation.
 * - `ServicePaymentFinanceAuthority` decides whether this exact authenticated
 *   staff actor may carry out the requested financial operation (submit evidence,
 *   verify evidence, record dispute/refund/reversal/void/correction).
 *
 * Neither authority receives receipt bytes, bank details or protected Project
 * content; both receive only opaque identifiers, hashes and typed scope fields.
 *
 * No approved real-world contract-operator or finance-role policy exists in this
 * repository yet, so both production implementations deny every request. A global
 * `lawyer` or `admin` account role is deliberately insufficient: the request
 * carries the actor's current M4-002 assignment state and server-derived
 * eligibility, and the authority still has to say yes.
 */

export type ServicePaymentAuthorityDecision =
  | {
      allowed: true;
      authorityCode: string;
      policyVersion: string;
    }
  | {
      allowed: false;
      reasonCode:
        | "contract_authority_unavailable"
        | "contract_authority_denied"
        | "finance_authority_unavailable"
        | "finance_authority_denied";
    };

export type ServicePaymentContractAuthorityRequest = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  requirement: ServicePaymentRequirement;
  amountMinor: number | null;
  currency: string | null;
  contractualBasisCode: ServicePaymentContractualBasisCode;
  contractualBasisRef: string | null;
  contractObservationSha256: string;
  operatorEligible: boolean;
  operatorAssignmentId: string | null;
  operatorAssignmentStatus: string | null;
  /** Canonical hash of every material field above; re-derived before persist. */
  requestSha256: string;
};

export type ServicePaymentContractAuthority = {
  readonly code: string;
  decide: (
    request: ServicePaymentContractAuthorityRequest
  ) => ServicePaymentAuthorityDecision;
};

export const SERVICE_PAYMENT_FINANCE_ACTIONS = [
  "submit_evidence",
  "verify_evidence",
  "record_dispute",
  "record_refund",
  "record_reversal",
  "record_void",
  "record_correction",
] as const;
export type ServicePaymentFinanceAction =
  (typeof SERVICE_PAYMENT_FINANCE_ACTIONS)[number];

export const SERVICE_PAYMENT_FINANCE_ACTION_BY_RESOLUTION: Record<
  ServicePaymentResolutionKind,
  ServicePaymentFinanceAction
> = {
  dispute: "record_dispute",
  refund: "record_refund",
  reversal: "record_reversal",
  void: "record_void",
  correction: "record_correction",
};

export type ServicePaymentFinanceAuthorityRequest = {
  action: ServicePaymentFinanceAction;
  actorUserId: string;
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  conditionId: string;
  evidenceId: string | null;
  amountMinor: number | null;
  currency: string | null;
  /**
   * Digest of the exact external observation being authorized. Refund and
   * reversal resolutions must bind the observation the resolver returned, so an
   * approval can never authorize a different refund event.
   */
  observationSha256: string | null;
  operatorEligible: boolean;
  operatorAssignmentId: string | null;
  operatorAssignmentStatus: string | null;
  requestSha256: string;
};

export type ServicePaymentFinanceAuthority = {
  readonly code: string;
  decide: (
    request: ServicePaymentFinanceAuthorityRequest
  ) => ServicePaymentAuthorityDecision;
};

export const DENY_ALL_CONTRACT_AUTHORITY_CODE =
  "deny_by_default_contract_authority" as const;
export const DENY_ALL_FINANCE_AUTHORITY_CODE =
  "deny_by_default_finance_authority" as const;

/**
 * Production default: no actor may assert a contractual payment requirement,
 * because no approved clause/schedule authority exists.
 */
export const denyAllServicePaymentContractAuthority: ServicePaymentContractAuthority =
  {
    code: DENY_ALL_CONTRACT_AUTHORITY_CODE,
    decide() {
      return {
        allowed: false,
        reasonCode: "contract_authority_unavailable",
      };
    },
  };

/**
 * Production default: no actor may attest, verify, dispute, refund, reverse,
 * void or correct an off-platform payment, because no approved finance role,
 * evidence standard, retention policy or accounting position exists.
 */
export const denyAllServicePaymentFinanceAuthority: ServicePaymentFinanceAuthority =
  {
    code: DENY_ALL_FINANCE_AUTHORITY_CODE,
    decide() {
      return {
        allowed: false,
        reasonCode: "finance_authority_unavailable",
      };
    },
  };

/* ------------------------------------------------------------------------- *
 * Canonical authority bindings
 *
 * The HTTP layer asks an authority about the exact persisted target; the
 * repository re-derives the same hash from the rows it locked and refuses any
 * mismatch, so an approval for condition A can never authorize condition B.
 * ------------------------------------------------------------------------- */

export function buildServicePaymentContractAuthorityRequest(
  input: ServicePaymentContractAuthorityRequest
) {
  return {
    domain: "phase13_m4_005_contract_authority",
    action: "record_condition" as const,
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    engagementId: input.engagementId,
    agreementVersionId: input.agreementVersionId,
    agreementTermsSha256: input.agreementTermsSha256,
    requirement: input.requirement,
    amountMinor: input.amountMinor,
    currency: input.currency,
    contractualBasisCode: input.contractualBasisCode,
    contractualBasisRef: input.contractualBasisRef,
    contractObservationSha256: input.contractObservationSha256,
    operatorEligible: input.operatorEligible,
    operatorAssignmentId: input.operatorAssignmentId,
    operatorAssignmentStatus: input.operatorAssignmentStatus,
  };
}

export function hashServicePaymentContractAuthorityRequest(
  input: ServicePaymentContractAuthorityRequest
) {
  return hashProjectOperationRequest(
    buildServicePaymentContractAuthorityRequest(input)
  );
}

export function buildServicePaymentFinanceAuthorityRequest(
  input: ServicePaymentFinanceAuthorityRequest
) {
  return {
    domain: "phase13_m4_005_finance_authority",
    action: input.action,
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    engagementId: input.engagementId,
    agreementVersionId: input.agreementVersionId,
    agreementTermsSha256: input.agreementTermsSha256,
    conditionId: input.conditionId,
    evidenceId: input.evidenceId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    observationSha256: input.observationSha256,
    operatorEligible: input.operatorEligible,
    operatorAssignmentId: input.operatorAssignmentId,
    operatorAssignmentStatus: input.operatorAssignmentStatus,
  };
}

export function hashServicePaymentFinanceAuthorityRequest(
  input: ServicePaymentFinanceAuthorityRequest
) {
  return hashProjectOperationRequest(
    buildServicePaymentFinanceAuthorityRequest(input)
  );
}

/* ------------------------------------------------------------------------- *
 * FIX-02 — explicit staff payment-status read authority
 * ------------------------------------------------------------------------- */

/**
 * Staff payment-status disclosure authority.
 *
 * An active M4-002 assignment (or a global `lawyer`/`admin` role) establishes
 * Project participation only. It does not authorize reading an engagement's
 * financial condition, payment evidence, amounts or resolution history: M4-004's
 * staff metadata policy withholds protected engagement metadata for exactly this
 * reason, and no approved financial-disclosure policy exists yet.
 *
 * The customer owner always reads their own safe status without this port. Any
 * other actor must obtain an explicit, action-scoped decision bound to the exact
 * actor, Project, Engagement and condition; otherwise the repository answers an
 * existence-hiding `not_found`.
 */
export type ServicePaymentStatusReadAuthorityRequest = {
  actorUserId: string;
  projectId: string;
  engagementId: string;
  conditionId: string | null;
  scope: "owner" | "operator";
  requestSha256: string;
};

export type ServicePaymentStatusReadAuthority = {
  readonly code: string;
  decide: (
    request: ServicePaymentStatusReadAuthorityRequest
  ) => ServicePaymentAuthorityDecision;
};

export const DENY_ALL_PAYMENT_STATUS_READ_AUTHORITY_CODE =
  "deny_by_default_payment_status_read" as const;

/** Production default: only the customer owner can read payment status. */
export const denyAllServicePaymentStatusReadAuthority: ServicePaymentStatusReadAuthority =
  {
    code: DENY_ALL_PAYMENT_STATUS_READ_AUTHORITY_CODE,
    decide() {
      return {
        allowed: false,
        reasonCode: "finance_authority_unavailable",
      };
    },
  };
