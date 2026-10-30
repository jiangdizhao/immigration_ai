import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildServicePaymentStaffResolutionObservation,
  buildServicePaymentStatusReadRequest,
  evaluateServicePaymentFacts,
  evaluateServicePaymentState,
  hashServicePaymentOperationRequest,
  hashServicePaymentStaffResolutionObservation,
  hashServicePaymentStatusReadRequest,
  isServicePaymentAmountMinor,
  isServicePaymentCurrency,
  isServicePaymentEnabled,
  parseServicePaymentIsoTimestamp,
  SERVICE_PAYMENT_CUSTOMER_NOTICE,
  SERVICE_PAYMENT_CUSTOMER_NOTICE_SHA256,
  SERVICE_PAYMENT_EFFECTIVE_PRECEDENCE,
  SERVICE_PAYMENT_EFFECTIVE_STATUSES,
  SERVICE_PAYMENT_POLICY_VERSION,
  SERVICE_PAYMENT_REQUIREMENTS,
  type ServicePaymentConditionSnapshot,
  type ServicePaymentEvaluationFacts,
  type ServicePaymentEvaluationInput,
  type ServicePaymentEvidenceSnapshot,
  type ServicePaymentResolutionSnapshot,
  servicePaymentConditionRequestIdentity,
  servicePaymentEvidenceRequestIdentity,
  servicePaymentPersistedObservationCode,
  servicePaymentRequirementShapes,
  servicePaymentResolutionRequestIdentity,
  servicePaymentResolutionShapeValid,
  servicePaymentVerificationProvenanceSha256,
  servicePaymentVerificationRequestIdentity,
} from "./policy";

const TERMS = "a".repeat(64);
const VERSION = "11111111-1111-4111-8111-111111111111";
const CONDITION = "22222222-2222-4222-8222-222222222222";
const EVIDENCE = "33333333-3333-4333-8333-333333333333";
const RESOLUTION = "44444444-4444-4444-8444-444444444444";

function condition(
  overrides: Partial<ServicePaymentConditionSnapshot> = {}
): ServicePaymentConditionSnapshot {
  return {
    agreementTermsSha256: TERMS,
    agreementVersionId: VERSION,
    amountMinor: 250_000,
    conditionId: CONDITION,
    currency: "AUD",
    requirement: "required",
    supersededAt: null,
    ...overrides,
  };
}

function evidence(
  overrides: Partial<ServicePaymentEvidenceSnapshot> = {}
): ServicePaymentEvidenceSnapshot {
  return {
    amountMinor: 250_000,
    currency: "AUD",
    evidenceId: EVIDENCE,
    status: "verified",
    submittedAt: "2026-10-29T00:00:00.000Z",
    verifiedAt: "2026-10-29T01:00:00.000Z",
    ...overrides,
  };
}

function resolution(
  overrides: Partial<ServicePaymentResolutionSnapshot> = {}
): ServicePaymentResolutionSnapshot {
  return {
    evidenceId: EVIDENCE,
    kind: "reversal",
    resolutionId: RESOLUTION,
    resolvedAt: "2026-10-29T02:00:00.000Z",
    supersedesResolutionId: null,
    ...overrides,
  };
}

function evaluate(input: Partial<ServicePaymentEvaluationInput> = {}) {
  return evaluateServicePaymentState({
    condition: condition(),
    currentAgreementTermsSha256: TERMS,
    currentAgreementVersionId: VERSION,
    engagementStatus: "active",
    evidences: [],
    resolutions: [],
    ...input,
  });
}

test("the feature flag defaults to OFF", () => {
  assert.equal(isServicePaymentEnabled(undefined), false);
  assert.equal(isServicePaymentEnabled(""), false);
  assert.equal(isServicePaymentEnabled("1"), false);
  assert.equal(isServicePaymentEnabled("true"), true);
  assert.equal(isServicePaymentEnabled(" TRUE "), true);
});

test("money and currency validation is strict", () => {
  assert.equal(isServicePaymentAmountMinor(1), true);
  assert.equal(isServicePaymentAmountMinor(0), false);
  assert.equal(isServicePaymentAmountMinor(-5), false);
  assert.equal(isServicePaymentAmountMinor(1.5), false);
  assert.equal(isServicePaymentAmountMinor(1_000_000_000_000), false);
  assert.equal(isServicePaymentAmountMinor("100"), false);
  assert.equal(isServicePaymentCurrency("AUD"), true);
  assert.equal(isServicePaymentCurrency("aud"), false);
  assert.equal(isServicePaymentCurrency("AU"), false);
  assert.equal(isServicePaymentCurrency(643), false);
});

test("requirement shapes never invent an amount", () => {
  assert.equal(
    servicePaymentRequirementShapes({
      amountMinor: 250_000,
      contractualBasisRef: "clause:4.2",
      currency: "AUD",
      requirement: "required",
    }),
    true
  );
  // Zero-dollar fiction is not a valid NOT_REQUIRED representation.
  assert.equal(
    servicePaymentRequirementShapes({
      amountMinor: 0,
      contractualBasisRef: "clause:4.2",
      currency: "AUD",
      requirement: "not_required",
    }),
    false
  );
  assert.equal(
    servicePaymentRequirementShapes({
      amountMinor: null,
      contractualBasisRef: "schedule:no-advance-fee",
      currency: null,
      requirement: "not_required",
    }),
    true
  );
  assert.equal(
    servicePaymentRequirementShapes({
      amountMinor: null,
      contractualBasisRef: null,
      currency: null,
      requirement: "unknown",
    }),
    true
  );
  assert.equal(
    servicePaymentRequirementShapes({
      amountMinor: 100,
      contractualBasisRef: null,
      currency: null,
      requirement: "unknown",
    }),
    false
  );
  assert.equal(
    servicePaymentRequirementShapes({
      amountMinor: null,
      contractualBasisRef: "clause:1",
      currency: null,
      requirement: "unknown",
    }),
    true
  );
});

test("the effective precedence order is documented and stable", () => {
  assert.deepEqual(
    [...SERVICE_PAYMENT_EFFECTIVE_PRECEDENCE],
    [
      "UNKNOWN",
      "VOID",
      "DISPUTED",
      "REVERSED",
      "SATISFIED",
      "EVIDENCE_PENDING",
      "REQUIRED_UNSATISFIED",
      "NOT_REQUIRED",
    ]
  );
  assert.equal(SERVICE_PAYMENT_EFFECTIVE_PRECEDENCE.length, 8);
  assert.equal(SERVICE_PAYMENT_EFFECTIVE_STATUSES.length, 8);
  assert.equal(SERVICE_PAYMENT_REQUIREMENTS.length, 3);
});

test("the customer notice is stable and explicit about what it is not", () => {
  assert.match(SERVICE_PAYMENT_CUSTOMER_NOTICE, /not a bank confirmation/u);
  assert.match(SERVICE_PAYMENT_CUSTOMER_NOTICE, /VIP subscription/u);
  assert.match(SERVICE_PAYMENT_CUSTOMER_NOTICE_SHA256, /^[0-9a-f]{64}$/u);
});

test("operation request hashing is canonical and scope-bound", () => {
  const base = {
    action: "record_condition" as const,
    agreementTermsSha256: TERMS,
    agreementVersionId: VERSION,
    amountMinor: 250_000,
    conditionId: null,
    contractAuthorityCode: null,
    contractualBasisCode: "agreement_clause",
    contractualBasisRef: "clause:4.2",
    currency: "AUD",
    engagementId: "55555555-5555-4555-8555-555555555555",
    evidenceCategory: null,
    evidenceId: null,
    expectedProjectRevision: 7,
    financeAuthorityCode: null,
    observationCode: null,
    observationSha256: "b".repeat(64),
    paidAt: null,
    projectId: "66666666-6666-4666-8666-666666666666",
    reasonCode: null,
    referenceSha256: null,
    requirement: "required" as const,
    resolutionKind: null,
    supersedesResolutionId: null,
    verificationMethod: null,
    verificationProvenanceSha256: null,
    verificationProviderCode: null,
    verificationReasonCode: null,
    verificationStatus: null,
  };
  const first = hashServicePaymentOperationRequest(base);
  assert.match(first, /^[0-9a-f]{64}$/u);
  assert.equal(first, hashServicePaymentOperationRequest({ ...base }));
  assert.notEqual(
    first,
    hashServicePaymentOperationRequest({ ...base, amountMinor: 250_001 })
  );
  assert.notEqual(
    first,
    hashServicePaymentOperationRequest({ ...base, expectedProjectRevision: 8 })
  );
});

test("staff resolution observations bind the exact target", () => {
  const base = {
    conditionId: CONDITION,
    evidenceId: EVIDENCE,
    reasonCode: "bank_return",
    referenceSha256: "c".repeat(64),
    resolutionKind: "dispute" as const,
  };
  assert.deepEqual(buildServicePaymentStaffResolutionObservation(base), {
    domain: "phase13_m4_005_staff_resolution_observation",
    ...base,
  });
  assert.notEqual(
    hashServicePaymentStaffResolutionObservation(base),
    hashServicePaymentStaffResolutionObservation({
      ...base,
      resolutionKind: "void",
    })
  );
});

test("ISO timestamps must round-trip exactly", () => {
  assert.ok(parseServicePaymentIsoTimestamp("2026-10-29T00:00:00.000Z"));
  assert.equal(parseServicePaymentIsoTimestamp("29/10/2026"), null);
  assert.equal(parseServicePaymentIsoTimestamp("2026-10-29T00:00:00Z"), null);
});

test("evaluation reports UNKNOWN rather than inventing a condition", () => {
  assert.equal(evaluate({ condition: null }).status, "UNKNOWN");
  assert.equal(evaluate({ condition: null }).reasonCode, "condition_absent");
  assert.equal(
    evaluate({
      condition: condition({ supersededAt: "2026-10-29T00:00:00.000Z" }),
    }).reasonCode,
    "condition_superseded"
  );
  assert.equal(
    evaluate({
      currentAgreementVersionId: "77777777-7777-4777-8777-777777777777",
    }).reasonCode,
    "contract_not_current"
  );
  assert.equal(
    evaluate({ currentAgreementTermsSha256: "d".repeat(64) }).reasonCode,
    "contract_not_current"
  );
  assert.equal(
    evaluate({
      condition: condition({
        requirement: "unknown",
        amountMinor: null,
        currency: null,
      }),
    }).reasonCode,
    "contract_requirement_unknown"
  );
  assert.equal(
    evaluate({ engagementStatus: "terminated" }).reasonCode,
    "engagement_terminated"
  );
});

test("NOT_REQUIRED comes only from an explicit contract decision", () => {
  const result = evaluate({
    condition: condition({
      amountMinor: null,
      currency: null,
      requirement: "not_required",
    }),
  });
  assert.equal(result.status, "NOT_REQUIRED");
  assert.equal(result.reasonCode, "contractually_not_required");
  assert.equal(result.effectiveEvidenceId, null);
});

test("a pending receipt is pending, never satisfied", () => {
  const result = evaluate({
    evidences: [evidence({ status: "pending", verifiedAt: null })],
  });
  assert.equal(result.status, "EVIDENCE_PENDING");
});

test("a rejected receipt cannot satisfy a condition", () => {
  const result = evaluate({ evidences: [evidence({ status: "rejected" })] });
  assert.equal(result.status, "REQUIRED_UNSATISFIED");
  assert.equal(result.reasonCode, "no_evidence");
});

test("a verified receipt with the wrong amount cannot satisfy", () => {
  const result = evaluate({ evidences: [evidence({ amountMinor: 1000 })] });
  assert.equal(result.status, "REQUIRED_UNSATISFIED");
});

test("verified matching evidence satisfies and names the evidence", () => {
  const result = evaluate({ evidences: [evidence()] });
  assert.equal(result.status, "SATISFIED");
  assert.equal(result.effectiveEvidenceId, EVIDENCE);
  assert.equal(result.reasonCode, "evidence_verified");
});

test("reversal and refund invalidate earlier satisfaction", () => {
  assert.equal(
    evaluate({ evidences: [evidence()], resolutions: [resolution()] }).status,
    "REVERSED"
  );
  assert.equal(
    evaluate({
      evidences: [evidence()],
      resolutions: [resolution({ kind: "refund" })],
    }).reasonCode,
    "payment_refunded"
  );
});

test("a dispute outranks a still-verified receipt", () => {
  const result = evaluate({
    evidences: [evidence()],
    resolutions: [resolution({ kind: "dispute" })],
  });
  assert.equal(result.status, "DISPUTED");
});

test("void outranks everything, so a condition is never payable and void", () => {
  for (const evidences of [
    [],
    [evidence()],
    [evidence({ status: "pending" })],
  ]) {
    const result = evaluate({
      evidences,
      resolutions: [resolution({ evidenceId: null, kind: "void" })],
    });
    assert.equal(result.status, "VOID");
    assert.equal(result.reasonCode, "condition_voided");
  }
});

test("a correction restores satisfaction without rewriting history", () => {
  const dispute = resolution({ kind: "dispute" });
  const correction = resolution({
    evidenceId: null,
    kind: "correction",
    resolutionId: "88888888-8888-4888-8888-888888888888",
    resolvedAt: "2026-10-29T03:00:00.000Z",
    supersedesResolutionId: RESOLUTION,
  });
  assert.equal(
    evaluate({ evidences: [evidence()], resolutions: [dispute] }).status,
    "DISPUTED"
  );
  assert.equal(
    evaluate({ evidences: [evidence()], resolutions: [dispute, correction] })
      .status,
    "SATISFIED"
  );
});

test("evaluation is deterministic for identical inputs", () => {
  const input: ServicePaymentEvaluationInput = {
    condition: condition(),
    currentAgreementTermsSha256: TERMS,
    currentAgreementVersionId: VERSION,
    engagementStatus: "active",
    evidences: [
      evidence(),
      evidence({
        evidenceId: "99999999-9999-4999-8999-999999999999",
        status: "pending",
        verifiedAt: null,
      }),
    ],
    resolutions: [],
  };
  const first = evaluateServicePaymentState(input);
  const second = evaluateServicePaymentState(input);
  assert.deepEqual(first, second);
  assert.equal(first.policyVersion, SERVICE_PAYMENT_POLICY_VERSION);
});

/* ------------------------------------------------------------------------- *
 * FIX-02 — staff payment-status disclosure binding
 * ------------------------------------------------------------------------- */

test("the read-authorization binding covers actor, project, engagement and scope", () => {
  const base = {
    actorUserId: "88888888-8888-4888-8888-888888888888",
    engagementId: "55555555-5555-4555-8555-555555555555",
    projectId: "66666666-6666-4666-8666-666666666666",
    scope: "operator" as const,
  };
  const hash = hashServicePaymentStatusReadRequest(base);
  assert.match(hash, /^[0-9a-f]{64}$/u);
  assert.equal(hash, hashServicePaymentStatusReadRequest({ ...base }));
  for (const override of [
    { actorUserId: "99999999-9999-4999-8999-999999999999" },
    { engagementId: "99999999-9999-4999-8999-999999999999" },
    { projectId: "99999999-9999-4999-8999-999999999999" },
    { scope: "owner" as const },
  ]) {
    assert.notEqual(
      hash,
      hashServicePaymentStatusReadRequest({ ...base, ...override })
    );
  }
  assert.deepEqual(buildServicePaymentStatusReadRequest(base), {
    domain: "phase13_m4_005_payment_status_read",
    ...base,
  });
});

/* ------------------------------------------------------------------------- *
 * FIX-03 — history-independent effective evaluation
 * ------------------------------------------------------------------------- */

function facts(
  overrides: Partial<ServicePaymentEvaluationFacts> = {}
): ServicePaymentEvaluationFacts {
  return {
    activeResolutionKinds: [],
    condition: condition(),
    currentAgreementTermsSha256: TERMS,
    currentAgreementVersionId: VERSION,
    engagementStatus: "active",
    hasPendingEvidence: false,
    satisfiedEvidenceId: null,
    ...overrides,
  };
}

test("an old VOID survives more than 50 later records", () => {
  // 60 resolutions later the void is still the active decision: the facts come from
  // complete lineage, never from a 50-row page.
  const longHistory = [
    resolution({
      evidenceId: null,
      kind: "void",
      resolutionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }),
    ...Array.from({ length: 60 }, (_, index) =>
      resolution({
        evidenceId: EVIDENCE,
        kind: "dispute" as const,
        resolutionId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, "0")}`,
        resolvedAt: `2026-10-29T03:${String(index % 60).padStart(2, "0")}:00.000Z`,
      })
    ),
  ];
  const result = evaluateServicePaymentState({
    condition: condition(),
    currentAgreementTermsSha256: TERMS,
    currentAgreementVersionId: VERSION,
    engagementStatus: "active",
    evidences: [evidence()],
    resolutions: longHistory,
  });
  assert.equal(result.status, "VOID");
  assert.equal(longHistory.length, 61);
});

test("correction lineage stays complete beyond 50 records", () => {
  const dispute = resolution({
    kind: "dispute",
    resolutionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  });
  const noise = Array.from({ length: 60 }, (_, index) =>
    resolution({
      evidenceId: EVIDENCE,
      kind: "dispute" as const,
      resolutionId: `dddddddd-dddd-4ddd-8ddd-${String(index).padStart(12, "0")}`,
      resolvedAt: `2026-10-29T04:${String(index % 60).padStart(2, "0")}:00.000Z`,
    })
  );
  const correction = resolution({
    evidenceId: null,
    kind: "correction",
    resolutionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    resolvedAt: "2026-10-29T05:00:00.000Z",
    supersedesResolutionId: dispute.resolutionId,
  });
  const result = evaluateServicePaymentState({
    condition: condition(),
    currentAgreementTermsSha256: TERMS,
    currentAgreementVersionId: VERSION,
    engagementStatus: "active",
    evidences: [evidence()],
    resolutions: [dispute, ...noise, correction],
  });
  // The corrected dispute no longer blocks satisfaction; the surviving disputes do.
  assert.equal(result.status, "DISPUTED");
  const withoutNoise = evaluateServicePaymentState({
    condition: condition(),
    currentAgreementTermsSha256: TERMS,
    currentAgreementVersionId: VERSION,
    engagementStatus: "active",
    evidences: [evidence()],
    resolutions: [dispute, correction],
  });
  assert.equal(withoutNoise.status, "SATISFIED");
});

test("facts-based evaluation never fabricates satisfaction", () => {
  assert.equal(
    evaluateServicePaymentFacts(facts()).status,
    "REQUIRED_UNSATISFIED"
  );
  assert.equal(
    evaluateServicePaymentFacts(facts({ hasPendingEvidence: true })).status,
    "EVIDENCE_PENDING"
  );
  assert.equal(
    evaluateServicePaymentFacts(facts({ satisfiedEvidenceId: EVIDENCE }))
      .status,
    "SATISFIED"
  );
  assert.equal(
    evaluateServicePaymentFacts(facts({ condition: null })).status,
    "UNKNOWN"
  );
  assert.equal(
    evaluateServicePaymentFacts(facts({ activeResolutionKinds: ["void"] }))
      .status,
    "VOID"
  );
  // A void outranks a would-be satisfaction, so the two can never coexist.
  assert.equal(
    evaluateServicePaymentFacts(
      facts({ activeResolutionKinds: ["void"], satisfiedEvidenceId: EVIDENCE })
    ).status,
    "VOID"
  );
  assert.equal(
    evaluateServicePaymentFacts(
      facts({
        activeResolutionKinds: ["refund"],
        satisfiedEvidenceId: EVIDENCE,
      })
    ).reasonCode,
    "payment_refunded"
  );
});

/* ------------------------------------------------------------------------- *
 * FIX-05 — canonical idempotency identity
 * ------------------------------------------------------------------------- */

const conditionIdentity = {
  agreementTermsSha256: TERMS,
  agreementVersionId: VERSION,
  amountMinor: 250_000,
  contractualBasisCode: "agreement_clause" as const,
  contractualBasisRef: "clause:4.2",
  contractAuthorityCode: "synthetic_test_contract_payment_authority",
  contractObservationSha256: "f".repeat(64),
  currency: "AUD",
  engagementId: "55555555-5555-4555-8555-555555555555",
  expectedProjectRevision: 9,
  projectId: "66666666-6666-4666-8666-666666666666",
  requirement: "required" as const,
};

test("the condition identity binds every material contract field", () => {
  const hash = hashServicePaymentOperationRequest(
    servicePaymentConditionRequestIdentity(conditionIdentity)
  );
  assert.equal(
    hash,
    hashServicePaymentOperationRequest(
      servicePaymentConditionRequestIdentity({ ...conditionIdentity })
    )
  );
  for (const override of [
    { amountMinor: 250_001 },
    { currency: "NZD" },
    { requirement: "not_required" as const, amountMinor: null, currency: null },
    { contractualBasisRef: "clause:4.3" },
    { agreementTermsSha256: "0".repeat(64) },
    { contractObservationSha256: "1".repeat(64) },
    { contractAuthorityCode: "other_contract_authority" },
    { expectedProjectRevision: 10 },
  ]) {
    assert.notEqual(
      hash,
      hashServicePaymentOperationRequest(
        servicePaymentConditionRequestIdentity({
          ...conditionIdentity,
          ...override,
        })
      ),
      JSON.stringify(override)
    );
  }
});

test("the evidence identity binds category, paid time and reference digest", () => {
  const base = {
    agreementTermsSha256: TERMS,
    agreementVersionId: VERSION,
    conditionId: CONDITION,
    declaredAmountMinor: 250_000,
    declaredCurrency: "AUD",
    engagementId: "55555555-5555-4555-8555-555555555555",
    evidenceCategory: "external_transfer_receipt" as const,
    expectedProjectRevision: 4,
    observationSha256: "2".repeat(64),
    paidAt: "2026-10-29T00:00:00.000Z",
    projectId: "66666666-6666-4666-8666-666666666666",
    referenceSha256: "3".repeat(64),
  };
  const hash = hashServicePaymentOperationRequest(
    servicePaymentEvidenceRequestIdentity(base)
  );
  for (const override of [
    { evidenceCategory: "provider_settlement_observation" as const },
    { paidAt: "2026-10-29T00:00:01.000Z" },
    { referenceSha256: "4".repeat(64) },
    { observationSha256: "5".repeat(64) },
    { declaredAmountMinor: 1 },
    { declaredCurrency: "USD" },
    { expectedProjectRevision: 5 },
  ]) {
    assert.notEqual(
      hash,
      hashServicePaymentOperationRequest(
        servicePaymentEvidenceRequestIdentity({ ...base, ...override })
      ),
      JSON.stringify(override)
    );
  }
});

test("the verification identity binds the whole decision", () => {
  const base = {
    agreementTermsSha256: TERMS,
    agreementVersionId: VERSION,
    amountMinor: 250_000,
    conditionId: CONDITION,
    currency: "AUD",
    engagementId: "55555555-5555-4555-8555-555555555555",
    evidenceId: EVIDENCE,
    expectedProjectRevision: 6,
    method: "manual_staff_reconciliation" as const,
    observationSha256: "6".repeat(64),
    projectId: "66666666-6666-4666-8666-666666666666",
    provenance: "synthetic test evidence provenance",
    providerCode: "synthetic_test_evidence_provider",
    reasonCode: null,
    status: "verified" as const,
  };
  const hash = hashServicePaymentOperationRequest(
    servicePaymentVerificationRequestIdentity(base)
  );
  for (const override of [
    { status: "rejected" as const, reasonCode: "receipt_not_legible" },
    { method: "external_provider_attestation" as const },
    { providerCode: "other_provider" },
    { provenance: "different synthetic test provenance" },
    { evidenceId: "99999999-9999-4999-8999-999999999999" },
    { expectedProjectRevision: 7 },
  ]) {
    assert.notEqual(
      hash,
      hashServicePaymentOperationRequest(
        servicePaymentVerificationRequestIdentity({ ...base, ...override })
      ),
      JSON.stringify(override)
    );
  }
});

test("the resolution identity binds kind, reason and the exact superseded target", () => {
  const base = {
    agreementTermsSha256: TERMS,
    agreementVersionId: VERSION,
    amountMinor: 250_000,
    conditionId: CONDITION,
    currency: "AUD",
    engagementId: "55555555-5555-4555-8555-555555555555",
    evidenceId: EVIDENCE,
    expectedProjectRevision: 8,
    kind: "dispute" as const,
    observationSha256: "7".repeat(64),
    projectId: "66666666-6666-4666-8666-666666666666",
    financeAuthorityCode: "synthetic_test_finance_attestation_authority",
    observationCode: "bank_feed_observation",
    reasonCode: "customer_claims_not_received",
    supersedesResolutionId: null,
  };
  const hash = hashServicePaymentOperationRequest(
    servicePaymentResolutionRequestIdentity(base)
  );
  for (const override of [
    { reasonCode: "bank_return" },
    { observationCode: "manual_observation" },
    { financeAuthorityCode: "other_finance_authority" },
    { kind: "refund" as const },
    { observationSha256: "8".repeat(64) },
    {
      kind: "correction" as const,
      evidenceId: null,
      supersedesResolutionId: RESOLUTION,
    },
    { expectedProjectRevision: 9 },
  ]) {
    assert.notEqual(
      hash,
      hashServicePaymentOperationRequest(
        servicePaymentResolutionRequestIdentity({ ...base, ...override })
      ),
      JSON.stringify(override)
    );
  }
});

/* Shared canonical identity fixtures (R2-B). */
const verificationIdentity = {
  agreementTermsSha256: TERMS,
  agreementVersionId: VERSION,
  amountMinor: 250_000,
  conditionId: CONDITION,
  currency: "AUD",
  engagementId: "55555555-5555-4555-8555-555555555555",
  evidenceId: EVIDENCE,
  expectedProjectRevision: 6,
  method: "manual_staff_reconciliation" as const,
  observationSha256: "6".repeat(64),
  projectId: "66666666-6666-4666-8666-666666666666",
  provenance: "synthetic test evidence provenance",
  providerCode: "synthetic_test_evidence_provider",
  reasonCode: null,
  status: "verified" as const,
};

const resolutionIdentity = {
  agreementTermsSha256: TERMS,
  agreementVersionId: VERSION,
  amountMinor: 250_000,
  conditionId: CONDITION,
  currency: "AUD",
  engagementId: "55555555-5555-4555-8555-555555555555",
  evidenceId: EVIDENCE,
  expectedProjectRevision: 8,
  financeAuthorityCode: "synthetic_test_finance_attestation_authority",
  kind: "dispute" as const,
  observationCode: "bank_feed_observation",
  observationSha256: "7".repeat(64),
  projectId: "66666666-6666-4666-8666-666666666666",
  reasonCode: "customer_claims_not_received",
  supersedesResolutionId: null,
};

test("verification provenance is bound as a digest, never as raw text", () => {
  const first = servicePaymentVerificationProvenanceSha256(
    "staff reconciled the bank statement against the receipt"
  );
  const replay = servicePaymentVerificationProvenanceSha256(
    "staff reconciled the bank statement against the receipt"
  );
  const changed = servicePaymentVerificationProvenanceSha256(
    "staff reconciled a different statement"
  );
  assert.match(first, /^[0-9a-f]{64}$/u);
  assert.equal(first, replay);
  assert.notEqual(first, changed);
  // Only the persisted prefix is material, so two inputs that differ beyond the
  // column width are the same request.
  assert.equal(
    servicePaymentVerificationProvenanceSha256("x".repeat(400)),
    servicePaymentVerificationProvenanceSha256("x".repeat(300))
  );
  // The raw text never becomes part of the canonical identity payload.
  const identity = servicePaymentVerificationRequestIdentity({
    ...verificationIdentity,
    provenance: "RAW-SENSITIVE-PROVENANCE-TEXT",
  });
  assert.equal(
    JSON.stringify(identity).includes("RAW-SENSITIVE-PROVENANCE-TEXT"),
    false
  );
  assert.equal(
    identity.verificationProvenanceSha256,
    servicePaymentVerificationProvenanceSha256("RAW-SENSITIVE-PROVENANCE-TEXT")
  );
});

test("the persisted observation code is normalized before it enters the identity", () => {
  assert.equal(servicePaymentPersistedObservationCode(null), null);
  assert.equal(servicePaymentPersistedObservationCode("   "), null);
  assert.equal(
    servicePaymentPersistedObservationCode("  bank_feed_observation  "),
    "bank_feed_observation"
  );
  assert.equal(
    servicePaymentPersistedObservationCode("y".repeat(200))?.length,
    64
  );
  // Trailing detail beyond the persisted width cannot change the request identity.
  const identity = (observationCode: string) =>
    servicePaymentResolutionRequestIdentity({
      ...resolutionIdentity,
      observationCode,
    });
  assert.deepEqual(
    identity(`${"z".repeat(64)}-ignored-suffix`).observationCode,
    identity("z".repeat(64)).observationCode
  );
});

test("a correction may never target the evidence it restores", () => {
  assert.equal(
    servicePaymentResolutionShapeValid({
      evidenceId: null,
      kind: "correction",
      supersedesResolutionId: RESOLUTION,
    }),
    true
  );
  assert.equal(
    servicePaymentResolutionShapeValid({
      evidenceId: EVIDENCE,
      kind: "correction",
      supersedesResolutionId: RESOLUTION,
    }),
    false
  );
  assert.equal(
    servicePaymentResolutionShapeValid({
      evidenceId: null,
      kind: "correction",
      supersedesResolutionId: null,
    }),
    false
  );
  assert.equal(
    servicePaymentResolutionShapeValid({
      evidenceId: null,
      kind: "void",
      supersedesResolutionId: null,
    }),
    true
  );
  assert.equal(
    servicePaymentResolutionShapeValid({
      evidenceId: null,
      kind: "refund",
      supersedesResolutionId: null,
    }),
    false
  );
});
