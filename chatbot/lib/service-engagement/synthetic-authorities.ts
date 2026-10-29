import type {
  ServiceAgreementIssuanceAuthority,
  ServiceOperatorAuthority,
  ServiceOperatorAuthorityRequest,
} from "./authority";
import type {
  ProjectResourceDisclosureResolver,
  ProjectResourceDisclosureRevalidator,
  ProjectResourceRevalidationInput,
  ProjectResourceSnapshot,
} from "./disclosure";
import type { ServiceOperatorAction } from "./policy";
import type {
  ServiceSignatureEvidenceVerifier,
  ServiceSignatureVerificationInput,
  ServiceSignatureVerificationOutcome,
} from "./signature";

/**
 * TEST-ONLY authority and evidence ports.
 *
 * These factories exist so unit tests can exercise the authorized positive path
 * without contacting a signature provider, a contract operator or a protected
 * resource store. They must never be imported by `runtime.ts`, application code
 * or production composition: `schema-contract.test.ts` asserts that no runtime
 * module imports this file.
 *
 * Nothing here is legal advice, a legally effective signature, a professional
 * qualification or a real disclosure authorization.
 */
export const SYNTHETIC_AUTHORITY_PROVENANCE =
  "synthetic_test_only_not_legally_attested" as const;

/**
 * Test-only scope-specific operator authority.
 *
 * It is deliberately stricter than the earlier actor-only double (R1-04): an
 * allowlisted actor is still denied unless the canonical request shows a current
 * active M4-002 assignment, `operatorEligible`, the action allowlisted for that
 * operator, and the exact persisted target the test declared.
 */
export type SyntheticOperatorGrant = {
  actorUserId: string;
  actions: readonly ServiceOperatorAction[];
  /** Optional target pinning, proving the authority sees the persisted contract. */
  engagementId?: string;
  agreementVersionId?: string;
  termsSha256?: string;
};

export function createSyntheticServiceOperatorAuthority(input: {
  grants: readonly SyntheticOperatorGrant[];
  authorityCode?: string;
}): ServiceOperatorAuthority {
  const authorityCode =
    input.authorityCode ?? "synthetic_test_contract_operator";
  return {
    code: "synthetic_test_operator_authority",
    decide(request: ServiceOperatorAuthorityRequest) {
      const grant = input.grants.find(
        (candidate) => candidate.actorUserId === request.actorUserId
      );
      if (!grant || !grant.actions.includes(request.action)) {
        return {
          allowed: false as const,
          reasonCode: "issuance_authority_denied" as const,
        };
      }
      if (
        !request.operatorEligible ||
        request.operatorAssignmentId === null ||
        request.operatorAssignmentStatus !== "active"
      ) {
        return {
          allowed: false as const,
          reasonCode: "issuance_authority_denied" as const,
        };
      }
      if (
        (grant.engagementId !== undefined &&
          grant.engagementId !== request.engagementId) ||
        (grant.agreementVersionId !== undefined &&
          grant.agreementVersionId !== request.agreementVersionId) ||
        (grant.termsSha256 !== undefined &&
          grant.termsSha256 !== request.termsSha256)
      ) {
        return {
          allowed: false as const,
          reasonCode: "issuance_authority_denied" as const,
        };
      }
      return { allowed: true as const, authorityCode };
    },
  };
}

/** Backward-compatible alias for the earlier M4-004 issuance double. */
export function createSyntheticServiceAgreementIssuanceAuthority(input: {
  actorUserIds: readonly string[];
  actions?: readonly ServiceOperatorAction[];
  authorityCode?: string;
}): ServiceAgreementIssuanceAuthority {
  return createSyntheticServiceOperatorAuthority({
    authorityCode: input.authorityCode,
    grants: input.actorUserIds.map((actorUserId) => ({
      actions: input.actions ?? ["author_draft", "issue", "verify_signature"],
      actorUserId,
    })),
  });
}

export type SyntheticSignatureRecord = {
  evidenceId: string;
  signaturePayloadSha256: string;
  outcome: "verified" | "rejected" | "forged";
};

/**
 * Test-only signature verifier. It resolves exclusively by evidence ID + payload
 * hash so a forged payload, a swapped version or a mismatched engagement cannot
 * borrow another evidence record's verification.
 */
export function createSyntheticServiceSignatureEvidenceVerifier(input: {
  records: readonly SyntheticSignatureRecord[];
  providerCode?: string;
}): ServiceSignatureEvidenceVerifier {
  const byEvidenceId = new Map(
    input.records.map((record) => [record.evidenceId, record])
  );
  const providerCode = input.providerCode ?? "synthetic_test_verifier";
  return {
    code: "synthetic_test_signature_verifier",
    verify(
      request: ServiceSignatureVerificationInput
    ): ServiceSignatureVerificationOutcome {
      const record = byEvidenceId.get(request.evidenceId);
      if (
        !record ||
        record.signaturePayloadSha256 !== request.signaturePayloadSha256
      ) {
        return {
          status: "rejected",
          evidenceId: request.evidenceId,
          agreementVersionId: request.agreementVersionId,
          signaturePayloadSha256: request.signaturePayloadSha256,
          method: "manual_evidence_review",
          providerCode,
          provenance: SYNTHETIC_AUTHORITY_PROVENANCE,
          rejectedAt: new Date().toISOString(),
          reasonCode: "synthetic_evidence_binding_mismatch",
        };
      }
      if (record.outcome === "verified") {
        return {
          status: "verified",
          evidenceId: request.evidenceId,
          agreementVersionId: request.agreementVersionId,
          signaturePayloadSha256: request.signaturePayloadSha256,
          method: "manual_evidence_review",
          providerCode,
          provenance: SYNTHETIC_AUTHORITY_PROVENANCE,
          verifiedAt: new Date().toISOString(),
        };
      }
      return {
        status: "rejected",
        evidenceId: request.evidenceId,
        agreementVersionId: request.agreementVersionId,
        signaturePayloadSha256: request.signaturePayloadSha256,
        method: "manual_evidence_review",
        providerCode,
        provenance: SYNTHETIC_AUTHORITY_PROVENANCE,
        rejectedAt: new Date().toISOString(),
        reasonCode:
          record.outcome === "forged"
            ? "synthetic_forged_signature_evidence"
            : "synthetic_signature_rejected",
      };
    },
  };
}

/** Test-only resource source adapter keyed by explicit synthetic resources. */
export function createSyntheticProjectResourceDisclosureResolver(input: {
  resources: readonly {
    projectId: string;
    resourceCategory: string;
    resourceId: string;
    ownerUserId: string;
    version: number;
    /** Opaque adapter fingerprint for the exact observed bytes/metadata. */
    fingerprint?: string;
  }[];
}): ProjectResourceDisclosureResolver {
  return {
    code: "synthetic_test_resource_resolver",
    resolve(request): ProjectResourceSnapshot {
      const match = input.resources.find(
        (resource) =>
          resource.projectId === request.projectId &&
          resource.resourceCategory === request.resourceCategory &&
          resource.resourceId === request.resourceId
      );
      if (!match) {
        return { found: false, reasonCode: "resource_not_found" };
      }
      return {
        found: true,
        projectId: match.projectId,
        ownerUserId: match.ownerUserId,
        version: match.version,
        category: match.resourceCategory as
          | "project_fact"
          | "project_document"
          | "private_chat"
          | "financial_record"
          | "engagement_record",
        fingerprint:
          match.fingerprint ??
          `synthetic-fingerprint-${match.resourceId}-v${match.version}`,
      };
    },
  };
}

/**
 * Test-only in-transaction revalidator. It succeeds only when the exact
 * observation the grant was authorized against is still current, so tests can
 * simulate a concurrent modification between observation and write.
 */
export function createSyntheticProjectResourceRevalidator(input: {
  resources: readonly {
    projectId: string;
    resourceCategory: string;
    resourceId: string;
    ownerUserId: string;
    version: number;
    fingerprint?: string;
  }[];
}): ProjectResourceDisclosureRevalidator {
  const resolver = createSyntheticProjectResourceDisclosureResolver(input);
  return {
    code: "synthetic_test_resource_revalidator",
    async revalidate(
      request: ProjectResourceRevalidationInput
    ): Promise<ProjectResourceSnapshot> {
      const current = await resolver.resolve({
        projectId: request.projectId,
        resourceCategory: request.resourceCategory,
        resourceId: request.resourceId,
      });
      if (!current.found) {
        return current;
      }
      if (
        current.version !== request.resourceVersion ||
        current.ownerUserId !== request.resourceOwnerUserId ||
        current.fingerprint !== request.resourceFingerprint
      ) {
        // The resource changed after observation: the authorization is stale.
        return { found: false, reasonCode: "resource_not_found" };
      }
      return current;
    },
  };
}
