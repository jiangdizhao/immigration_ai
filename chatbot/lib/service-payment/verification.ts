import { hashProjectOperationRequest } from "@/lib/db/project-foundation-utils";
import type {
  ServicePaymentEvidenceCategory,
  ServicePaymentResolutionKind,
  ServicePaymentVerificationMethod,
} from "./policy";

/**
 * M4-005 external-observation ports.
 *
 * `ExternalPaymentEvidenceVerifier` is the only path by which a staff-submitted
 * receipt can become a `verified` payment observation. `PaymentReversalResolver`
 * is the only path by which an external refund/reversal observation can be
 * obtained. Both are deny-by-default in production: the project has not approved
 * a banking feed, a receipt standard, a reconciliation procedure, a provider or a
 * retention policy, so nothing can be verified and no reversal can be observed.
 *
 * Neither port receives raw receipt content, card data, bank account numbers or
 * protected Project material: only opaque identifiers, digests and typed amounts
 * that the backend already persisted.
 */

export type ServicePaymentEvidenceVerificationInput = {
  evidenceId: string;
  conditionId: string;
  projectId: string;
  engagementId: string;
  agreementVersionId: string;
  agreementTermsSha256: string;
  evidenceCategory: ServicePaymentEvidenceCategory;
  referenceSha256: string;
  observationSha256: string;
  declaredAmountMinor: number;
  declaredCurrency: string;
  paidAt: string;
  requestingActorUserId: string;
};

export type ServicePaymentVerificationOutcome =
  | {
      status: "verified";
      evidenceId: string;
      observationSha256: string;
      declaredAmountMinor: number;
      declaredCurrency: string;
      method: ServicePaymentVerificationMethod;
      providerCode: string;
      provenance: string;
      verifiedAt: string;
    }
  | {
      status: "rejected";
      evidenceId: string;
      observationSha256: string;
      method: ServicePaymentVerificationMethod;
      providerCode: string;
      provenance: string;
      rejectedAt: string;
      reasonCode: string;
    }
  | {
      status: "unavailable";
      reasonCode:
        | "verification_unavailable"
        | "verification_provider_unavailable";
    };

export type ServicePaymentEvidenceVerifier = {
  readonly code: string;
  verify: (
    input: ServicePaymentEvidenceVerificationInput
  ) =>
    | ServicePaymentVerificationOutcome
    | Promise<ServicePaymentVerificationOutcome>;
};

export type ServicePaymentReversalObservationInput = {
  projectId: string;
  engagementId: string;
  conditionId: string;
  evidenceId: string;
  resolutionKind: Extract<ServicePaymentResolutionKind, "refund" | "reversal">;
  referenceSha256: string;
  requestingActorUserId: string;
};

export type ServicePaymentReversalObservationOutcome =
  | {
      status: "observed";
      observationSha256: string;
      observationCode: string;
      observedAt: string;
    }
  | { status: "none" }
  | {
      status: "unavailable";
      reasonCode: "reversal_unavailable" | "reversal_provider_unavailable";
    };

export type ServicePaymentReversalResolver = {
  readonly code: string;
  observe: (
    input: ServicePaymentReversalObservationInput
  ) =>
    | ServicePaymentReversalObservationOutcome
    | Promise<ServicePaymentReversalObservationOutcome>;
};

export const DENY_ALL_PAYMENT_EVIDENCE_VERIFIER_CODE =
  "deny_by_default_unverified_payment" as const;
export const UNSUPPORTED_REVERSAL_RESOLVER_CODE =
  "unsupported_reversal_observation" as const;

export const denyAllServicePaymentEvidenceVerifier: ServicePaymentEvidenceVerifier =
  {
    code: DENY_ALL_PAYMENT_EVIDENCE_VERIFIER_CODE,
    verify() {
      return {
        status: "unavailable",
        reasonCode: "verification_provider_unavailable",
      };
    },
  };

export const unsupportedServicePaymentReversalResolver: ServicePaymentReversalResolver =
  {
    code: UNSUPPORTED_REVERSAL_RESOLVER_CODE,
    observe() {
      return {
        status: "unavailable",
        reasonCode: "reversal_provider_unavailable",
      };
    },
  };

/* ------------------------------------------------------------------------- *
 * Canonical observation bindings
 * ------------------------------------------------------------------------- */

/**
 * Contract-binding hash over every material field of one payment evidence
 * observation. The repository recomputes it from the locked condition/evidence
 * rows and refuses an outcome whose binding cannot be reproduced.
 */
export function buildServicePaymentEvidenceObservation(
  input: ServicePaymentEvidenceVerificationInput
) {
  return {
    domain: "phase13_m4_005_payment_evidence_observation",
    evidenceId: input.evidenceId,
    conditionId: input.conditionId,
    projectId: input.projectId,
    engagementId: input.engagementId,
    agreementVersionId: input.agreementVersionId,
    agreementTermsSha256: input.agreementTermsSha256,
    evidenceCategory: input.evidenceCategory,
    referenceSha256: input.referenceSha256,
    observationSha256: input.observationSha256,
    declaredAmountMinor: input.declaredAmountMinor,
    declaredCurrency: input.declaredCurrency,
    paidAt: input.paidAt,
  };
}

export function hashServicePaymentEvidenceObservation(
  input: ServicePaymentEvidenceVerificationInput
) {
  return hashProjectOperationRequest(
    buildServicePaymentEvidenceObservation(input)
  );
}

/**
 * Binds one refund/reversal observation to the exact persisted payment target, so
 * an observation resolved for another condition or another evidence row can never
 * invalidate this one.
 */
export function buildServicePaymentReversalObservation(
  input: ServicePaymentReversalObservationInput
) {
  return {
    domain: "phase13_m4_005_payment_reversal_observation",
    projectId: input.projectId,
    engagementId: input.engagementId,
    conditionId: input.conditionId,
    evidenceId: input.evidenceId,
    resolutionKind: input.resolutionKind,
    referenceSha256: input.referenceSha256,
  };
}

export function hashServicePaymentReversalObservation(
  input: ServicePaymentReversalObservationInput
) {
  return hashProjectOperationRequest(
    buildServicePaymentReversalObservation(input)
  );
}
