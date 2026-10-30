import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildServicePaymentContractAuthorityRequest,
  buildServicePaymentFinanceAuthorityRequest,
  DENY_ALL_CONTRACT_AUTHORITY_CODE,
  DENY_ALL_FINANCE_AUTHORITY_CODE,
  DENY_ALL_PAYMENT_STATUS_READ_AUTHORITY_CODE,
  denyAllServicePaymentContractAuthority,
  denyAllServicePaymentFinanceAuthority,
  denyAllServicePaymentStatusReadAuthority,
  hashServicePaymentContractAuthorityRequest,
  hashServicePaymentFinanceAuthorityRequest,
  SERVICE_PAYMENT_FINANCE_ACTION_BY_RESOLUTION,
  SERVICE_PAYMENT_FINANCE_ACTIONS,
  type ServicePaymentContractAuthorityRequest,
  type ServicePaymentFinanceAuthorityRequest,
} from "./authority";
import { SERVICE_PAYMENT_RESOLUTION_KINDS } from "./policy";
import {
  createSyntheticServicePaymentContractAuthority,
  createSyntheticServicePaymentEvidenceVerifier,
  createSyntheticServicePaymentFinanceAuthority,
  createSyntheticServicePaymentReversalResolver,
  createSyntheticServicePaymentStatusReadAuthority,
  SYNTHETIC_SERVICE_PAYMENT_PROVENANCE,
} from "./synthetic-authorities";
import {
  DENY_ALL_PAYMENT_EVIDENCE_VERIFIER_CODE,
  denyAllServicePaymentEvidenceVerifier,
  hashServicePaymentEvidenceObservation,
  hashServicePaymentReversalObservation,
  type ServicePaymentEvidenceVerificationInput,
  UNSUPPORTED_REVERSAL_RESOLVER_CODE,
  unsupportedServicePaymentReversalResolver,
} from "./verification";

const TERMS = "a".repeat(64);
const VERSION = "11111111-1111-4111-8111-111111111111";
const CONDITION = "22222222-2222-4222-8222-222222222222";
const EVIDENCE = "33333333-3333-4333-8333-333333333333";
const PROJECT = "66666666-6666-4666-8666-666666666666";
const ENGAGEMENT = "55555555-5555-4555-8555-555555555555";
const ASSIGNMENT = "77777777-7777-4777-8777-777777777777";
const ACTOR = "88888888-8888-4888-8888-888888888888";
const OPERATION_HASH = "b".repeat(64);
const OBSERVATION = "c".repeat(64);

function contractRequest(
  overrides: Partial<ServicePaymentContractAuthorityRequest> = {}
): ServicePaymentContractAuthorityRequest {
  return {
    actorUserId: ACTOR,
    agreementTermsSha256: TERMS,
    agreementVersionId: VERSION,
    amountMinor: 250_000,
    contractObservationSha256: OBSERVATION,
    contractualBasisCode: "agreement_clause",
    contractualBasisRef: "clause:4.2",
    currency: "AUD",
    engagementId: ENGAGEMENT,
    operatorAssignmentId: ASSIGNMENT,
    operatorAssignmentStatus: "active",
    operatorEligible: true,
    projectId: PROJECT,
    requestSha256: OPERATION_HASH,
    requirement: "required",
    ...overrides,
  };
}

function financeRequest(
  overrides: Partial<ServicePaymentFinanceAuthorityRequest> = {}
): ServicePaymentFinanceAuthorityRequest {
  return {
    action: "verify_evidence",
    actorUserId: ACTOR,
    agreementTermsSha256: TERMS,
    agreementVersionId: VERSION,
    amountMinor: 250_000,
    conditionId: CONDITION,
    currency: "AUD",
    engagementId: ENGAGEMENT,
    evidenceId: EVIDENCE,
    observationSha256: OBSERVATION,
    operatorAssignmentId: ASSIGNMENT,
    operatorAssignmentStatus: "active",
    operatorEligible: true,
    projectId: PROJECT,
    requestSha256: OPERATION_HASH,
    ...overrides,
  };
}

test("production contract authority denies every request", () => {
  assert.equal(
    denyAllServicePaymentContractAuthority.code,
    DENY_ALL_CONTRACT_AUTHORITY_CODE
  );
  const decision = denyAllServicePaymentContractAuthority.decide(
    contractRequest()
  );
  assert.equal(decision.allowed, false);
  assert.equal(
    decision.allowed === false && decision.reasonCode,
    "contract_authority_unavailable"
  );
});

test("production finance authority denies every action", () => {
  assert.equal(
    denyAllServicePaymentFinanceAuthority.code,
    DENY_ALL_FINANCE_AUTHORITY_CODE
  );
  for (const action of SERVICE_PAYMENT_FINANCE_ACTIONS) {
    const decision = denyAllServicePaymentFinanceAuthority.decide(
      financeRequest({ action })
    );
    assert.equal(decision.allowed, false);
    assert.equal(
      decision.allowed === false && decision.reasonCode,
      "finance_authority_unavailable"
    );
  }
});

test("production evidence verifier and reversal resolver fail closed", () => {
  assert.equal(
    denyAllServicePaymentEvidenceVerifier.code,
    DENY_ALL_PAYMENT_EVIDENCE_VERIFIER_CODE
  );
  assert.deepEqual(denyAllServicePaymentEvidenceVerifier.verify({} as never), {
    status: "unavailable",
    reasonCode: "verification_provider_unavailable",
  });
  assert.equal(
    unsupportedServicePaymentReversalResolver.code,
    UNSUPPORTED_REVERSAL_RESOLVER_CODE
  );
  assert.deepEqual(
    unsupportedServicePaymentReversalResolver.observe({} as never),
    {
      status: "unavailable",
      reasonCode: "reversal_provider_unavailable",
    }
  );
});

test("every resolution kind maps to its own finance action", () => {
  const actions = SERVICE_PAYMENT_RESOLUTION_KINDS.map(
    (kind) => SERVICE_PAYMENT_FINANCE_ACTION_BY_RESOLUTION[kind]
  );
  assert.deepEqual(actions, [
    "record_dispute",
    "record_refund",
    "record_reversal",
    "record_void",
    "record_correction",
  ]);
  assert.equal(new Set(actions).size, actions.length);
});

test("authority request hashing binds actor, target, amount and action", () => {
  const base = contractRequest();
  const hash = hashServicePaymentContractAuthorityRequest(base);
  assert.match(hash, /^[0-9a-f]{64}$/u);
  assert.equal(hash, hashServicePaymentContractAuthorityRequest({ ...base }));
  for (const override of [
    { actorUserId: "99999999-9999-4999-8999-999999999999" },
    { agreementVersionId: "99999999-9999-4999-8999-999999999999" },
    { amountMinor: 1 },
    { currency: "NZD" },
    { requirement: "not_required" as const, amountMinor: null, currency: null },
    { contractObservationSha256: "d".repeat(64) },
    { operatorEligible: false },
    { operatorAssignmentId: null },
  ]) {
    assert.notEqual(
      hash,
      hashServicePaymentContractAuthorityRequest({ ...base, ...override })
    );
  }
  const financeHash = hashServicePaymentFinanceAuthorityRequest(
    financeRequest()
  );
  assert.notEqual(
    financeHash,
    hashServicePaymentFinanceAuthorityRequest(
      financeRequest({ action: "record_refund" })
    )
  );
  assert.notEqual(
    financeHash,
    hashServicePaymentFinanceAuthorityRequest(
      financeRequest({ observationSha256: null })
    )
  );
});

test("authority builders exclude free-form text", () => {
  assert.deepEqual(
    Object.keys(
      buildServicePaymentContractAuthorityRequest(contractRequest())
    ).sort(),
    [
      "action",
      "actorUserId",
      "agreementTermsSha256",
      "agreementVersionId",
      "amountMinor",
      "contractObservationSha256",
      "contractualBasisCode",
      "contractualBasisRef",
      "currency",
      "domain",
      "engagementId",
      "operatorAssignmentId",
      "operatorAssignmentStatus",
      "operatorEligible",
      "projectId",
      "requirement",
    ]
  );
  assert.deepEqual(
    Object.keys(
      buildServicePaymentFinanceAuthorityRequest(financeRequest())
    ).sort(),
    [
      "action",
      "actorUserId",
      "agreementTermsSha256",
      "agreementVersionId",
      "amountMinor",
      "conditionId",
      "currency",
      "domain",
      "engagementId",
      "evidenceId",
      "observationSha256",
      "operatorAssignmentId",
      "operatorAssignmentStatus",
      "operatorEligible",
      "projectId",
    ]
  );
});

test("a synthetic contract authority requires a current assignment and exact target", () => {
  const authority = createSyntheticServicePaymentContractAuthority({
    grants: [
      {
        actorUserId: ACTOR,
        agreementTermsSha256: TERMS,
        agreementVersionId: VERSION,
        amountMinor: 250_000,
        currency: "AUD",
        requirement: "required",
      },
    ],
  });
  const allowed = authority.decide(contractRequest());
  assert.equal(allowed.allowed, true);
  assert.equal(
    allowed.allowed === true && allowed.authorityCode,
    "synthetic_test_contract_payment_authority"
  );
  for (const override of [
    { operatorEligible: false },
    { operatorAssignmentStatus: "revoked" },
    { operatorAssignmentId: null },
    { agreementVersionId: "99999999-9999-4999-8999-999999999999" },
    { amountMinor: 1 },
    { actorUserId: "99999999-9999-4999-8999-999999999999" },
  ]) {
    assert.equal(
      authority.decide(contractRequest(override)).allowed,
      false,
      JSON.stringify(override)
    );
  }
});

test("a synthetic finance authority is action- and target-scoped and revocable", () => {
  const authority = createSyntheticServicePaymentFinanceAuthority({
    grants: [{ actorUserId: ACTOR, actions: ["verify_evidence"] }],
  });
  assert.equal(authority.decide(financeRequest()).allowed, true);
  assert.equal(
    authority.decide(financeRequest({ action: "record_refund" })).allowed,
    false
  );
  // A grant without a pinned condition still needs an eligible assignment.
  assert.equal(
    authority.decide(financeRequest({ operatorEligible: false })).allowed,
    false
  );
  authority.revoke(ACTOR);
  assert.equal(authority.decide(financeRequest()).allowed, false);
});

test("the synthetic verifier rejects mismatched or forged observations", async () => {
  const verifier = createSyntheticServicePaymentEvidenceVerifier({
    records: [
      {
        amountMinor: 250_000,
        currency: "AUD",
        evidenceId: EVIDENCE,
        observationSha256: OBSERVATION,
        outcome: "verified",
      },
    ],
  });
  const request: ServicePaymentEvidenceVerificationInput = {
    agreementTermsSha256: TERMS,
    agreementVersionId: VERSION,
    conditionId: CONDITION,
    declaredAmountMinor: 250_000,
    declaredCurrency: "AUD",
    engagementId: ENGAGEMENT,
    evidenceCategory: "external_transfer_receipt",
    evidenceId: EVIDENCE,
    observationSha256: OBSERVATION,
    paidAt: "2026-10-29T00:00:00.000Z",
    projectId: PROJECT,
    referenceSha256: "e".repeat(64),
    requestingActorUserId: ACTOR,
  };
  const verified = await verifier.verify(request);
  assert.equal(verified.status, "verified");
  assert.equal(
    verified.status === "verified" && verified.provenance,
    SYNTHETIC_SERVICE_PAYMENT_PROVENANCE
  );
  assert.equal(
    (await verifier.verify({ ...request, observationSha256: "f".repeat(64) }))
      .status,
    "rejected"
  );
  assert.equal(
    (await verifier.verify({ ...request, declaredAmountMinor: 1 })).status,
    "rejected"
  );
  const forged = createSyntheticServicePaymentEvidenceVerifier({
    records: [
      {
        amountMinor: 250_000,
        currency: "AUD",
        evidenceId: EVIDENCE,
        observationSha256: OBSERVATION,
        outcome: "forged",
      },
    ],
  });
  const forgedOutcome = await forged.verify(request);
  assert.equal(forgedOutcome.status, "verified");
  assert.notEqual(
    forgedOutcome.status === "verified" && forgedOutcome.observationSha256,
    OBSERVATION
  );
});

test("the synthetic reversal resolver is target-bound and can be unavailable", async () => {
  const resolver = createSyntheticServicePaymentReversalResolver({
    records: [
      {
        conditionId: CONDITION,
        evidenceId: EVIDENCE,
        observationSha256: "d".repeat(64),
        resolutionKind: "refund",
      },
    ],
  });
  const observed = await resolver.observe({
    conditionId: CONDITION,
    engagementId: ENGAGEMENT,
    evidenceId: EVIDENCE,
    projectId: PROJECT,
    referenceSha256: "e".repeat(64),
    requestingActorUserId: ACTOR,
    resolutionKind: "refund",
  });
  assert.equal(observed.status, "observed");
  assert.equal(
    (
      await resolver.observe({
        conditionId: CONDITION,
        engagementId: ENGAGEMENT,
        evidenceId: EVIDENCE,
        projectId: PROJECT,
        referenceSha256: "e".repeat(64),
        requestingActorUserId: ACTOR,
        resolutionKind: "reversal",
      })
    ).status,
    "none"
  );
  const unavailable = createSyntheticServicePaymentReversalResolver({
    records: [],
    unavailable: true,
  });
  assert.equal(
    (
      await unavailable.observe({
        conditionId: CONDITION,
        engagementId: ENGAGEMENT,
        evidenceId: EVIDENCE,
        projectId: PROJECT,
        referenceSha256: "e".repeat(64),
        requestingActorUserId: ACTOR,
        resolutionKind: "refund",
      })
    ).status,
    "unavailable"
  );
});

test("observation hashes bind evidence identity and reversal target", () => {
  const evidenceObservation = hashServicePaymentEvidenceObservation({
    agreementTermsSha256: TERMS,
    agreementVersionId: VERSION,
    conditionId: CONDITION,
    declaredAmountMinor: 250_000,
    declaredCurrency: "AUD",
    engagementId: ENGAGEMENT,
    evidenceCategory: "external_transfer_receipt",
    evidenceId: EVIDENCE,
    observationSha256: OBSERVATION,
    paidAt: "2026-10-29T00:00:00.000Z",
    projectId: PROJECT,
    referenceSha256: "e".repeat(64),
    requestingActorUserId: ACTOR,
  });
  assert.match(evidenceObservation, /^[0-9a-f]{64}$/u);
  const reversal = hashServicePaymentReversalObservation({
    conditionId: CONDITION,
    engagementId: ENGAGEMENT,
    evidenceId: EVIDENCE,
    projectId: PROJECT,
    referenceSha256: "e".repeat(64),
    requestingActorUserId: ACTOR,
    resolutionKind: "refund",
  });
  assert.notEqual(
    reversal,
    hashServicePaymentReversalObservation({
      conditionId: CONDITION,
      engagementId: ENGAGEMENT,
      evidenceId: EVIDENCE,
      projectId: PROJECT,
      referenceSha256: "e".repeat(64),
      requestingActorUserId: ACTOR,
      resolutionKind: "reversal",
    })
  );
});

/* ------------------------------------------------------------------------- *
 * FIX-02 — staff payment-status read authority
 * ------------------------------------------------------------------------- */

test("the production read authority denies every staff disclosure", () => {
  assert.equal(
    denyAllServicePaymentStatusReadAuthority.code,
    DENY_ALL_PAYMENT_STATUS_READ_AUTHORITY_CODE
  );
  const decision = denyAllServicePaymentStatusReadAuthority.decide({
    actorUserId: ACTOR,
    conditionId: null,
    engagementId: ENGAGEMENT,
    projectId: PROJECT,
    requestSha256: OPERATION_HASH,
    scope: "operator",
  });
  assert.equal(decision.allowed, false);
  assert.equal(
    decision.allowed === false && decision.reasonCode,
    "finance_authority_unavailable"
  );
});

test("a synthetic read authority is explicitly scoped to one engagement", () => {
  const authority = createSyntheticServicePaymentStatusReadAuthority({
    grants: [{ actorUserId: ACTOR, engagementId: ENGAGEMENT }],
  });
  const base = {
    actorUserId: ACTOR,
    conditionId: null,
    engagementId: ENGAGEMENT,
    projectId: PROJECT,
    requestSha256: OPERATION_HASH,
    scope: "operator" as const,
  };
  assert.equal(authority.decide(base).allowed, true);
  assert.equal(
    authority.decide({
      ...base,
      engagementId: "99999999-9999-4999-8999-999999999999",
    }).allowed,
    false
  );
  assert.equal(
    authority.decide({
      ...base,
      actorUserId: "99999999-9999-4999-8999-999999999999",
    }).allowed,
    false
  );
});
