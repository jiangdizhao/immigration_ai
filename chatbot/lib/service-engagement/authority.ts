import type { ServiceOperatorAuthorityRequestInput } from "./policy";

/**
 * Scope-specific service operator authority port.
 *
 * R1-04: this port authorizes *who may act on which exact persisted contract*.
 * A global `lawyer` or `admin` account role is never sufficient; the request
 * carries the real Project/Engagement/Agreement-version target, the exact action,
 * the operator's current M4-002 assignment state and server-derived eligibility,
 * plus the canonical `requestSha256` the repository re-derives before persisting.
 *
 * No approved contract-operator, issuer, verifier or delegation policy exists in
 * this repository, so the production implementation denies every action. A
 * test-only authority may be injected explicitly in unit tests; it must never be
 * wired into `runtime.ts`.
 */
export type ServiceOperatorAuthorityRequest =
  ServiceOperatorAuthorityRequestInput & {
    actorUserId: string;
    requestSha256: string;
  };

export type ServiceOperatorAuthorityDecision =
  | { allowed: true; authorityCode: string }
  | {
      allowed: false;
      reasonCode:
        | "issuance_authority_unavailable"
        | "issuance_authority_denied";
    };

export type ServiceOperatorAuthority = {
  readonly code: string;
  decide: (
    request: ServiceOperatorAuthorityRequest
  ) => ServiceOperatorAuthorityDecision;
};

/** Backward-compatible alias used by earlier M4-004 call sites and tests. */
export type ServiceAgreementIssuanceAuthority = ServiceOperatorAuthority;
export type ServiceAgreementIssuanceRequest = ServiceOperatorAuthorityRequest;

export const DENY_ALL_ISSUANCE_AUTHORITY_CODE = "deny_by_default" as const;

/**
 * Production default. Until an approved operator/delegation policy and evidence
 * source exist, no actor may author, issue or verify a service agreement.
 */
export const denyAllServiceOperatorAuthority: ServiceOperatorAuthority = {
  code: DENY_ALL_ISSUANCE_AUTHORITY_CODE,
  decide() {
    return {
      allowed: false,
      reasonCode: "issuance_authority_unavailable",
    };
  },
};

export const denyAllServiceAgreementIssuanceAuthority =
  denyAllServiceOperatorAuthority;
