import type {
  ServicePaymentContractAuthority,
  ServicePaymentContractAuthorityRequest,
  ServicePaymentFinanceAction,
  ServicePaymentFinanceAuthority,
  ServicePaymentFinanceAuthorityRequest,
  ServicePaymentStatusReadAuthority,
} from "./authority";
import type {
  ServicePaymentRequirement,
  ServicePaymentResolutionKind,
} from "./policy";
import type {
  ServicePaymentEvidenceVerifier,
  ServicePaymentReversalObservationOutcome,
  ServicePaymentReversalResolver,
  ServicePaymentVerificationOutcome,
} from "./verification";

/**
 * TEST-ONLY M4-005 authority and observation ports.
 *
 * These factories exist so offline unit tests and the guarded isolated-PostgreSQL
 * suite can exercise the authorized positive path without a real contract
 * operator, a real finance team, a bank feed or a payment provider.
 *
 * They must never be imported by `runtime.ts`, application code or production
 * composition; `schema-contract.test.ts` asserts that no runtime module imports
 * this file. Nothing here is a real financial verification, a legally effective
 * contract interpretation or a professional/finance authorization.
 */
export const SYNTHETIC_SERVICE_PAYMENT_PROVENANCE =
  "synthetic_test_only_not_legally_attested" as const;

function operatorEligible(request: {
  operatorEligible: boolean;
  operatorAssignmentId: string | null;
  operatorAssignmentStatus: string | null;
}) {
  return (
    request.operatorEligible &&
    request.operatorAssignmentId !== null &&
    request.operatorAssignmentStatus === "active"
  );
}

export type SyntheticContractGrant = {
  actorUserId: string;
  agreementVersionId?: string;
  agreementTermsSha256?: string;
  requirement?: ServicePaymentRequirement;
  amountMinor?: number;
  currency?: string;
};

/**
 * Test-only contract-payment-requirement authority.
 *
 * It answers only for the exact persisted target the test declared, and it always
 * requires a current M4-002 assignment, so a test cannot accidentally prove that a
 * global role is sufficient.
 */
export function createSyntheticServicePaymentContractAuthority(input: {
  grants: readonly SyntheticContractGrant[];
  authorityCode?: string;
}): ServicePaymentContractAuthority {
  const authorityCode =
    input.authorityCode ?? "synthetic_test_contract_payment_authority";
  return {
    code: "synthetic_test_contract_payment_authority",
    decide(request: ServicePaymentContractAuthorityRequest) {
      const grant = input.grants.find(
        (candidate) => candidate.actorUserId === request.actorUserId
      );
      if (!grant || !operatorEligible(request)) {
        return {
          allowed: false as const,
          reasonCode: "contract_authority_denied" as const,
        };
      }
      if (
        (grant.agreementVersionId !== undefined &&
          grant.agreementVersionId !== request.agreementVersionId) ||
        (grant.agreementTermsSha256 !== undefined &&
          grant.agreementTermsSha256 !== request.agreementTermsSha256) ||
        (grant.requirement !== undefined &&
          grant.requirement !== request.requirement) ||
        (grant.amountMinor !== undefined &&
          grant.amountMinor !== request.amountMinor) ||
        (grant.currency !== undefined && grant.currency !== request.currency)
      ) {
        return {
          allowed: false as const,
          reasonCode: "contract_authority_denied" as const,
        };
      }
      return {
        allowed: true as const,
        authorityCode,
        policyVersion: "synthetic_test_only",
      };
    },
  };
}

export type SyntheticFinanceGrant = {
  actorUserId: string;
  actions: readonly ServicePaymentFinanceAction[];
  conditionId?: string;
  evidenceId?: string;
};

export type SyntheticFinanceAuthority = ServicePaymentFinanceAuthority & {
  /** Test-only: simulates reactive revocation between two calls. */
  revoke: (actorUserId: string) => void;
};

/**
 * Test-only finance-attestation authority with an explicit revoke hook, so a test
 * can prove that revoking staff authority prevents a later attestation.
 */
export function createSyntheticServicePaymentFinanceAuthority(input: {
  grants: readonly SyntheticFinanceGrant[];
  authorityCode?: string;
}): SyntheticFinanceAuthority {
  const authorityCode =
    input.authorityCode ?? "synthetic_test_finance_attestation_authority";
  const revoked = new Set<string>();
  return {
    code: "synthetic_test_finance_attestation_authority",
    decide(request: ServicePaymentFinanceAuthorityRequest) {
      const grant = input.grants.find(
        (candidate) => candidate.actorUserId === request.actorUserId
      );
      if (
        !grant ||
        revoked.has(request.actorUserId) ||
        !grant.actions.includes(request.action) ||
        !operatorEligible(request)
      ) {
        return {
          allowed: false as const,
          reasonCode: "finance_authority_denied" as const,
        };
      }
      if (
        (grant.conditionId !== undefined &&
          grant.conditionId !== request.conditionId) ||
        (grant.evidenceId !== undefined &&
          grant.evidenceId !== request.evidenceId)
      ) {
        return {
          allowed: false as const,
          reasonCode: "finance_authority_denied" as const,
        };
      }
      return {
        allowed: true as const,
        authorityCode,
        policyVersion: "synthetic_test_only",
      };
    },
    revoke(actorUserId: string) {
      revoked.add(actorUserId);
    },
  };
}

export type SyntheticPaymentEvidenceRecord = {
  evidenceId: string;
  observationSha256: string;
  amountMinor: number;
  currency: string;
  outcome: "verified" | "rejected" | "forged";
  reasonCode?: string;
};

/**
 * Test-only evidence verifier.
 *
 * Resolution is by evidence id plus the exact observation digest and amount, so a
 * forged digest, a swapped amount or a mismatched currency cannot silently become
 * a verified payment.
 */
export function createSyntheticServicePaymentEvidenceVerifier(input: {
  records: readonly SyntheticPaymentEvidenceRecord[];
  providerCode?: string;
}): ServicePaymentEvidenceVerifier {
  const providerCode = input.providerCode ?? "synthetic_test_evidence_provider";
  return {
    code: "synthetic_test_payment_evidence_verifier",
    verify(request): ServicePaymentVerificationOutcome {
      const record = input.records.find(
        (candidate) => candidate.evidenceId === request.evidenceId
      );
      if (
        !record ||
        record.observationSha256 !== request.observationSha256 ||
        record.amountMinor !== request.declaredAmountMinor ||
        record.currency !== request.declaredCurrency
      ) {
        return {
          status: "rejected",
          evidenceId: request.evidenceId,
          observationSha256: request.observationSha256,
          method: "manual_staff_reconciliation",
          providerCode,
          provenance: SYNTHETIC_SERVICE_PAYMENT_PROVENANCE,
          rejectedAt: new Date().toISOString(),
          reasonCode: "observation_mismatch",
        };
      }
      if (record.outcome === "rejected") {
        return {
          status: "rejected",
          evidenceId: request.evidenceId,
          observationSha256: record.observationSha256,
          method: "manual_staff_reconciliation",
          providerCode,
          provenance: SYNTHETIC_SERVICE_PAYMENT_PROVENANCE,
          rejectedAt: new Date().toISOString(),
          reasonCode: record.reasonCode ?? "evidence_not_accepted",
        };
      }
      if (record.outcome === "forged") {
        // Deliberately returns a digest the repository cannot reproduce, proving
        // that a caller-supplied "verified" flag alone is never trusted.
        return {
          status: "verified",
          evidenceId: request.evidenceId,
          observationSha256: "0".repeat(64),
          declaredAmountMinor: request.declaredAmountMinor,
          declaredCurrency: request.declaredCurrency,
          method: "manual_staff_reconciliation",
          providerCode,
          provenance: SYNTHETIC_SERVICE_PAYMENT_PROVENANCE,
          verifiedAt: new Date().toISOString(),
        };
      }
      return {
        status: "verified",
        evidenceId: request.evidenceId,
        observationSha256: record.observationSha256,
        declaredAmountMinor: record.amountMinor,
        declaredCurrency: record.currency,
        method: "manual_staff_reconciliation",
        providerCode,
        provenance: SYNTHETIC_SERVICE_PAYMENT_PROVENANCE,
        verifiedAt: new Date().toISOString(),
      };
    },
  };
}

export type SyntheticReversalRecord = {
  conditionId: string;
  evidenceId: string;
  resolutionKind: Extract<ServicePaymentResolutionKind, "refund" | "reversal">;
  observationSha256: string;
  observationCode?: string;
};

export function createSyntheticServicePaymentReversalResolver(input: {
  records: readonly SyntheticReversalRecord[];
  /** When true, behaves like the deny-by-default production resolver. */
  unavailable?: boolean;
}): ServicePaymentReversalResolver {
  return {
    code: "synthetic_test_payment_reversal_resolver",
    observe(request): ServicePaymentReversalObservationOutcome {
      if (input.unavailable) {
        return {
          status: "unavailable",
          reasonCode: "reversal_provider_unavailable",
        };
      }
      const record = input.records.find(
        (candidate) =>
          candidate.conditionId === request.conditionId &&
          candidate.evidenceId === request.evidenceId &&
          candidate.resolutionKind === request.resolutionKind
      );
      if (!record) {
        return { status: "none" };
      }
      return {
        status: "observed",
        observationSha256: record.observationSha256,
        observationCode:
          record.observationCode ?? "synthetic_external_observation",
        observedAt: new Date().toISOString(),
      };
    },
  };
}

export type SyntheticStatusReadGrant = {
  actorUserId: string;
  engagementId?: string;
  conditionId?: string;
};

/**
 * TEST-ONLY staff payment-status read authority (FIX-02).
 *
 * It exists so the guarded suite can prove an *explicitly scoped* financial
 * disclosure decision works, without ever implying that holding an M4-002
 * assignment is enough. Production wires `denyAllServicePaymentStatusReadAuthority`.
 */
export function createSyntheticServicePaymentStatusReadAuthority(input: {
  grants: readonly SyntheticStatusReadGrant[];
  authorityCode?: string;
}): ServicePaymentStatusReadAuthority {
  const authorityCode =
    input.authorityCode ?? "synthetic_test_payment_status_read_authority";
  return {
    code: "synthetic_test_payment_status_read_authority",
    decide(request) {
      const grant = input.grants.find(
        (candidate) => candidate.actorUserId === request.actorUserId
      );
      if (!grant) {
        return {
          allowed: false as const,
          reasonCode: "finance_authority_denied" as const,
        };
      }
      if (
        (grant.engagementId !== undefined &&
          grant.engagementId !== request.engagementId) ||
        (grant.conditionId !== undefined &&
          grant.conditionId !== request.conditionId)
      ) {
        return {
          allowed: false as const,
          reasonCode: "finance_authority_denied" as const,
        };
      }
      return {
        allowed: true as const,
        authorityCode,
        policyVersion: "synthetic_test_only",
      };
    },
  };
}
