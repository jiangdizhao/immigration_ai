import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coeValidityState,
  isCustomerAuthorableProvenance,
  normalizeOptionalSchoolAdmissionsDate,
  normalizeSchoolAdmissionsText,
  offerExpiryState,
  offerStateForAction,
  offerTransitionAllowed,
  provenanceRank,
  requiresAuthoritativeProvenance,
  SCHOOL_ADMISSIONS_POLICY_VERSION,
  type SchoolAdmissionsError,
  schoolAdmissionsEnabled,
  schoolAdmissionsRequestMatches,
  schoolAdmissionsRequestSha256,
} from "./contracts";

import {
  buildDisclosures,
  buildDraftSections,
  buildNextSteps,
  buildRequirementChecklist,
  isSchoolAdmissionsConfirmationForwardOnly,
  preparationContentSha256,
  preparationInputsSha256,
  preparationStaleReasons,
  type SchoolAdmissionsEducationSummary,
  type SchoolAdmissionsPreparationInputs,
  sourceDigest,
} from "./workflow";

test("the feature gate is default OFF and opt-in only", () => {
  assert.equal(schoolAdmissionsEnabled(undefined), false);
  assert.equal(schoolAdmissionsEnabled(""), false);
  assert.equal(schoolAdmissionsEnabled("false"), false);
  assert.equal(schoolAdmissionsEnabled("TRUE"), true);
  assert.equal(
    SCHOOL_ADMISSIONS_POLICY_VERSION,
    "phase13-m5-2-school-admissions-v1"
  );
});

test("only customer-reported and document-backed provenance are authorable", () => {
  assert.equal(isCustomerAuthorableProvenance("customer_reported"), true);
  assert.equal(
    isCustomerAuthorableProvenance("document_backed_unverified"),
    true
  );
  assert.equal(isCustomerAuthorableProvenance("source_reviewed"), false);
  assert.equal(isCustomerAuthorableProvenance("provider_confirmed"), false);
  assert.equal(requiresAuthoritativeProvenance("source_reviewed"), true);
  assert.equal(requiresAuthoritativeProvenance("provider_confirmed"), true);
  assert.equal(requiresAuthoritativeProvenance("customer_reported"), false);
  assert.equal(provenanceRank("customer_reported"), 1);
  assert.equal(provenanceRank("document_backed_unverified"), 2);
  assert.equal(provenanceRank("source_reviewed"), 3);
  assert.equal(provenanceRank("provider_confirmed"), 4);
});

test("offer transitions are frozen and terminal states reject re-decision", () => {
  assert.equal(offerTransitionAllowed("received", "accepted"), true);
  assert.equal(offerTransitionAllowed("accepted", "declined"), false);
  assert.equal(offerStateForAction("received", "start_review"), "under_review");
  assert.equal(offerStateForAction("under_review", "accept"), "accepted");
  assert.equal(offerStateForAction("deferred", "decline"), "declined");
  assert.throws(
    () => offerStateForAction("accepted", "accept"),
    (error: unknown) =>
      (error as SchoolAdmissionsError).code === "state_conflict"
  );
  assert.throws(
    () => offerStateForAction("expired", "start_review"),
    (error: unknown) =>
      (error as SchoolAdmissionsError).code === "state_conflict"
  );
});

test("offer/CoE validity is an observation and never fabricates state", () => {
  const now = new Date("2026-10-30T00:00:00.000Z");
  assert.equal(
    offerExpiryState({ expiresOn: null, now, state: "received" }),
    "unknown"
  );
  assert.equal(
    offerExpiryState({ expiresOn: "2026-10-20", now, state: "received" }),
    "expired"
  );
  assert.equal(
    offerExpiryState({ expiresOn: "2026-11-05", now, state: "received" }),
    "expiring_soon"
  );
  assert.equal(
    offerExpiryState({ expiresOn: "2027-03-01", now, state: "received" }),
    "valid"
  );
  assert.equal(
    offerExpiryState({ expiresOn: "2026-10-01", now, state: "accepted" }),
    "not_applicable"
  );
  assert.equal(
    coeValidityState({ now, state: "obtained", validTo: "2026-10-01" }),
    "expired"
  );
  assert.equal(
    coeValidityState({ now, state: "superseded", validTo: "2026-10-01" }),
    "not_applicable"
  );
});

test("bounded text and date validators reject unsafe input", () => {
  assert.equal(
    normalizeSchoolAdmissionsText("  hello\n world  "),
    "hello world"
  );
  assert.throws(
    () => normalizeSchoolAdmissionsText(""),
    (error: unknown) =>
      (error as SchoolAdmissionsError).code === "invalid_request"
  );
  assert.throws(
    () => normalizeSchoolAdmissionsText("x".repeat(201)),
    (error: unknown) =>
      (error as SchoolAdmissionsError).code === "invalid_request"
  );
  assert.throws(
    () => normalizeSchoolAdmissionsText("bad\u0000text"),
    (error: unknown) =>
      (error as SchoolAdmissionsError).code === "invalid_request"
  );
  assert.equal(normalizeOptionalSchoolAdmissionsDate(null), null);
  assert.equal(
    normalizeOptionalSchoolAdmissionsDate("2027-02-28"),
    "2027-02-28"
  );
  assert.throws(
    () => normalizeOptionalSchoolAdmissionsDate("2027-02-30"),
    (error: unknown) =>
      (error as SchoolAdmissionsError).code === "invalid_request"
  );
  assert.throws(
    () => normalizeOptionalSchoolAdmissionsDate("28/02/2027"),
    (error: unknown) =>
      (error as SchoolAdmissionsError).code === "invalid_request"
  );
});

test("request identity is deterministic and detects a changed payload", () => {
  const first = schoolAdmissionsRequestSha256({ a: 1, b: [2, 3] });
  const second = schoolAdmissionsRequestSha256({ b: [2, 3], a: 1 });
  const changed = schoolAdmissionsRequestSha256({ a: 1, b: [2, 4] });
  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.match(first, /^[0-9a-f]{64}$/u);
  assert.equal(
    schoolAdmissionsRequestMatches(
      { operationType: "school_admission_prepare", requestSha256: first },
      { operationType: "school_admission_prepare", requestSha256: second }
    ),
    true
  );
  assert.equal(
    schoolAdmissionsRequestMatches(
      { operationType: "school_admission_prepare", requestSha256: first },
      { operationType: "school_admission_confirm", requestSha256: second }
    ),
    false
  );
});

const INTAKE = "2027 Semester 1";

function baseInputs(
  patch: Partial<SchoolAdmissionsPreparationInputs> = {}
): SchoolAdmissionsPreparationInputs {
  return {
    application: {
      applicationId: "11111111-1111-4111-8111-111111111111",
      applicationStatus: "package_prepared",
      archived: false,
      catalogRecordClass: "UNVERIFIED",
      catalogSnapshotToken: "catalog:v1",
      courseId: "course-1",
      courseTitle: "Master of Data Science",
      currentPackage: {
        contentSha256: "a".repeat(64),
        inputsSha256: "b".repeat(64),
        packageId: "22222222-2222-4222-8222-222222222222",
        staleReasonCodes: [],
        targetBindingSha256: "c".repeat(64),
        usable: true,
        version: 1,
      },
      deliveryId: null,
      institutionId: "inst-1",
      institutionName: "Example University",
      intakeId: "intake-1",
      intakeLabel: INTAKE,
      missingDataCodes: [],
      projectId: "33333333-3333-4333-8333-333333333333",
      references: [
        {
          available: true,
          changed: false,
          kind: "fact",
          referenceId: "44444444-4444-4444-8444-444444444444",
          referenceSha256: "d".repeat(64),
          referenceVersion: 2,
          revoked: false,
        },
      ],
      revision: 3,
      sourceStatus: "unverified_catalog_match",
    },
    assistKind: "disabled",
    confirmed: false,
    education: {
      courseLabel: "Master of Data Science",
      institutionLabel: "Example University",
      recordClass: "UNVERIFIED",
      snapshotToken: "catalog:v1",
      status: "resolved",
    },
    evidence: {
      conflictState: "none",
      documentCount: 1,
      factCount: 1,
      requirementCount: 0,
      unavailableCount: 0,
    },
    managed: null,
    originKind: "school_application",
    outcomes: { coe: null, exception: null, offer: null },
    serviceMode: "self_service",
    standalone: null,
    suggestions: [],
    ...patch,
  };
}

function statusOf(
  items: readonly { code: string; status: string }[],
  code: string
): string | undefined {
  return items.find((entry) => entry.code === code)?.status;
}

test("the checklist never marks catalog evidence or drafts as satisfied", () => {
  const items = buildRequirementChecklist(baseInputs());
  assert.equal(statusOf(items, "application_target_complete"), "satisfied");
  assert.equal(statusOf(items, "evidence_fact_available"), "satisfied");
  assert.equal(statusOf(items, "evidence_document_available"), "satisfied");
  // M3 catalog records are SYNTHETIC/UNVERIFIED, so resolution is not proof.
  assert.equal(statusOf(items, "education_source_resolved"), "unverified");
  assert.equal(statusOf(items, "preparation_package_usable"), "satisfied");
  assert.equal(statusOf(items, "customer_confirmation_recorded"), "missing");
  // Managed-only predicates do not apply to a self-service case.
  assert.equal(statusOf(items, "managed_engagement_current"), "not_applicable");
  assert.equal(statusOf(items, "managed_authority_verified"), "not_applicable");
});

test("conflicting and unavailable evidence is surfaced, never resolved", () => {
  const conflicting = buildRequirementChecklist(
    baseInputs({
      evidence: {
        conflictState: "conflicts",
        documentCount: 0,
        factCount: 3,
        requirementCount: 0,
        unavailableCount: 0,
      },
    })
  );
  assert.equal(statusOf(conflicting, "evidence_fact_available"), "conflicting");
  const unavailable = buildRequirementChecklist(
    baseInputs({
      evidence: {
        conflictState: "unavailable",
        documentCount: 0,
        factCount: 0,
        requirementCount: 0,
        unavailableCount: 2,
      },
    })
  );
  assert.equal(statusOf(unavailable, "evidence_fact_available"), "unknown");
  assert.equal(
    unavailable
      .find((entry) => entry.code === "evidence_fact_available")
      ?.uncertaintyCodes.includes("conflict_state_unavailable"),
    true
  );
});

test("managed requirements stay unknown without an authority observation", () => {
  const items = buildRequirementChecklist(
    baseInputs({ managed: null, serviceMode: "managed_service" })
  );
  assert.equal(statusOf(items, "managed_engagement_current"), "unknown");
  assert.equal(statusOf(items, "managed_authority_verified"), "unknown");
  const known = buildRequirementChecklist(
    baseInputs({
      managed: {
        authorityVerified: false,
        engagementCurrent: true,
        status: "NOT_READY",
      },
      serviceMode: "managed_service",
    })
  );
  assert.equal(statusOf(known, "managed_engagement_current"), "satisfied");
  assert.equal(statusOf(known, "managed_authority_verified"), "missing");
});

test("existing-Offer entry requires an outcome and does not fake an application", () => {
  const standalone = baseInputs({
    application: null,
    education: { status: "not_applicable" },
    originKind: "existing_offer",
    standalone: {
      courseTitle: "Bachelor of Nursing",
      institutionName: "Example College",
      intakeLabel: null,
    },
  });
  const items = buildRequirementChecklist(standalone);
  assert.equal(statusOf(items, "application_target_complete"), "satisfied");
  assert.equal(statusOf(items, "outcome_pathway_present"), "missing");
  assert.equal(statusOf(items, "preparation_package_usable"), "not_applicable");
  const withOffer = buildRequirementChecklist({
    ...standalone,
    outcomes: {
      coe: null,
      exception: null,
      offer: {
        expiresOn: null,
        provenance: "customer_reported",
        state: "received",
      },
    },
  });
  assert.equal(statusOf(withOffer, "outcome_pathway_present"), "satisfied");
});

test("a claimed CoE is unverified until a document is attached", () => {
  const claimed = buildRequirementChecklist(
    baseInputs({
      originKind: "existing_coe",
      outcomes: {
        coe: {
          provenance: "customer_reported",
          state: "claimed",
          validTo: null,
        },
        exception: null,
        offer: null,
      },
    })
  );
  assert.equal(statusOf(claimed, "coe_evidence_recorded"), "unverified");
  const documented = buildRequirementChecklist(
    baseInputs({
      originKind: "existing_coe",
      outcomes: {
        coe: {
          provenance: "document_backed_unverified",
          state: "obtained",
          validTo: null,
        },
        exception: null,
        offer: null,
      },
    })
  );
  assert.equal(statusOf(documented, "coe_evidence_recorded"), "satisfied");
});

test("the draft is deterministic, source-linked and never asserts results", () => {
  const inputs = baseInputs();
  const items = buildRequirementChecklist(inputs);
  const sections = buildDraftSections(inputs, items);
  assert.equal(sections.length, 7);
  for (const section of sections) {
    assert.ok(section.text.length > 0);
    assert.ok(section.sources.length > 0);
    assert.doesNotMatch(
      section.text,
      /you have been admitted|admission is guaranteed|offer is confirmed|visa will be granted/iu
    );
  }
  const summary = sections.find(
    (entry) => entry.code === "application_summary"
  );
  assert.match(summary?.text ?? "", /Provisional draft/u);
  assert.equal(
    summary?.uncertaintyCodes.includes("draft_is_provisional"),
    true
  );
  const finance = sections.find((entry) => entry.code === "financial_capacity");
  assert.match(finance?.text ?? "", /no amount and no payment/u);
  const study = sections.find((entry) => entry.code === "study_purpose");
  assert.equal(study?.uncertaintyCodes.includes("no_visa_outcome_claim"), true);
  assert.equal(
    preparationContentSha256(sections),
    preparationContentSha256(buildDraftSections(inputs, items))
  );
});

test("stub suggestions may rewrite prose but cannot fabricate sources", () => {
  const inputs = baseInputs({
    assistKind: "stub_suggestion",
    suggestions: [
      {
        sectionCode: "study_purpose",
        sourceCodes: [],
        text: "A bounded suggestion sentence written by the stub adapter.",
        uncertaintyCodes: [],
      },
    ],
  });
  const sections = buildDraftSections(
    inputs,
    buildRequirementChecklist(inputs)
  );
  const study = sections.find((entry) => entry.code === "study_purpose");
  assert.equal(
    study?.text,
    "A bounded suggestion sentence written by the stub adapter."
  );
  assert.deepEqual(study?.sources, ["deterministic_template"]);
  assert.equal(study?.uncertaintyCodes.includes("no_visa_outcome_claim"), true);
});

test("staleness compares material inputs only, so confirmation cannot self-invalidate", () => {
  const requirements = buildRequirementChecklist(
    baseInputs({ confirmed: true })
  );
  const digest = preparationInputsSha256({
    applicationId: "11111111-1111-4111-8111-111111111111",
    applicationRevision: 3,
    packageContentSha256: "a".repeat(64),
    packageId: "22222222-2222-4222-8222-222222222222",
    requirements,
    serviceMode: "self_service",
    sourceDigest: "e".repeat(64),
  });
  const unconfirmed = preparationInputsSha256({
    applicationId: "11111111-1111-4111-8111-111111111111",
    applicationRevision: 3,
    packageContentSha256: "a".repeat(64),
    packageId: "22222222-2222-4222-8222-222222222222",
    requirements: buildRequirementChecklist(baseInputs({ confirmed: false })),
    serviceMode: "self_service",
    sourceDigest: "e".repeat(64),
  });
  assert.equal(digest, unconfirmed);

  const reasons = preparationStaleReasons({
    current: {
      applicationRevision: 4,
      archived: false,
      inputsSha256: `${digest.slice(0, 63)}0`,
      packageContentSha256: "f".repeat(64),
      packageId: "55555555-5555-4555-8555-555555555555",
      sourceAvailable: false,
      sourceChanged: true,
    },
    recorded: {
      applicationRevision: 3,
      inputsSha256: digest,
      packageContentSha256: "a".repeat(64),
      packageId: "22222222-2222-4222-8222-222222222222",
    },
  });
  assert.deepEqual([...reasons].sort(), [
    "application_changed",
    "package_changed",
    "requirements_changed",
    "source_changed",
    "source_unavailable",
  ]);
  assert.deepEqual(
    preparationStaleReasons({
      current: {
        applicationRevision: 3,
        archived: false,
        inputsSha256: digest,
        packageContentSha256: "a".repeat(64),
        packageId: "22222222-2222-4222-8222-222222222222",
        sourceAvailable: true,
        sourceChanged: false,
      },
      recorded: {
        applicationRevision: 3,
        inputsSha256: digest,
        packageContentSha256: "a".repeat(64),
        packageId: "22222222-2222-4222-8222-222222222222",
      },
    }),
    []
  );
});

test("disclosures stay honest for unverified and managed cases", () => {
  const base = buildDisclosures({
    assistKind: "disabled",
    coe: null,
    education: { status: "not_applicable" },
    exception: null,
    offer: null,
    serviceMode: "self_service",
  });
  assert.equal(base.includes("not_a_school_submission"), true);
  assert.equal(base.includes("no_verified_offer_or_coe"), true);
  assert.equal(base.includes("draft_is_provisional"), true);
  assert.equal(base.includes("ai_assist_unavailable"), true);
  assert.equal(base.includes("vip_not_managed_entitlement"), false);

  const managed = buildDisclosures({
    assistKind: "deterministic_template",
    coe: { provenance: "customer_reported", state: "claimed", validTo: null },
    education: {
      courseLabel: null,
      institutionLabel: null,
      recordClass: "UNVERIFIED",
      snapshotToken: "t",
      status: "resolved",
    },
    exception: { state: "needs_verification" },
    offer: {
      expiresOn: null,
      provenance: "document_backed_unverified",
      state: "received",
    },
    serviceMode: "managed_service",
  });
  for (const code of [
    "managed_submission_not_connected",
    "vip_not_managed_entitlement",
    "payment_not_certified",
    "coe_does_not_establish_student_500_eligibility",
    "customer_report_not_verified",
    "document_not_authenticated",
    "catalog_not_independently_verified",
    "professional_authority_unavailable",
  ]) {
    assert.equal(managed.includes(code as never), true, code);
  }
});

test("next steps are derived from state, not from a model", () => {
  const items = buildRequirementChecklist(baseInputs());
  const steps = buildNextSteps({
    expiryState: "expiring_soon",
    items,
    outcomes: {
      coe: null,
      exception: null,
      offer: {
        expiresOn: "2026-11-01",
        provenance: "customer_reported",
        state: "received",
      },
    },
    readiness: "NOT_EVALUATED",
    serviceMode: "managed_service",
  });
  assert.equal(steps.includes("record_customer_confirmation"), true);
  assert.equal(steps.includes("review_offer_expiry"), true);
  assert.equal(steps.includes("request_managed_service_support"), true);
  assert.equal(steps.includes("complete_application_details"), false);
  const declared = buildNextSteps({
    expiryState: "not_applicable",
    items: buildRequirementChecklist(
      baseInputs({
        evidence: {
          conflictState: "conflicts",
          documentCount: 0,
          factCount: 0,
          requirementCount: 0,
          unavailableCount: 1,
        },
      })
    ),
    outcomes: { coe: null, exception: null, offer: null },
    readiness: "NOT_EVALUATED",
    serviceMode: "self_service",
  });
  assert.equal(declared.includes("resolve_conflicting_facts"), true);
  assert.equal(declared.includes("bind_source_evidence"), true);
});

test("source digests ignore ordering but react to availability changes", () => {
  const references = [
    {
      available: true,
      changed: false,
      kind: "fact" as const,
      referenceId: "66666666-6666-4666-8666-666666666666",
      referenceSha256: "1".repeat(64),
      referenceVersion: 1,
      revoked: false,
    },
    {
      available: true,
      changed: false,
      kind: "document" as const,
      referenceId: "77777777-7777-4777-8777-777777777777",
      referenceSha256: "2".repeat(64),
      referenceVersion: 4,
      revoked: false,
    },
  ];
  const education: SchoolAdmissionsEducationSummary = {
    status: "not_applicable",
  };
  const forward = sourceDigest(references, education);
  assert.equal(forward, sourceDigest([...references].reverse(), education));
  assert.notEqual(
    forward,
    sourceDigest(
      [{ ...references[0], available: false }, references[1]],
      education
    )
  );

  test("confirmation may advance but is never cleared or reversed", () => {
    // Positive: an unconfirmed case may become confirmed, and a confirmed case may
    // advance to a newer prepared version (or stay on the same one).
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(null, null), true);
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(null, 1), true);
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(null, 3), true);
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(1, 2), true);
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(1, 7), true);
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(2, 2), true);
    // Negative: a recorded confirmation can never be cleared back to "unconfirmed"
    // and can never move backwards onto an older snapshot.
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(1, null), false);
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(2, null), false);
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(2, 1), false);
    assert.equal(isSchoolAdmissionsConfirmationForwardOnly(5, 4), false);
  });
});
