import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServiceOperatorAuthorityRequest } from "./authority";
import { ServiceEngagementError } from "./errors";
import { createServiceEngagementHandlers } from "./http";
import {
  hashServiceOperatorAuthorityRequest,
  parseServiceAgreementTerms,
  SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256,
  SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
} from "./policy";

const projectId = "123e4567-e89b-42d3-a456-426614174001";
const engagementId = "123e4567-e89b-42d3-a456-426614174002";
const agreementVersionId = "123e4567-e89b-42d3-a456-426614174003";
const evidenceId = "123e4567-e89b-42d3-a456-426614174004";
const grantId = "123e4567-e89b-42d3-a456-426614174005";
const assignmentId = "123e4567-e89b-42d3-a456-426614174006";
const resourceId = "123e4567-e89b-42d3-a456-426614174007";
const ownerUserId = "123e4567-e89b-42d3-a456-426614174008";
const lawyerUserId = "123e4567-e89b-42d3-a456-426614174009";
const sha256 = "a".repeat(64);
const resourceFingerprint = "doc-v3-abcdef";

/**
 * Canonical operator-authority request fixture. The hash is recomputed so the
 * fake repository returns exactly what a real repository would derive.
 */
function operatorAuthorityRequest(
  overrides: Partial<ServiceOperatorAuthorityRequest> = {}
): ServiceOperatorAuthorityRequest {
  const base = {
    action: "issue" as const,
    agreementVersionId,
    agreementVersionStatus: "draft" as string | null,
    engagementId,
    engagementStatus: "awaiting_customer_action",
    evidenceId: null as string | null,
    evidenceVerificationStatus: null as string | null,
    operatorAssignmentId: assignmentId,
    operatorAssignmentStatus: "active" as const,
    operatorEligible: true,
    operatorEmailVerified: true,
    operatorRole: "lawyer" as const,
    operatorUserId: lawyerUserId,
    projectId,
    scopeCodes: ["school_admissions"] as const,
    serviceMode: "managed",
    signerUserId: null as string | null,
    termsSha256: sha256,
    versionNumber: 1 as number | null,
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    actorUserId: merged.operatorUserId,
    requestSha256: hashServiceOperatorAuthorityRequest(merged),
  };
}

const terms = {
  schemaVersion: SERVICE_AGREEMENT_TERMS_SCHEMA_VERSION,
  title: "Synthetic managed scope",
  serviceMode: "managed",
  scopeCodes: ["school_admissions"],
  clauses: [
    {
      clauseId: "scope",
      heading: "Scope",
      body: "Synthetic clause for offline handler tests.",
    },
  ],
};

const parsedTerms = parseServiceAgreementTerms(terms);
if (!parsedTerms) {
  throw new Error("synthetic agreement terms must parse");
}

function request(method: string, path: string, body?: unknown) {
  return new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function noopRepository() {
  return {
    createEngagement() {
      return {
        replayed: false,
        projectRevision: 9,
        engagement: { engagementId },
      };
    },
    listEngagements() {
      return { items: [], hasMore: false };
    },
    getEngagement() {
      return { scope: "owner", engagement: { engagementId } };
    },
    createAgreementVersion() {
      return { replayed: false, projectRevision: 10, agreementVersion: {} };
    },
    issueAgreementVersion() {
      return { replayed: false, projectRevision: 11, agreementVersion: {} };
    },
    loadServiceOperatorContext() {
      return {
        agreementVersionStatus: "draft",
        engagementStatus: "awaiting_customer_action",
        operatorAssignmentId: assignmentId,
        operatorAssignmentStatus: "active",
        operatorAuthority: operatorAuthorityRequest(),
        operatorEligible: true,
        scopeCodes: ["school_admissions"],
        serviceMode: "managed",
        termsSha256: sha256,
        versionNumber: 1,
      };
    },
    acceptAgreementVersion() {
      return { replayed: false, projectRevision: 12, acceptance: {} };
    },
    submitSignatureEvidence() {
      return { replayed: false, projectRevision: 13, signatureEvidence: {} };
    },
    loadSignatureVerificationTarget() {
      return {
        evidenceId,
        engagementId,
        projectId,
        agreementVersionId,
        termsSha256: sha256,
        signaturePayloadSha256: sha256,
        evidenceRef: "envelope-1",
        evidenceSha256: sha256,
        signerUserId: ownerUserId,
        declaredSignedAt: "2026-10-28T00:00:00.000Z",
        operatorAuthority: operatorAuthorityRequest({
          action: "verify_signature",
          agreementVersionId,
          evidenceId,
          evidenceVerificationStatus: "pending",
          signerUserId: ownerUserId,
        }),
      };
    },
    recordSignatureVerification() {
      return { replayed: false, projectRevision: 14, signatureEvidence: {} };
    },
    transitionEngagement() {
      return { replayed: false, projectRevision: 15, engagement: {} };
    },
    createDisclosureGrant() {
      return { replayed: false, projectRevision: 16, grant: { grantId } };
    },
    listDisclosureGrants() {
      return { scope: "resource_owner", items: [], hasMore: false };
    },
    loadDisclosureAccessContext() {
      return {
        projectActive: true,
        accessRole: "recipient_current",
        metadataAuthorized: true,
        metadataPolicyCode: "m4-004-recipient-current-access",
        resourceOwnerEligible: true,
        grant: {
          grantId,
          projectId,
          resourceOwnerUserId: ownerUserId,
          recipientAssignmentId: assignmentId,
          recipientUserId: lawyerUserId,
          resourceCategory: "project_document",
          resourceId,
          resourceVersion: 3,
          resourceFingerprint,
          purposeCode: "professional_review",
          status: "granted",
          expiresAt: null,
        },
        assignment: {
          assignmentId,
          projectId,
          staffUserId: lawyerUserId,
          staffEmailSha256: sha256,
          status: "active",
          purpose: "project_staff_collaboration",
        },
        actor: {
          userId: lawyerUserId,
          role: "lawyer",
          nonGuest: true,
          emailVerified: true,
          staffEmailSha256: sha256,
        },
        requested: {
          resourceCategory: "project_document",
          resourceId,
          resourceVersion: 3,
          purposeCode: "professional_review",
        },
      };
    },
    revokeDisclosureGrant() {
      return { replayed: false, projectRevision: 17, grant: { grantId } };
    },
  };
}

function makeHandlers(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ method: string; input: Record<string, unknown> }> = [];
  const base = noopRepository();
  const repository = Object.fromEntries(
    Object.entries(base).map(([name, fn]) => [
      name,
      (input: Record<string, unknown>) => {
        calls.push({ method: name, input });
        return (fn as (value: unknown) => unknown)(input);
      },
    ])
  );
  const deps = {
    authenticate: async () => ({
      userId: ownerUserId,
      type: "regular" as const,
    }),
    enabled: () => true,
    schemaAvailable: async () => true,
    repository,
    rateLimit: async () => true,
    issuanceAuthority: {
      code: "synthetic_test",
      decide: () => ({
        allowed: true as const,
        authorityCode: "synthetic_test_contract_operator",
      }),
    },
    signatureVerifier: {
      code: "synthetic_test",
      verify: () => ({
        status: "verified" as const,
        evidenceId,
        agreementVersionId,
        signaturePayloadSha256: sha256,
        method: "manual_evidence_review" as const,
        providerCode: "synthetic_test_verifier",
        provenance: "synthetic_test_only_not_legally_attested",
        verifiedAt: "2026-10-29T00:00:00.000Z",
      }),
    },
    resourceResolver: {
      code: "synthetic_test",
      resolve: () => ({
        found: true as const,
        projectId,
        ownerUserId,
        version: 3,
        category: "project_document" as const,
        fingerprint: resourceFingerprint,
      }),
    },
    now: () => new Date("2026-10-29T00:00:00.000Z"),
    ...overrides,
  } as unknown as Parameters<typeof createServiceEngagementHandlers>[0];
  return { handlers: createServiceEngagementHandlers(deps), calls };
}

test("authentication, guest, flag, schema and rate-limit gates fail closed", async () => {
  const unauthenticated = makeHandlers({ authenticate: async () => null });
  assert.equal(
    (
      await unauthenticated.handlers.listEngagements(
        request("GET", "/"),
        projectId
      )
    ).status,
    401
  );

  const guest = makeHandlers({
    authenticate: async () => ({ userId: ownerUserId, type: "guest" }),
  });
  assert.equal(
    (await guest.handlers.listEngagements(request("GET", "/"), projectId))
      .status,
    404
  );

  const disabled = makeHandlers({ enabled: () => false });
  assert.equal(
    (
      await disabled.handlers.createEngagement(
        request("POST", "/", {
          serviceMode: "self_service",
          scopeCodes: ["school_admissions"],
          expectedProjectRevision: 3,
          operationId: "op-disabled",
        }),
        projectId
      )
    ).status,
    404
  );
  assert.equal(disabled.calls.length, 0);

  const missingSchema = makeHandlers({ schemaAvailable: async () => false });
  assert.equal(
    (
      await missingSchema.handlers.engagementDetail(
        request("GET", "/"),
        projectId,
        engagementId
      )
    ).status,
    503
  );

  const throttled = makeHandlers({ rateLimit: async () => false });
  assert.equal(
    (await throttled.handlers.listEngagements(request("GET", "/"), projectId))
      .status,
    429
  );

  const throttledError = makeHandlers({
    rateLimit: () => Promise.reject(new Error("redis down")),
  });
  assert.equal(
    (
      await throttledError.handlers.listEngagements(
        request("GET", "/"),
        projectId
      )
    ).status,
    503
  );
});

test("engagement creation derives the actor server-side and rejects caller authority", async () => {
  const { handlers, calls } = makeHandlers();
  const created = await handlers.createEngagement(
    request("POST", "/", {
      serviceMode: "self_service",
      scopeCodes: ["school_admissions"],
      expectedProjectRevision: 4,
      operationId: "engagement-create-1",
    }),
    projectId
  );
  assert.equal(created.status, 201);
  assert.equal(calls[0]?.method, "createEngagement");
  assert.equal(calls[0]?.input.actorUserId, ownerUserId);
  assert.equal(calls[0]?.input.serviceMode, "self_service");
  assert.deepEqual(calls[0]?.input.scopeCodes, ["school_admissions"]);
  assert.match(String(calls[0]?.input.requestHash), /^[0-9a-f]{64}$/u);

  for (const injected of [
    { actorUserId: lawyerUserId },
    { customerOwnerUserId: lawyerUserId },
    { projectId },
    { role: "admin" },
    { approved: true },
  ]) {
    const response = await handlers.createEngagement(
      request("POST", "/", {
        serviceMode: "self_service",
        scopeCodes: ["school_admissions"],
        expectedProjectRevision: 4,
        operationId: "engagement-create-2",
        ...injected,
      }),
      projectId
    );
    assert.equal(response.status, 400, JSON.stringify(injected));
  }
  assert.equal(calls.length, 1);

  const invalidScope = await handlers.createEngagement(
    request("POST", "/", {
      serviceMode: "self_service",
      scopeCodes: ["not_a_service"],
      expectedProjectRevision: 4,
      operationId: "engagement-create-3",
    }),
    projectId
  );
  assert.equal(invalidScope.status, 400);

  const invalidProject = await handlers.createEngagement(
    request("POST", "/", {
      serviceMode: "self_service",
      scopeCodes: ["school_admissions"],
      expectedProjectRevision: 4,
      operationId: "engagement-create-4",
    }),
    "not-a-uuid"
  );
  assert.equal(invalidProject.status, 404);
});

test("agreement issuance is authority-gated and canonicalizes terms", async () => {
  const { handlers, calls } = makeHandlers();
  const created = await handlers.createAgreement(
    request("POST", "/", {
      terms,
      expectedProjectRevision: 5,
      operationId: "agreement-draft-1",
    }),
    projectId,
    engagementId
  );
  assert.equal(created.status, 201);
  // R1-04: the handler first loads the persisted target + operator eligibility,
  // then asks the authority about that exact request, then mutates.
  assert.equal(calls[0]?.method, "loadServiceOperatorContext");
  assert.equal(calls[0]?.input.action, "author_draft");
  assert.equal(calls[1]?.method, "createAgreementVersion");
  assert.equal(calls[1]?.input.actorUserId, ownerUserId);
  assert.equal(
    calls[1]?.input.authorityRequestSha256,
    operatorAuthorityRequest().requestSha256
  );
  assert.match(String(calls[1]?.input.agreementVersionId), /^[0-9a-f-]{36}$/u);
  assert.equal(
    calls[1]?.input.authorityCode,
    "synthetic_test_contract_operator"
  );
  assert.equal(calls[1]?.input.termsSha256, parsedTerms?.termsSha256);
  assert.equal(calls[1]?.input.termsPayload, parsedTerms?.payload);

  const denied = makeHandlers({
    issuanceAuthority: {
      code: "deny_by_default",
      decide: () => ({
        allowed: false,
        reasonCode: "issuance_authority_unavailable",
      }),
    },
  });
  const deniedResponse = await denied.handlers.createAgreement(
    request("POST", "/", {
      terms,
      expectedProjectRevision: 5,
      operationId: "agreement-draft-2",
    }),
    projectId,
    engagementId
  );
  assert.equal(deniedResponse.status, 403);
  // R1-04: only the target load happened; the authority denial prevented any
  // mutation from being attempted.
  assert.deepEqual(
    denied.calls.map((call) => call.method),
    ["loadServiceOperatorContext"]
  );

  const invalidTerms = await handlers.createAgreement(
    request("POST", "/", {
      terms: { ...terms, extra: true },
      expectedProjectRevision: 5,
      operationId: "agreement-draft-3",
    }),
    projectId,
    engagementId
  );
  assert.equal(invalidTerms.status, 400);

  const issued = await handlers.issueAgreement(
    request("POST", "/", {
      expectedProjectRevision: 6,
      operationId: "agreement-issue-1",
    }),
    projectId,
    engagementId,
    agreementVersionId
  );
  assert.equal(issued.status, 200);
  const issueCall = calls.find(
    (call) => call.method === "issueAgreementVersion"
  );
  assert.equal(
    issueCall?.input.authorityCode,
    "synthetic_test_contract_operator"
  );
  assert.equal(
    issueCall?.input.authorityRequestSha256,
    operatorAuthorityRequest().requestSha256
  );
  assert.equal(issueCall?.input.agreementVersionId, agreementVersionId);
});

test("acceptance is bound to the exact version, hash and notice version", async () => {
  const { handlers, calls } = makeHandlers();
  const accepted = await handlers.acceptAgreement(
    request("POST", "/", {
      accepted: true,
      termsSha256: sha256,
      customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
      expectedProjectRevision: 7,
      operationId: "acceptance-1",
    }),
    projectId,
    engagementId,
    agreementVersionId
  );
  assert.equal(accepted.status, 201);
  assert.equal(calls[0]?.method, "acceptAgreementVersion");
  assert.equal(calls[0]?.input.termsSha256, sha256);
  assert.equal(
    calls[0]?.input.customerNoticeVersion,
    SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION
  );
  const body = (await accepted.json()) as { signatureNotice: string };
  assert.match(body.signatureNotice, /not a verified electronic signature/u);

  const invalidBodies = [
    {
      accepted: true,
      termsSha256: sha256,
      customerNoticeVersion: "m4-003-thread-participation-v1",
      expectedProjectRevision: 7,
      operationId: "acceptance-2",
    },
    {
      accepted: true,
      termsSha256: "short",
      customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
      expectedProjectRevision: 7,
      operationId: "acceptance-3",
    },
    {
      accepted: false,
      termsSha256: sha256,
      customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
      expectedProjectRevision: 7,
      operationId: "acceptance-4",
    },
    {
      accepted: true,
      termsSha256: sha256,
      customerNoticeVersion: SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_VERSION,
      expectedProjectRevision: 7,
      operationId: "acceptance-5",
      signed: true,
    },
  ];
  for (const invalid of invalidBodies) {
    const response = await handlers.acceptAgreement(
      request("POST", "/", invalid),
      projectId,
      engagementId,
      agreementVersionId
    );
    assert.equal(response.status, 400, JSON.stringify(invalid));
  }
  assert.equal(calls.length, 1);
  assert.match(SERVICE_ENGAGEMENT_AGREEMENT_NOTICE_SHA256, /^[0-9a-f]{64}$/u);
});

test("signature submission accepts only pending evidence and rejects future times", async () => {
  const { handlers, calls } = makeHandlers();
  const submitted = await handlers.submitSignature(
    request("POST", "/", {
      agreementVersionId,
      termsSha256: sha256,
      evidenceRef: "envelope-1",
      evidenceSha256: sha256,
      declaredSignedAt: "2026-10-28T00:00:00.000Z",
      expectedProjectRevision: 8,
      operationId: "signature-1",
    }),
    projectId,
    engagementId
  );
  assert.equal(submitted.status, 201);
  assert.equal(calls[0]?.method, "submitSignatureEvidence");
  assert.equal(calls[0]?.input.actorUserId, ownerUserId);
  assert.deepEqual(
    calls[0]?.input.declaredSignedAt,
    new Date("2026-10-28T00:00:00.000Z")
  );
  const body = (await submitted.json()) as { verificationNotice: string };
  assert.match(body.verificationNotice, /pending/u);

  const future = await handlers.submitSignature(
    request("POST", "/", {
      agreementVersionId,
      termsSha256: sha256,
      evidenceRef: "envelope-1",
      evidenceSha256: sha256,
      declaredSignedAt: "2026-10-30T00:00:00.000Z",
      expectedProjectRevision: 8,
      operationId: "signature-2",
    }),
    projectId,
    engagementId
  );
  assert.equal(future.status, 400);

  const malformedRef = await handlers.submitSignature(
    request("POST", "/", {
      agreementVersionId,
      termsSha256: sha256,
      evidenceRef: "envelope 1",
      evidenceSha256: sha256,
      declaredSignedAt: "2026-10-28T00:00:00.000Z",
      expectedProjectRevision: 8,
      operationId: "signature-3",
    }),
    projectId,
    engagementId
  );
  assert.equal(malformedRef.status, 400);

  const claimedVerified = await handlers.submitSignature(
    request("POST", "/", {
      agreementVersionId,
      termsSha256: sha256,
      evidenceRef: "envelope-1",
      evidenceSha256: sha256,
      declaredSignedAt: "2026-10-28T00:00:00.000Z",
      expectedProjectRevision: 8,
      operationId: "signature-4",
      verificationStatus: "verified",
    }),
    projectId,
    engagementId
  );
  assert.equal(claimedVerified.status, 400);
  assert.equal(calls.length, 1);
});

test("signature verification is decided only by the injected verifier port", async () => {
  const unavailable = makeHandlers({
    signatureVerifier: {
      code: "deny_by_default_unverified",
      verify: () => ({
        status: "unavailable",
        reasonCode: "verification_provider_unavailable",
      }),
    },
  });
  const unavailableResponse = await unavailable.handlers.verifySignature(
    request("POST", "/", {
      expectedProjectRevision: 9,
      operationId: "verify-1",
    }),
    projectId,
    engagementId,
    evidenceId
  );
  assert.equal(unavailableResponse.status, 503);
  assert.equal(
    unavailable.calls.some(
      (call) => call.method === "recordSignatureVerification"
    ),
    false
  );
  const unavailableBody = (await unavailableResponse.json()) as {
    error: string;
  };
  assert.match(unavailableBody.error, /remains pending/u);

  const { handlers, calls } = makeHandlers();
  const verified = await handlers.verifySignature(
    request("POST", "/", {
      expectedProjectRevision: 9,
      operationId: "verify-2",
    }),
    projectId,
    engagementId,
    evidenceId
  );
  assert.equal(verified.status, 200);
  const recorded = calls.find(
    (call) => call.method === "recordSignatureVerification"
  );
  assert.equal(recorded?.input.actorUserId, ownerUserId);
  assert.equal(
    (recorded?.input.outcome as { status: string } | undefined)?.status,
    "verified"
  );
  // The client may never claim a verification outcome itself.
  const clientClaim = await handlers.verifySignature(
    request("POST", "/", {
      expectedProjectRevision: 9,
      operationId: "verify-3",
      verificationStatus: "verified",
    }),
    projectId,
    engagementId,
    evidenceId
  );
  assert.equal(clientClaim.status, 400);
});

test("engagement lifecycle actions are a closed enum", async () => {
  const { handlers, calls } = makeHandlers();
  for (const action of ["activate", "suspend", "resume", "terminate"]) {
    const response = await handlers.lifecycle(
      request("POST", "/", {
        action,
        expectedProjectRevision: 10,
        operationId: `lifecycle-${action}`,
      }),
      projectId,
      engagementId
    );
    assert.equal(response.status, 200, action);
  }
  assert.deepEqual(
    calls.map((call) => (call.input as { action: string }).action),
    ["activate", "suspend", "resume", "terminate"]
  );
  const invalid = await handlers.lifecycle(
    request("POST", "/", {
      action: "approve",
      expectedProjectRevision: 10,
      operationId: "lifecycle-invalid",
    }),
    projectId,
    engagementId
  );
  assert.equal(invalid.status, 400);
});

test("disclosure grants require a resolved resource and reject caller-supplied identity", async () => {
  const { handlers, calls } = makeHandlers();
  const created = await handlers.createDisclosure(
    request("POST", "/", {
      accepted: true,
      assignmentId,
      resourceCategory: "project_document",
      resourceId,
      resourceVersion: 3,
      purposeCode: "professional_review",
      expectedProjectRevision: 11,
      operationId: "disclosure-1",
    }),
    projectId
  );
  assert.equal(created.status, 201);
  assert.equal(calls[0]?.method, "createDisclosureGrant");
  assert.equal(calls[0]?.input.actorUserId, ownerUserId);
  assert.equal(calls[0]?.input.assignmentId, assignmentId);
  assert.deepEqual(calls[0]?.input.resource, {
    found: true,
    projectId,
    ownerUserId,
    version: 3,
    category: "project_document",
    fingerprint: resourceFingerprint,
  });
  // R1-05: the observation is bound to the adapter and the exact fingerprint.
  assert.equal(calls[0]?.input.observationAdapterCode, "synthetic_test");
  assert.match(
    String(calls[0]?.input.resourceObservationSha256),
    /^[0-9a-f]{64}$/u
  );
  const body = (await created.json()) as {
    disclosureNotice: { noticeVersion: string };
  };
  assert.equal(
    body.disclosureNotice.noticeVersion,
    "m4-004-resource-disclosure-v1"
  );

  // Production default: no verified source adapter, so nothing is persisted.
  const unsupported = makeHandlers({
    resourceResolver: {
      code: "unsupported_no_verified_source_adapter",
      resolve: () => ({
        found: false,
        reasonCode: "resource_source_unavailable",
      }),
    },
  });
  const unsupportedResponse = await unsupported.handlers.createDisclosure(
    request("POST", "/", {
      accepted: true,
      assignmentId,
      resourceCategory: "project_document",
      resourceId,
      resourceVersion: 3,
      purposeCode: "professional_review",
      expectedProjectRevision: 11,
      operationId: "disclosure-2",
    }),
    projectId
  );
  assert.equal(unsupportedResponse.status, 409);
  assert.equal(unsupported.calls.length, 0);

  const injectedFields = [
    { resourceOwnerUserId: lawyerUserId },
    { recipientUserId: lawyerUserId },
    { recipientAssignmentId: assignmentId },
    { status: "granted" },
    { projectId: "123e4567-e89b-42d3-a456-426614174099" },
    { accepted: false },
  ];
  for (const injected of injectedFields) {
    const response = await handlers.createDisclosure(
      request("POST", "/", {
        accepted: true,
        assignmentId,
        resourceCategory: "project_document",
        resourceId,
        resourceVersion: 3,
        purposeCode: "professional_review",
        expectedProjectRevision: 11,
        operationId: "disclosure-3",
        ...injected,
      }),
      projectId
    );
    assert.equal(response.status, 400, JSON.stringify(injected));
  }

  const privateChat = await handlers.createDisclosure(
    request("POST", "/", {
      accepted: true,
      assignmentId,
      resourceCategory: "private_chat",
      resourceId,
      resourceVersion: 3,
      purposeCode: "professional_review",
      expectedProjectRevision: 11,
      operationId: "disclosure-4",
    }),
    projectId
  );
  assert.equal(privateChat.status, 400);
  assert.equal(calls.length, 1);
});

test("disclosure detail returns metadata plus an explicit fail-closed decision", async () => {
  const allowed = makeHandlers();
  const allowedResponse = await allowed.handlers.disclosureDetail(
    request("GET", "/"),
    projectId,
    grantId
  );
  assert.equal(allowedResponse.status, 200);
  const allowedBody = (await allowedResponse.json()) as {
    decision: { decision: string; reasonCode: string };
    grant: Record<string, unknown>;
  };
  assert.deepEqual(allowedBody.decision, {
    decision: "ALLOW",
    reasonCode: "allowed",
  });
  assert.equal("content" in allowedBody.grant, false);

  const unsupported = makeHandlers({
    resourceResolver: {
      code: "unsupported_no_verified_source_adapter",
      resolve: () => ({
        found: false,
        reasonCode: "resource_source_unavailable",
      }),
    },
  });
  const deniedResponse = await unsupported.handlers.disclosureDetail(
    request("GET", "/"),
    projectId,
    grantId
  );
  assert.equal(deniedResponse.status, 200);
  const deniedBody = (await deniedResponse.json()) as {
    decision: { decision: string; reasonCode: string };
  };
  assert.deepEqual(deniedBody.decision, {
    decision: "DENY",
    reasonCode: "resource_source_unavailable",
  });
});

test("revocation requires the owner reason vocabulary and maps errors safely", async () => {
  const { handlers, calls } = makeHandlers();
  const revoked = await handlers.revokeDisclosure(
    request("DELETE", "/", {
      reasonCode: "owner_revoked",
      expectedProjectRevision: 12,
      operationId: "revoke-1",
    }),
    projectId,
    grantId
  );
  assert.equal(revoked.status, 200);
  assert.equal(calls[0]?.method, "revokeDisclosureGrant");

  const invalidReason = await handlers.revokeDisclosure(
    request("DELETE", "/", {
      reasonCode: "admin_revoked",
      expectedProjectRevision: 12,
      operationId: "revoke-2",
    }),
    projectId,
    grantId
  );
  assert.equal(invalidReason.status, 400);

  const failures: [ServiceEngagementError["code"], number][] = [
    ["not_found", 404],
    ["forbidden", 403],
    ["authority_denied", 403],
    ["state_conflict", 409],
    ["revision_conflict", 409],
    ["idempotency_conflict", 409],
    ["verification_unavailable", 503],
    ["resource_unavailable", 409],
    ["integrity_conflict", 503],
  ];
  for (const [code, status] of failures) {
    const failing = makeHandlers({
      repository: {
        ...noopRepository(),
        listDisclosureGrants() {
          throw new ServiceEngagementError(code);
        },
      },
    });
    const response = await failing.handlers.listDisclosures(
      request("GET", "/"),
      projectId
    );
    assert.equal(response.status, status, code);
  }

  const unknown = makeHandlers({
    repository: {
      ...noopRepository(),
      listDisclosureGrants() {
        throw new Error("database exploded");
      },
    },
  });
  const unknownResponse = await unknown.handlers.listDisclosures(
    request("GET", "/"),
    projectId
  );
  assert.equal(unknownResponse.status, 503);
  const unknownBody = (await unknownResponse.json()) as { error: string };
  assert.equal(unknownBody.error, "Service engagement service is unavailable.");
});

test("list endpoints reject invalid page limits and malformed identifiers", async () => {
  const { handlers } = makeHandlers();
  assert.equal(
    (await handlers.listEngagements(request("GET", "/?limit=0"), projectId))
      .status,
    400
  );
  assert.equal(
    (await handlers.listDisclosures(request("GET", "/?limit=999"), projectId))
      .status,
    400
  );
  assert.equal(
    (await handlers.listEngagements(request("GET", "/"), "not-a-uuid")).status,
    404
  );
  assert.equal(
    (
      await handlers.disclosureDetail(
        request("GET", "/"),
        projectId,
        "not-a-uuid"
      )
    ).status,
    404
  );
});

test("R2-03: staff Engagement detail is denied and the owner keeps full access", async () => {
  // The repository denies staff/member/admin/guest detail outright; the handler
  // only surfaces that denial and never invents a staff projection.
  const staff = makeHandlers({
    repository: {
      ...noopRepository(),
      getEngagement() {
        throw new ServiceEngagementError("not_found");
      },
    },
  });
  const response = await staff.handlers.engagementDetail(
    request("GET", "/"),
    projectId,
    engagementId
  );
  assert.equal(response.status, 404);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal("engagement" in body, false);
  assert.equal("scope" in body, false);

  const owner = makeHandlers({
    repository: {
      ...noopRepository(),
      getEngagement() {
        return {
          scope: "owner",
          engagement: {
            engagementId,
            projectId,
            serviceMode: "managed",
            scopeCodes: ["school_admissions"],
            status: "awaiting_customer_action",
            revision: 2,
            currentAgreementVersionId: agreementVersionId,
            createdAt: "2026-10-29T00:00:00.000Z",
            updatedAt: "2026-10-29T00:00:00.000Z",
            activatedAt: null,
            suspendedAt: null,
            terminatedAt: null,
            terminalReasonCode: null,
            agreementVersions: [],
          },
        };
      },
    },
  });
  const ownerResponse = await owner.handlers.engagementDetail(
    request("GET", "/"),
    projectId,
    engagementId
  );
  assert.equal(ownerResponse.status, 200);
  const ownerBody = (await ownerResponse.json()) as {
    engagement: { serviceMode: string; status: string };
  };
  assert.equal(ownerBody.engagement.serviceMode, "managed");
  assert.equal(ownerBody.engagement.status, "awaiting_customer_action");
});

test("R1-02: resource-owner audit returns no access decision", async () => {
  const audit = makeHandlers({
    repository: {
      ...noopRepository(),
      loadDisclosureAccessContext() {
        return {
          projectActive: true,
          accessRole: "resource_owner_audit",
          metadataAuthorized: true,
          metadataPolicyCode: "m4-004-resource-owner-audit",
          resourceOwnerEligible: false,
          grant: {
            grantId,
            projectId,
            resourceOwnerUserId: ownerUserId,
            recipientAssignmentId: assignmentId,
            recipientUserId: lawyerUserId,
            resourceCategory: "project_document",
            resourceId,
            resourceVersion: 3,
            resourceFingerprint,
            purposeCode: "professional_review",
            status: "revoked",
            expiresAt: null,
          },
          assignment: null,
          actor: {
            userId: ownerUserId,
            role: "user",
            nonGuest: true,
            emailVerified: true,
            staffEmailSha256: sha256,
          },
          requested: {
            resourceCategory: "project_document",
            resourceId,
            resourceVersion: 3,
            purposeCode: "professional_review",
          },
        };
      },
    },
  });
  const response = await audit.handlers.disclosureDetail(
    request("GET", "/"),
    projectId,
    grantId
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    accessRole: string;
    auditOnly: boolean;
    decision: unknown;
    resourceOwnerEligible: boolean;
    grant: { status: string };
  };
  assert.equal(body.accessRole, "resource_owner_audit");
  assert.equal(body.auditOnly, true);
  // A Grant record is not an access authorization: no evaluator decision exists.
  assert.equal(body.decision, null);
  assert.equal(body.resourceOwnerEligible, false);
  // The owner's historical audit still sees the record itself.
  assert.equal(body.grant.status, "revoked");
});

test("R1-02: a former recipient receives no grant metadata", async () => {
  // The repository refuses the context for a revoked assignment / demoted
  // account / revoked grant, so the handler surfaces 404 without metadata.
  const revoked = makeHandlers({
    repository: {
      ...noopRepository(),
      loadDisclosureAccessContext() {
        throw new ServiceEngagementError("not_found");
      },
    },
  });
  const response = await revoked.handlers.disclosureDetail(
    request("GET", "/"),
    projectId,
    grantId
  );
  assert.equal(response.status, 404);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal("grant" in body, false);
  assert.equal("decision" in body, false);
});

test("R1-04: signature verification requires an eligible operator decision", async () => {
  let verifierCalls = 0;
  const denied = makeHandlers({
    issuanceAuthority: {
      code: "deny_by_default",
      decide: () => ({
        allowed: false,
        reasonCode: "issuance_authority_unavailable",
      }),
    },
    signatureVerifier: {
      code: "synthetic_test",
      verify: () => {
        verifierCalls += 1;
        return {
          status: "verified" as const,
          evidenceId,
          agreementVersionId,
          signaturePayloadSha256: sha256,
          method: "manual_evidence_review" as const,
          providerCode: "synthetic_test_verifier",
          provenance: "synthetic_test_only_not_legally_attested",
          verifiedAt: "2026-10-29T00:00:00.000Z",
        };
      },
    },
  });
  const deniedResponse = await denied.handlers.verifySignature(
    request("POST", "/", {
      expectedProjectRevision: 9,
      operationId: "verify-r1-denied",
    }),
    projectId,
    engagementId,
    evidenceId
  );
  assert.equal(deniedResponse.status, 403);
  // The authority is consulted before any provider call is spent.
  assert.equal(verifierCalls, 0);
  assert.equal(
    denied.calls.some((call) => call.method === "recordSignatureVerification"),
    false
  );

  const allowed = makeHandlers();
  const allowedResponse = await allowed.handlers.verifySignature(
    request("POST", "/", {
      expectedProjectRevision: 9,
      operationId: "verify-r1-allowed",
    }),
    projectId,
    engagementId,
    evidenceId
  );
  assert.equal(allowedResponse.status, 200);
  const recorded = allowed.calls.find(
    (call) => call.method === "recordSignatureVerification"
  );
  assert.equal(
    recorded?.input.authorityRequestSha256,
    (recorded?.input.authorityRequestSha256 as string | undefined)?.toString()
  );
  assert.equal(
    recorded?.input.authorityRequestSha256,
    operatorAuthorityRequest({
      action: "verify_signature",
      agreementVersionId,
      evidenceId,
      evidenceVerificationStatus: "pending",
      signerUserId: ownerUserId,
    }).requestSha256
  );
});

test("R1-05: a resolver without a fingerprint cannot create a grant", async () => {
  const { handlers, calls } = makeHandlers({
    resourceResolver: {
      code: "synthetic_test_no_fingerprint",
      resolve: () => ({
        found: true as const,
        projectId,
        ownerUserId,
        version: 3,
        category: "project_document" as const,
      }),
    },
  });
  const response = await handlers.createDisclosure(
    request("POST", "/", {
      accepted: true,
      assignmentId,
      resourceCategory: "project_document",
      resourceId,
      resourceVersion: 3,
      purposeCode: "professional_review",
      expectedProjectRevision: 11,
      operationId: "disclosure-no-fingerprint",
    }),
    projectId
  );
  assert.equal(response.status, 409);
  assert.equal(calls.length, 0);
});
