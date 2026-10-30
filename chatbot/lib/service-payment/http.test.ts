// biome-ignore-all lint/suspicious/useAwait: in-memory repository doubles and fixture helpers must be awaitable by contract.
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ServicePaymentContractAuthorityRequest,
  ServicePaymentFinanceAuthorityRequest,
} from "./authority";
import { denyAllServicePaymentFinanceAuthority } from "./authority";
import { ServicePaymentError } from "./errors";
import {
  createServicePaymentHandlers,
  type ServicePaymentHandlerDependencies,
} from "./http";
import { SERVICE_PAYMENT_POLICY_VERSION } from "./policy";
import {
  createSyntheticServicePaymentContractAuthority,
  createSyntheticServicePaymentEvidenceVerifier,
  createSyntheticServicePaymentFinanceAuthority,
  createSyntheticServicePaymentReversalResolver,
} from "./synthetic-authorities";
import { denyAllServicePaymentEvidenceVerifier } from "./verification";

const projectId = "123e4567-e89b-42d3-a456-426614174001";
const engagementId = "123e4567-e89b-42d3-a456-426614174002";
const agreementVersionId = "123e4567-e89b-42d3-a456-426614174003";
const conditionId = "123e4567-e89b-42d3-a456-426614174004";
const evidenceId = "123e4567-e89b-42d3-a456-426614174005";
const ownerUserId = "123e4567-e89b-42d3-a456-426614174006";
const lawyerUserId = "123e4567-e89b-42d3-a456-426614174007";
const sha256 = "a".repeat(64);
const termsSha256 = "b".repeat(64);

const conditionView = {
  agreementTermsSha256: termsSha256,
  agreementVersionId,
  amountMinor: 250_000,
  conditionId,
  contractualBasisCode: "agreement_clause" as const,
  contractualBasisRef: "clause:4.2",
  createdAt: "2026-10-29T00:00:00.000Z",
  currency: "AUD",
  live: true,
  requirement: "required" as const,
  supersededAt: null,
};

const evidenceView = {
  conditionId,
  declaredAmountMinor: 250_000,
  declaredCurrency: "AUD",
  evidenceCategory: "external_transfer_receipt" as const,
  evidenceId,
  paidAt: "2026-10-29T00:00:00.000Z",
  rejectionReasonCode: null,
  submittedAt: "2026-10-29T00:10:00.000Z",
  verificationStatus: "pending" as const,
  verifiedAt: null,
};

function contractAuthorityRequest(
  overrides: Partial<ServicePaymentContractAuthorityRequest> = {}
): ServicePaymentContractAuthorityRequest {
  return {
    actorUserId: lawyerUserId,
    agreementTermsSha256: termsSha256,
    agreementVersionId,
    amountMinor: 250_000,
    contractObservationSha256: sha256,
    contractualBasisCode: "agreement_clause",
    contractualBasisRef: "clause:4.2",
    currency: "AUD",
    engagementId,
    operatorAssignmentId: "123e4567-e89b-42d3-a456-426614174008",
    operatorAssignmentStatus: "active",
    operatorEligible: true,
    projectId,
    requestSha256: sha256,
    requirement: "required",
    ...overrides,
  };
}

function financeAuthorityRequest(
  overrides: Partial<ServicePaymentFinanceAuthorityRequest> = {}
): ServicePaymentFinanceAuthorityRequest {
  return {
    action: "verify_evidence",
    actorUserId: lawyerUserId,
    agreementTermsSha256: termsSha256,
    agreementVersionId,
    amountMinor: 250_000,
    conditionId,
    currency: "AUD",
    engagementId,
    evidenceId,
    observationSha256: sha256,
    operatorAssignmentId: "123e4567-e89b-42d3-a456-426614174008",
    operatorAssignmentStatus: "active",
    operatorEligible: true,
    projectId,
    requestSha256: sha256,
    ...overrides,
  };
}

function jsonRequest(body: unknown) {
  return new Request("https://example.test/api/payments", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

const validConditionBody = {
  agreementVersionId,
  amountMinor: 250_000,
  contractualBasisCode: "agreement_clause",
  contractualBasisRef: "clause:4.2",
  currency: "AUD",
  expectedProjectRevision: 5,
  operationId: "op-condition-1",
  requirement: "required",
};

function buildHandlers(
  overrides: Partial<ServicePaymentHandlerDependencies> = {}
) {
  const calls: string[] = [];
  const repository = {
    async loadContractTarget() {
      calls.push("loadContractTarget");
      return {
        authorityRequest: contractAuthorityRequest(),
        contractObservationSha256: sha256,
      };
    },
    async loadFinanceTarget(input?: { evidenceId?: string | null }) {
      calls.push("loadFinanceTarget");
      const forEvidence = Boolean(input?.evidenceId);
      return {
        authorityRequest: financeAuthorityRequest(),
        condition: conditionView,
        evidence: forEvidence ? evidenceView : null,
        verification: forEvidence
          ? {
              agreementTermsSha256: termsSha256,
              agreementVersionId,
              conditionId,
              declaredAmountMinor: 250_000,
              declaredCurrency: "AUD",
              engagementId,
              evidenceCategory: "external_transfer_receipt" as const,
              evidenceId,
              observationSha256: sha256,
              paidAt: "2026-10-29T00:00:00.000Z",
              projectId,
              referenceSha256: "d".repeat(64),
              requestingActorUserId: lawyerUserId,
            }
          : null,
      };
    },
    async loadPaymentStatus() {
      calls.push("loadPaymentStatus");
      return {
        condition: conditionView,
        effective: {
          conditionId,
          contractCurrent: true,
          effectiveEvidenceId: null,
          policyVersion: SERVICE_PAYMENT_POLICY_VERSION,
          reasonCode: "no_evidence" as const,
          status: "REQUIRED_UNSATISFIED" as const,
        },
        engagementId,
        engagementStatus: "active",
        evaluatedAt: "2026-10-29T00:00:00.000Z",
        evidences: [],
        notice: { sha256, version: "m4-005-service-payment-status-v1" },
        policyVersion: SERVICE_PAYMENT_POLICY_VERSION,
        projectRevision: 5,
        provenance: null,
        resolutions: [],
        scope: "owner" as const,
      };
    },
    async recordCondition() {
      calls.push("recordCondition");
      return { condition: conditionView, projectRevision: 6, replayed: false };
    },
    async recordEvidenceVerification() {
      calls.push("recordEvidenceVerification");
      return {
        evidence: {
          conditionId,
          declaredAmountMinor: 250_000,
          declaredCurrency: "AUD",
          evidenceCategory: "external_transfer_receipt" as const,
          evidenceId,
          paidAt: "2026-10-29T00:00:00.000Z",
          rejectionReasonCode: null,
          submittedAt: "2026-10-29T00:10:00.000Z",
          verificationStatus: "verified" as const,
          verifiedAt: "2026-10-29T00:20:00.000Z",
        },
        projectRevision: 7,
        replayed: false,
      };
    },
    async recordResolution() {
      calls.push("recordResolution");
      return {
        projectRevision: 8,
        replayed: false,
        resolution: {
          conditionId,
          evidenceId,
          kind: "refund" as const,
          reasonCode: "bank_return",
          resolutionId: "123e4567-e89b-42d3-a456-426614174009",
          resolvedAt: "2026-10-29T01:00:00.000Z",
          supersedesResolutionId: null,
        },
      };
    },
    async submitEvidence() {
      calls.push("submitEvidence");
      return {
        evidence: {
          conditionId,
          declaredAmountMinor: 250_000,
          declaredCurrency: "AUD",
          evidenceCategory: "external_transfer_receipt" as const,
          evidenceId,
          paidAt: "2026-10-29T00:00:00.000Z",
          rejectionReasonCode: null,
          submittedAt: "2026-10-29T00:10:00.000Z",
          verificationStatus: "pending" as const,
          verifiedAt: null,
        },
        projectRevision: 6,
        replayed: false,
      };
    },
  };
  const deps: ServicePaymentHandlerDependencies = {
    async authenticate() {
      return { type: "regular", userId: lawyerUserId };
    },
    contractAuthority: createSyntheticServicePaymentContractAuthority({
      grants: [{ actorUserId: lawyerUserId }],
    }),
    enabled: () => true,
    evidenceVerifier: createSyntheticServicePaymentEvidenceVerifier({
      records: [
        {
          amountMinor: 250_000,
          currency: "AUD",
          evidenceId,
          observationSha256: sha256,
          outcome: "verified",
        },
      ],
    }),
    financeAuthority: createSyntheticServicePaymentFinanceAuthority({
      grants: [
        {
          actions: [
            "submit_evidence",
            "verify_evidence",
            "record_dispute",
            "record_refund",
            "record_reversal",
            "record_void",
            "record_correction",
          ],
          actorUserId: lawyerUserId,
        },
      ],
    }),
    async rateLimit() {
      return true;
    },
    repository,
    reversalResolver: createSyntheticServicePaymentReversalResolver({
      records: [
        {
          conditionId,
          evidenceId,
          observationSha256: "c".repeat(64),
          resolutionKind: "refund",
        },
      ],
    }),
    async schemaAvailable() {
      return true;
    },
    ...overrides,
  };
  return { calls, handlers: createServicePaymentHandlers(deps) };
}

test("unauthenticated callers receive 401 and never reach the repository", async () => {
  const { calls, handlers } = buildHandlers({ authenticate: async () => null });
  const response = await handlers.getPaymentStatus(
    jsonRequest({}),
    projectId,
    engagementId
  );
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});

test("guest callers receive an existence-hiding 404", async () => {
  const { calls, handlers } = buildHandlers({
    authenticate: async () => ({ type: "guest", userId: ownerUserId }),
  });
  const response = await handlers.recordCondition(
    jsonRequest(validConditionBody),
    projectId,
    engagementId
  );
  assert.equal(response.status, 404);
  assert.deepEqual(calls, []);
});

test("the feature flag defaults to OFF and hides the whole surface", async () => {
  const { calls, handlers } = buildHandlers({
    enabled: () => false,
  });
  const response = await handlers.getPaymentStatus(
    new Request("https://example.test/api/payments"),
    projectId,
    engagementId
  );
  assert.equal(response.status, 404);
  assert.deepEqual(calls, []);
});

test("a missing schema fails closed with 503", async () => {
  const { calls, handlers } = buildHandlers({
    schemaAvailable: async () => false,
  });
  const response = await handlers.getPaymentStatus(
    new Request("https://example.test/api/payments"),
    projectId,
    engagementId
  );
  assert.equal(response.status, 503);
  assert.deepEqual(calls, []);
});

test("rate limiting returns 429 before any repository work", async () => {
  const { calls, handlers } = buildHandlers({ rateLimit: async () => false });
  const response = await handlers.getPaymentStatus(
    new Request("https://example.test/api/payments"),
    projectId,
    engagementId
  );
  assert.equal(response.status, 429);
  assert.deepEqual(calls, []);
});

test("malformed identifiers are existence-hidden", async () => {
  const { calls, handlers } = buildHandlers();
  const response = await handlers.getPaymentStatus(
    new Request("https://example.test/api/payments"),
    "not-a-uuid",
    engagementId
  );
  assert.equal(response.status, 404);
  assert.deepEqual(calls, []);
});

test("the owner status view is returned without provenance", async () => {
  const { handlers } = buildHandlers();
  const response = await handlers.getPaymentStatus(
    new Request("https://example.test/api/payments"),
    projectId,
    engagementId
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = (await response.json()) as {
    scope: string;
    provenance: unknown;
  };
  assert.equal(body.scope, "owner");
  assert.equal(body.provenance, null);
});

test("a contract condition requires the authority port to allow it", async () => {
  const denied = await buildHandlers({
    contractAuthority: {
      code: "deny",
      decide: () => ({
        allowed: false,
        reasonCode: "contract_authority_denied",
      }),
    },
  }).handlers.recordCondition(
    jsonRequest(validConditionBody),
    projectId,
    engagementId
  );
  assert.equal(denied.status, 403);

  const allowed = buildHandlers();
  const response = await allowed.handlers.recordCondition(
    jsonRequest(validConditionBody),
    projectId,
    engagementId
  );
  assert.equal(response.status, 201);
  assert.deepEqual(allowed.calls, ["loadContractTarget", "recordCondition"]);
});

test("a browser-supplied paid flag or extra field is rejected as a bad request", async () => {
  const { calls, handlers } = buildHandlers();
  const response = await handlers.recordCondition(
    jsonRequest({ ...validConditionBody, paid: true }),
    projectId,
    engagementId
  );
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test("a NOT_REQUIRED condition cannot smuggle an amount", async () => {
  const { handlers } = buildHandlers();
  const response = await handlers.recordCondition(
    jsonRequest({
      ...validConditionBody,
      amountMinor: 0,
      requirement: "not_required",
    }),
    projectId,
    engagementId
  );
  // The schema allows a nullable amount but the requirement shapes reject 0.
  assert.equal(response.status, 400);
});

test("non-JSON and oversized bodies are rejected", async () => {
  const { handlers } = buildHandlers();
  const textResponse = await handlers.recordCondition(
    new Request("https://example.test/api/payments", {
      body: "requirement=required",
      headers: { "content-type": "text/plain" },
      method: "POST",
    }),
    projectId,
    engagementId
  );
  assert.equal(textResponse.status, 400);
  const largeResponse = await handlers.recordCondition(
    new Request("https://example.test/api/payments", {
      body: JSON.stringify({ ...validConditionBody, pad: "x".repeat(70_000) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    projectId,
    engagementId
  );
  assert.equal(largeResponse.status, 413);
});

test("evidence submission requires finance authority", async () => {
  const body = {
    conditionId,
    declaredAmountMinor: 250_000,
    declaredCurrency: "AUD",
    evidenceCategory: "external_transfer_receipt",
    expectedProjectRevision: 6,
    observationSha256: sha256,
    operationId: "op-evidence-1",
    paidAt: "2026-10-29T00:00:00.000Z",
    referenceSha256: "d".repeat(64),
  };
  const denied = await buildHandlers({
    financeAuthority: denyAllServicePaymentFinanceAuthority,
  }).handlers.submitEvidence(jsonRequest(body), projectId, engagementId);
  assert.equal(denied.status, 403);

  const allowed = buildHandlers();
  const response = await allowed.handlers.submitEvidence(
    jsonRequest(body),
    projectId,
    engagementId
  );
  assert.equal(response.status, 201);
});

test("an invalid paidAt timestamp is rejected before any authority call", async () => {
  const { calls, handlers } = buildHandlers();
  const response = await handlers.submitEvidence(
    jsonRequest({
      conditionId,
      declaredAmountMinor: 250_000,
      declaredCurrency: "AUD",
      evidenceCategory: "external_transfer_receipt",
      expectedProjectRevision: 6,
      observationSha256: sha256,
      operationId: "op-evidence-2",
      paidAt: "29 October 2026",
      referenceSha256: "d".repeat(64),
    }),
    projectId,
    engagementId
  );
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test("verification returns 503 when the provider is unavailable", async () => {
  const { handlers } = buildHandlers({
    evidenceVerifier: denyAllServicePaymentEvidenceVerifier,
  });
  const response = await handlers.verifyEvidence(
    jsonRequest({ expectedProjectRevision: 7, operationId: "op-verify-1" }),
    projectId,
    engagementId,
    evidenceId
  );
  assert.equal(response.status, 503);
});

test("verification succeeds under an injected verifier and finance authority", async () => {
  const { calls, handlers } = buildHandlers();
  const response = await handlers.verifyEvidence(
    jsonRequest({ expectedProjectRevision: 7, operationId: "op-verify-2" }),
    projectId,
    engagementId,
    evidenceId
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["loadFinanceTarget", "recordEvidenceVerification"]);
});

test("a refund requires an authoritative observation and fails closed without one", async () => {
  const body = {
    conditionId,
    evidenceId,
    expectedProjectRevision: 8,
    operationId: "op-refund-1",
    reasonCode: "bank_return",
    referenceSha256: "e".repeat(64),
    resolutionKind: "refund",
  };
  const unavailable = await buildHandlers({
    reversalResolver: createSyntheticServicePaymentReversalResolver({
      records: [],
      unavailable: true,
    }),
  }).handlers.recordResolution(jsonRequest(body), projectId, engagementId);
  assert.equal(unavailable.status, 503);

  const none = await buildHandlers({
    reversalResolver: createSyntheticServicePaymentReversalResolver({
      records: [],
    }),
  }).handlers.recordResolution(jsonRequest(body), projectId, engagementId);
  assert.equal(none.status, 409);

  const ok = buildHandlers();
  const response = await ok.handlers.recordResolution(
    jsonRequest(body),
    projectId,
    engagementId
  );
  assert.equal(response.status, 201);
  assert.deepEqual(ok.calls, ["loadFinanceTarget", "recordResolution"]);
});

test("a staff dispute does not require an external observation source", async () => {
  const { calls, handlers } = buildHandlers({
    reversalResolver: createSyntheticServicePaymentReversalResolver({
      records: [],
      unavailable: true,
    }),
  });
  const response = await handlers.recordResolution(
    jsonRequest({
      conditionId,
      evidenceId,
      expectedProjectRevision: 8,
      operationId: "op-dispute-1",
      reasonCode: "customer_claims_not_received",
      referenceSha256: "f".repeat(64),
      resolutionKind: "dispute",
    }),
    projectId,
    engagementId
  );
  assert.equal(response.status, 201);
  assert.deepEqual(calls, ["loadFinanceTarget", "recordResolution"]);
});

test("repository domain errors map to their HTTP status", async () => {
  const cases: [string, number][] = [
    ["not_found", 404],
    ["forbidden", 403],
    ["authority_denied", 403],
    ["state_conflict", 409],
    ["revision_conflict", 409],
    ["idempotency_conflict", 409],
    ["integrity_conflict", 409],
    ["invalid_request", 400],
    ["verification_unavailable", 503],
  ];
  for (const [code, status] of cases) {
    const { handlers } = buildHandlers({
      repository: {
        ...buildHandlers().handlers,
        async loadPaymentStatus() {
          throw new ServicePaymentError(
            code as ConstructorParameters<typeof ServicePaymentError>[0]
          );
        },
      } as never,
    });
    const response = await handlers.getPaymentStatus(
      new Request("https://example.test/api/payments"),
      projectId,
      engagementId
    );
    assert.equal(response.status, status, code);
  }
});

/* ------------------------------------------------------------------------- *
 * R1 corrections at the HTTP boundary
 * ------------------------------------------------------------------------- */

const resolutionBase = {
  conditionId,
  expectedProjectRevision: 8,
  operationId: "op-resolution-1",
  reasonCode: "bank_return",
  referenceSha256: "e".repeat(64),
};

test("a correction must name the resolution it supersedes and no evidence", async () => {
  const { calls, handlers } = buildHandlers();
  const missingTarget = await handlers.recordResolution(
    jsonRequest({ ...resolutionBase, resolutionKind: "correction" }),
    projectId,
    engagementId
  );
  assert.equal(missingTarget.status, 400);

  const namesEvidence = await handlers.recordResolution(
    jsonRequest({
      ...resolutionBase,
      evidenceId,
      resolutionKind: "correction",
      supersedesResolutionId: "123e4567-e89b-42d3-a456-42661417400a",
    }),
    projectId,
    engagementId
  );
  assert.equal(namesEvidence.status, 400);
  assert.deepEqual(calls, []);
});

test("a void must not name evidence and a refund must", async () => {
  const { handlers } = buildHandlers();
  assert.equal(
    (
      await handlers.recordResolution(
        jsonRequest({
          ...resolutionBase,
          evidenceId,
          resolutionKind: "void",
        }),
        projectId,
        engagementId
      )
    ).status,
    400
  );
  assert.equal(
    (
      await handlers.recordResolution(
        jsonRequest({ ...resolutionBase, resolutionKind: "refund" }),
        projectId,
        engagementId
      )
    ).status,
    400
  );
});
