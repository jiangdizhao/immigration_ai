import assert from "node:assert/strict";
import { test } from "node:test";
import {
  denyAllServiceOperatorAuthority,
  type ServiceOperatorAuthorityRequest,
} from "./authority";
import {
  buildServiceSignaturePayload,
  hashServiceOperatorAuthorityRequest,
  hashServiceSignaturePayload,
} from "./policy";
import {
  DENY_ALL_SIGNATURE_VERIFIER_CODE,
  denyAllServiceSignatureEvidenceVerifier,
  type ServiceSignatureVerificationInput,
} from "./signature";
import {
  createSyntheticProjectResourceDisclosureResolver,
  createSyntheticProjectResourceRevalidator,
  createSyntheticServiceOperatorAuthority,
  createSyntheticServiceSignatureEvidenceVerifier,
  SYNTHETIC_AUTHORITY_PROVENANCE,
} from "./synthetic-authorities";

const evidenceId = "123e4567-e89b-42d3-a456-426614174010";
const payloadSha256 = "c".repeat(64);

/**
 * Minimal canonical operator-authority request. The hash is recomputed so the
 * fixture always carries the same binding the repository would derive.
 */
function authorityRequest(
  overrides: Partial<ServiceOperatorAuthorityRequest> = {}
): ServiceOperatorAuthorityRequest {
  const base = {
    action: "issue" as const,
    agreementVersionId: "version-1",
    agreementVersionStatus: "draft",
    engagementId: "engagement-a",
    engagementStatus: "awaiting_customer_action",
    evidenceId: null,
    evidenceVerificationStatus: null,
    operatorAssignmentId: "assignment-a",
    operatorAssignmentStatus: "active" as const,
    operatorEligible: true,
    operatorEmailVerified: true,
    operatorRole: "lawyer" as const,
    operatorUserId: "operator-1",
    projectId: "project-a",
    scopeCodes: ["school_admissions"] as const,
    serviceMode: "managed",
    signerUserId: null,
    termsSha256: "f".repeat(64),
    versionNumber: 1,
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    actorUserId: merged.operatorUserId,
    requestSha256: hashServiceOperatorAuthorityRequest(merged),
  };
}

function verificationInput(): ServiceSignatureVerificationInput {
  return {
    evidenceId,
    engagementId: "123e4567-e89b-42d3-a456-426614174011",
    projectId: "123e4567-e89b-42d3-a456-426614174012",
    agreementVersionId: "123e4567-e89b-42d3-a456-426614174013",
    termsSha256: "d".repeat(64),
    signaturePayloadSha256: payloadSha256,
    evidenceRef: "synthetic-evidence-1",
    evidenceSha256: "e".repeat(64),
    signerUserId: "123e4567-e89b-42d3-a456-426614174014",
    declaredSignedAt: "2026-10-29T00:00:00.000Z",
    requestingActorUserId: "123e4567-e89b-42d3-a456-426614174015",
  };
}

test("production signature verification denies and never fabricates a verified state", async () => {
  const outcome = await denyAllServiceSignatureEvidenceVerifier.verify(
    verificationInput()
  );
  assert.equal(outcome.status, "unavailable");
  assert.equal(
    denyAllServiceSignatureEvidenceVerifier.code,
    DENY_ALL_SIGNATURE_VERIFIER_CODE
  );
  assert.notEqual(outcome.status, "verified");
});

test("production operator authority denies draft, issue and verification", () => {
  for (const action of ["author_draft", "issue", "verify_signature"] as const) {
    const decision = denyAllServiceOperatorAuthority.decide(
      authorityRequest({ action })
    );
    assert.deepEqual(decision, {
      allowed: false,
      reasonCode: "issuance_authority_unavailable",
    });
  }
});

test("synthetic operator authority requires current scope eligibility", () => {
  const authority = createSyntheticServiceOperatorAuthority({
    grants: [{ actions: ["author_draft", "issue"], actorUserId: "operator-1" }],
  });
  assert.deepEqual(authority.decide(authorityRequest()), {
    allowed: true,
    authorityCode: "synthetic_test_contract_operator",
  });
  // A global role is not enough: no current active assignment means no operator.
  assert.deepEqual(
    authority.decide(
      authorityRequest({
        operatorAssignmentId: null,
        operatorAssignmentStatus: null,
        operatorEligible: false,
      })
    ),
    { allowed: false, reasonCode: "issuance_authority_denied" }
  );
  // An action outside the operator's scope is denied.
  assert.deepEqual(
    authority.decide(authorityRequest({ action: "verify_signature" })),
    { allowed: false, reasonCode: "issuance_authority_denied" }
  );
  // Another operator cannot borrow this operator's authority.
  assert.deepEqual(
    authority.decide(authorityRequest({ operatorUserId: "operator-2" })),
    { allowed: false, reasonCode: "issuance_authority_denied" }
  );
});

test("synthetic operator authority binds to the exact persisted target", () => {
  const authority = createSyntheticServiceOperatorAuthority({
    grants: [
      {
        actions: ["issue"],
        actorUserId: "operator-1",
        agreementVersionId: "version-1",
        engagementId: "engagement-a",
        termsSha256: "f".repeat(64),
      },
    ],
  });
  assert.equal(authority.decide(authorityRequest()).allowed, true);
  for (const mismatched of [
    { agreementVersionId: "version-2" },
    { engagementId: "engagement-b" },
    { termsSha256: "0".repeat(64) },
  ]) {
    assert.deepEqual(authority.decide(authorityRequest(mismatched)), {
      allowed: false,
      reasonCode: "issuance_authority_denied",
    });
  }
});

test("synthetic verifier rejects forged or rebound signature payloads", async () => {
  const verified = createSyntheticServiceSignatureEvidenceVerifier({
    records: [
      {
        evidenceId,
        signaturePayloadSha256: payloadSha256,
        outcome: "verified",
      },
      {
        evidenceId: "123e4567-e89b-42d3-a456-426614174099",
        signaturePayloadSha256: payloadSha256,
        outcome: "forged",
      },
    ],
  });
  const good = await verified.verify(verificationInput());
  assert.equal(good.status, "verified");
  if (good.status === "verified") {
    assert.equal(good.provenance, SYNTHETIC_AUTHORITY_PROVENANCE);
  }

  // Same evidence ID presented with a different payload hash is a forgery.
  const rebound = await verified.verify({
    ...verificationInput(),
    signaturePayloadSha256: "0".repeat(64),
  });
  assert.equal(rebound.status, "rejected");
  if (rebound.status === "rejected") {
    assert.equal(rebound.reasonCode, "synthetic_evidence_binding_mismatch");
  }

  const forged = await verified.verify({
    ...verificationInput(),
    evidenceId: "123e4567-e89b-42d3-a456-426614174099",
  });
  assert.equal(forged.status, "rejected");
  if (forged.status === "rejected") {
    assert.equal(forged.reasonCode, "synthetic_forged_signature_evidence");
  }

  // Unknown evidence never becomes verified.
  const unknown = await verified.verify({
    ...verificationInput(),
    evidenceId: "123e4567-e89b-42d3-a456-426614174000",
  });
  assert.equal(unknown.status, "rejected");
});

test("synthetic resource resolver returns only explicit exact resources", () => {
  const resolver = createSyntheticProjectResourceDisclosureResolver({
    resources: [
      {
        projectId: "project-a",
        resourceCategory: "project_document",
        resourceId: "11111111-1111-4111-8111-111111111111",
        ownerUserId: "owner-a",
        version: 2,
      },
    ],
  });
  assert.deepEqual(
    resolver.resolve({
      projectId: "project-a",
      resourceCategory: "project_document",
      resourceId: "11111111-1111-4111-8111-111111111111",
    }),
    {
      found: true,
      projectId: "project-a",
      ownerUserId: "owner-a",
      version: 2,
      category: "project_document",
      fingerprint:
        "synthetic-fingerprint-11111111-1111-4111-8111-111111111111-v2",
    }
  );
  assert.deepEqual(
    resolver.resolve({
      projectId: "project-b",
      resourceCategory: "project_document",
      resourceId: "11111111-1111-4111-8111-111111111111",
    }),
    { found: false, reasonCode: "resource_not_found" }
  );
});

test("R1-05: the revalidator rejects an observation that changed mid-flight", async () => {
  const resourceId = "11111111-1111-4111-8111-111111111111";
  const observed = {
    projectId: "project-a",
    resourceCategory: "project_document",
    resourceId,
    ownerUserId: "owner-a",
    version: 2,
    fingerprint: "doc-v2-original",
  };
  const unchanged = createSyntheticProjectResourceRevalidator({
    resources: [observed],
  });
  const current = await unchanged.revalidate({
    projectId: "project-a",
    resourceCategory: "project_document",
    resourceId,
    resourceOwnerUserId: "owner-a",
    resourceVersion: 2,
    resourceFingerprint: "doc-v2-original",
  });
  assert.equal(current.found, true);

  // Same version, different bytes: the grant observation is stale.
  const rewritten = createSyntheticProjectResourceRevalidator({
    resources: [{ ...observed, fingerprint: "doc-v2-rewritten" }],
  });
  assert.deepEqual(
    await rewritten.revalidate({
      projectId: "project-a",
      resourceCategory: "project_document",
      resourceId,
      resourceOwnerUserId: "owner-a",
      resourceVersion: 2,
      resourceFingerprint: "doc-v2-original",
    }),
    { found: false, reasonCode: "resource_not_found" }
  );

  // Concurrent version bump also invalidates the observation.
  const bumped = createSyntheticProjectResourceRevalidator({
    resources: [{ ...observed, version: 3, fingerprint: "doc-v3-new" }],
  });
  assert.deepEqual(
    await bumped.revalidate({
      projectId: "project-a",
      resourceCategory: "project_document",
      resourceId,
      resourceOwnerUserId: "owner-a",
      resourceVersion: 2,
      resourceFingerprint: "doc-v2-original",
    }),
    { found: false, reasonCode: "resource_not_found" }
  );

  // Ownership transfer invalidates it too.
  const transferred = createSyntheticProjectResourceRevalidator({
    resources: [{ ...observed, ownerUserId: "owner-b" }],
  });
  assert.deepEqual(
    await transferred.revalidate({
      projectId: "project-a",
      resourceCategory: "project_document",
      resourceId,
      resourceOwnerUserId: "owner-a",
      resourceVersion: 2,
      resourceFingerprint: "doc-v2-original",
    }),
    { found: false, reasonCode: "resource_not_found" }
  );
});

test("signature payload hash binds version, terms, signer and evidence", () => {
  const payload = buildServiceSignaturePayload({
    engagementId: "engagement-a",
    agreementVersionId: "version-1",
    termsSha256: "a".repeat(64),
    signerUserId: "owner-a",
    evidenceRef: "envelope-1",
    evidenceSha256: "b".repeat(64),
    signedAt: "2026-10-29T00:00:00.000Z",
  });
  const hash = hashServiceSignaturePayload(payload);
  assert.match(hash, /^[0-9a-f]{64}$/u);
  for (const changed of [
    { ...payload, agreementVersionId: "version-2" },
    { ...payload, termsSha256: "c".repeat(64) },
    { ...payload, signerUserId: "owner-b" },
    { ...payload, evidenceSha256: "d".repeat(64) },
    { ...payload, signedAt: "2026-10-30T00:00:00.000Z" },
  ]) {
    assert.notEqual(hashServiceSignaturePayload(changed), hash);
  }
});
