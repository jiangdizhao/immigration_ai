/**
 * Signature evidence verification port.
 *
 * No electronic-signature provider, identity-binding policy, retention policy or
 * legal-enforceability position is approved in this repository. The production
 * implementation therefore returns `unavailable` for every request, so no
 * evidence can become `verified` and no managed service can activate. A
 * test-only verifier may be injected explicitly in unit tests.
 *
 * The verifier receives only opaque identifiers and hashes already persisted by
 * the backend. It never receives document bytes or protected Project content.
 */
export type ServiceSignatureVerificationInput = {
  evidenceId: string;
  engagementId: string;
  projectId: string;
  agreementVersionId: string;
  termsSha256: string;
  signaturePayloadSha256: string;
  evidenceRef: string;
  evidenceSha256: string;
  signerUserId: string;
  declaredSignedAt: string;
  requestingActorUserId: string;
};

export const SERVICE_SIGNATURE_VERIFICATION_METHODS = [
  "manual_evidence_review",
  "external_provider_attestation",
] as const;
export type ServiceSignatureVerificationMethod =
  (typeof SERVICE_SIGNATURE_VERIFICATION_METHODS)[number];

export type ServiceSignatureVerificationOutcome =
  | {
      status: "verified";
      evidenceId: string;
      agreementVersionId: string;
      signaturePayloadSha256: string;
      method: ServiceSignatureVerificationMethod;
      providerCode: string;
      provenance: string;
      verifiedAt: string;
    }
  | {
      status: "rejected";
      evidenceId: string;
      agreementVersionId: string;
      signaturePayloadSha256: string;
      method: ServiceSignatureVerificationMethod;
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

export type ServiceSignatureEvidenceVerifier = {
  readonly code: string;
  verify: (
    input: ServiceSignatureVerificationInput
  ) =>
    | ServiceSignatureVerificationOutcome
    | Promise<ServiceSignatureVerificationOutcome>;
};

export const DENY_ALL_SIGNATURE_VERIFIER_CODE =
  "deny_by_default_unverified" as const;

/**
 * Production default. Verification provenance can only enter through this port,
 * so a caller-supplied "verified" flag or a UI click can never authenticate
 * signature evidence.
 */
export const denyAllServiceSignatureEvidenceVerifier: ServiceSignatureEvidenceVerifier =
  {
    code: DENY_ALL_SIGNATURE_VERIFIER_CODE,
    verify() {
      return {
        status: "unavailable",
        reasonCode: "verification_provider_unavailable",
      };
    },
  };
