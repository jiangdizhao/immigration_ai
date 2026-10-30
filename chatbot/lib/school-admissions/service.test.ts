// biome-ignore-all lint/suspicious/noMisplacedAssertion: guarded assertions live in shared helpers.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { SchoolAdmissionsError } from "./contracts";
import {
  createSchoolAdmissionsTestHarness,
  type SeedReference,
} from "./test-adapters";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);

function operationId() {
  return `op-${randomUUID()}`;
}

function setup(
  options: Parameters<typeof createSchoolAdmissionsTestHarness>[0] = {}
) {
  const harness = createSchoolAdmissionsTestHarness(options);
  const projectId = randomUUID();
  const ownerUserId = randomUUID();
  harness.store.seedProject(projectId, { ownerUserId, status: "active" });
  harness.store.seedActor(ownerUserId, { registeredCustomer: true });
  return { harness, ownerUserId, projectId };
}

async function expectCode(
  promise: Promise<unknown>,
  code: ConstructorParameters<typeof SchoolAdmissionsError>[0]
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal((error as SchoolAdmissionsError).code, code);
    return true;
  });
}

function references(): SeedReference[] {
  return [
    {
      available: true,
      changed: false,
      kind: "fact",
      referenceId: randomUUID(),
      referenceSha256: SHA_A,
      referenceVersion: 2,
      revoked: false,
    },
    {
      available: true,
      changed: false,
      kind: "document",
      referenceId: randomUUID(),
      referenceSha256: SHA_B,
      referenceVersion: 1,
      revoked: false,
    },
  ];
}

async function boundCase(
  overrides: {
    applicationStatus?: "package_prepared" | "stale" | "archived";
    revision?: number;
    references?: SeedReference[];
    courseTitle?: string;
    institutionName?: string;
    withPackage?: boolean;
  } = {}
) {
  const { harness, ownerUserId, projectId } = setup();
  const applicationId = randomUUID();
  harness.seedApplication({
    applicationId,
    applicationStatus: overrides.applicationStatus ?? "package_prepared",
    courseTitle: overrides.courseTitle ?? "Master of Data Science",
    currentPackage:
      overrides.withPackage === false
        ? null
        : {
            contentSha256: SHA_C,
            inputsSha256: SHA_D,
            packageId: randomUUID(),
            staleReasonCodes: [],
            targetBindingSha256: SHA_A,
            usable: true,
            version: 1,
          },
    institutionId: "inst-1",
    institutionName: overrides.institutionName ?? "Example University",
    ownerUserId,
    projectId,
    references: overrides.references ?? references(),
    revision: overrides.revision ?? 4,
  });
  const created = await harness.service.createCase({
    actorUserId: ownerUserId,
    applicationId,
    operationId: operationId(),
    originKind: "school_application",
    projectId,
  });
  return {
    applicationId,
    caseId: created.case.caseId,
    harness,
    ownerUserId,
    projectId,
  };
}

test("three applications progress independently inside one Project", async () => {
  const { harness, ownerUserId, projectId } = setup();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const names = ["Alpha University", "Beta Institute", "Gamma College"];
  for (const [index, applicationId] of ids.entries()) {
    harness.seedApplication({
      applicationId,
      institutionName: names[index] as string,
      ownerUserId,
      projectId,
      references: references(),
    });
    await harness.service.createCase({
      actorUserId: ownerUserId,
      applicationId,
      operationId: operationId(),
      originKind: "school_application",
      projectId,
    });
  }
  const listed = await harness.service.list({
    actorUserId: ownerUserId,
    projectId,
  });
  assert.equal(listed.cases.length, 3);
  assert.deepEqual(
    listed.cases.map((entry) => entry.institutionName).sort(),
    [...names].sort()
  );
  const first = listed.cases.find(
    (entry) => entry.institutionName === "Alpha University"
  );
  await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId: first?.caseId as string,
    expectedRevision: first?.revision as number,
    operationId: operationId(),
    projectId,
  });
  const after = await harness.service.list({
    actorUserId: ownerUserId,
    projectId,
  });
  const prepared = after.cases.filter(
    (entry) => entry.preparationState !== "not_started"
  );
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0]?.institutionName, "Alpha University");
});

test("an existing Offer entry point never fabricates a school application", async () => {
  const { harness, ownerUserId, projectId } = setup();
  const created = await harness.service.createCase({
    actorUserId: ownerUserId,
    courseTitle: "Bachelor of Nursing",
    institutionName: "Existing Offer College",
    operationId: operationId(),
    originKind: "existing_offer",
    projectId,
  });
  assert.equal(created.case.applicationId, null);
  assert.equal(created.case.application, null);
  assert.equal(created.case.journey.offerState, "none");
  assert.equal(
    created.case.requirements.find(
      (entry) => entry.code === "outcome_pathway_present"
    )?.status,
    "missing"
  );
  await expectCode(
    harness.service.createCase({
      actorUserId: ownerUserId,
      applicationId: randomUUID(),
      courseTitle: "Bachelor of Nursing",
      institutionName: "Existing Offer College",
      operationId: operationId(),
      originKind: "existing_offer",
      projectId,
    }),
    "invalid_request"
  );
});

test("an existing CoE entry stays claimed until a document is attached", async () => {
  const { harness, ownerUserId, projectId } = setup();
  const documentId = randomUUID();
  harness.seedDocument({ projectId, referenceId: documentId, sha256: SHA_D });
  const created = await harness.service.createCase({
    actorUserId: ownerUserId,
    courseTitle: "Master of Teaching",
    institutionName: "CoE College",
    operationId: operationId(),
    originKind: "existing_coe",
    projectId,
  });
  const caseId = created.case.caseId;
  const claimed = await harness.service.recordOutcome({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: created.case.revision,
    kind: "coe",
    operationId: operationId(),
    projectId,
    provenance: "customer_reported",
  });
  const claimedCoe = claimed.case.coe;
  assert.equal(claimedCoe?.state, "claimed");
  assert.equal(claimedCoe?.independentlyVerified, false);
  assert.equal(claimedCoe?.evidenceAttached, false);
  assert.equal(
    claimed.case.disclosures.includes(
      "coe_does_not_establish_student_500_eligibility"
    ),
    true
  );
  assert.equal(claimed.case.journey.student500Eligibility, "not_determined");
  await expectCode(
    harness.service.transitionOutcome({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: claimed.case.revision,
      kind: "coe",
      operationId: operationId(),
      outcomeId: claimedCoe?.outcomeId as string,
      projectId,
      state: "obtained",
    }),
    "evidence_invalid"
  );
  const obtained = await harness.service.recordOutcome({
    actorUserId: ownerUserId,
    caseId,
    evidenceReferenceId: documentId,
    expectedRevision: claimed.case.revision,
    kind: "coe",
    operationId: operationId(),
    projectId,
    provenance: "document_backed_unverified",
  });
  assert.equal(obtained.case.coe?.state, "obtained");
  assert.equal(obtained.case.coe?.provenance, "document_backed_unverified");
  assert.equal(obtained.case.coe?.independentlyVerified, false);
  assert.equal(obtained.case.coe?.evidenceAttached, true);
});

test("a claimed exception is never verified without real authority", async () => {
  const { harness, ownerUserId, projectId } = setup();
  const created = await harness.service.createCase({
    actorUserId: ownerUserId,
    courseTitle: "Diploma of Business",
    institutionName: "Exception College",
    operationId: operationId(),
    originKind: "claimed_exception",
    projectId,
  });
  const caseId = created.case.caseId;
  const claimed = await harness.service.claimException({
    actorUserId: ownerUserId,
    caseId,
    description:
      "Customer states the school waived the application requirement.",
    expectedRevision: created.case.revision,
    operationId: operationId(),
    projectId,
  });
  assert.equal(claimed.case.exception?.state, "claimed");
  assert.equal(claimed.case.exception?.authorityReference, null);
  assert.equal(
    claimed.case.disclosures.includes("professional_authority_unavailable"),
    true
  );
  const before = claimed.case;
  await expectCode(
    harness.service.requestExceptionVerification({
      actorUserId: ownerUserId,
      caseId,
      exceptionId: before.exception?.exceptionId as string,
      expectedRevision: before.revision,
      operationId: operationId(),
      projectId,
    }),
    "authority_unavailable"
  );
  const after = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  assert.equal(after.case.exception?.state, "claimed");
  assert.equal(after.case.revision, before.revision);
  assert.equal(
    after.case.nextStepCodes.includes("verify_exception_authoritatively"),
    false
  );

  harness.setVerification({
    authorityReference: "authority:case-1",
    status: "verified",
  });
  const verified = await harness.service.requestExceptionVerification({
    actorUserId: ownerUserId,
    caseId,
    exceptionId: before.exception?.exceptionId as string,
    expectedRevision: after.case.revision,
    operationId: operationId(),
    projectId,
  });
  assert.equal(verified.case.exception?.state, "verified");
  assert.equal(verified.case.exception?.authorityReference, "authority:case-1");
});

test("preparation is source-linked and records which evidence was available", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const detail = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  harness.seedEducation({
    courseId: null,
    institutionId: "inst-1",
    projectId,
    summary: {
      courseLabel: null,
      institutionLabel: "Example University",
      recordClass: "UNVERIFIED",
      snapshotToken: "catalog:1",
      status: "resolved",
    },
  });
  const prepared = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: detail.case.revision,
    operationId: operationId(),
    projectId,
  });
  const preparation = prepared.case.preparation;
  assert.equal(preparation?.provisional, true);
  assert.equal(preparation?.assistKind, "disabled");
  assert.equal(prepared.case.preparationState, "in_preparation");
  assert.equal(
    prepared.case.requirements.find(
      (entry) => entry.code === "evidence_document_available"
    )?.status,
    "satisfied"
  );
  assert.equal(
    prepared.case.requirements.find(
      (entry) => entry.code === "evidence_fact_available"
    )?.status,
    "satisfied"
  );
  assert.equal(
    prepared.case.requirements.find(
      (entry) => entry.code === "education_source_resolved"
    )?.status,
    "unverified"
  );
  assert.equal(
    prepared.case.disclosures.includes("catalog_not_independently_verified"),
    true
  );
  assert.equal(
    prepared.case.disclosures.includes("ai_assist_unavailable"),
    true
  );
  assert.match(
    preparation?.sections.find((entry) => entry.code === "application_summary")
      ?.text ?? "",
    /Provisional draft/u
  );
});

test("a material source change invalidates the confirmed preparation", async () => {
  const { harness, ownerUserId, projectId, caseId, applicationId } =
    await boundCase();
  const detail = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  const prepared = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: detail.case.revision,
    operationId: operationId(),
    projectId,
  });
  const confirmed = await harness.service.confirmPreparation({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: prepared.case.revision,
    operationId: operationId(),
    preparationId: prepared.case.preparation?.preparationId as string,
    projectId,
  });
  assert.equal(confirmed.case.preparationState, "customer_confirmed");
  assert.equal(confirmed.case.preparation?.stale, false);

  harness.updateApplication(applicationId, { revision: 5 });
  const afterRevision = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  assert.equal(afterRevision.case.preparationStale, true);
  assert.equal(
    afterRevision.case.staleReasonCodes.includes("application_changed"),
    true
  );

  const base = references();
  harness.updateApplication(applicationId, {
    references: [
      { ...(base[0] as SeedReference), changed: true },
      base[1] as SeedReference,
    ],
    revision: 5,
  });
  const afterSource = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  assert.equal(
    afterSource.case.staleReasonCodes.includes("source_changed"),
    true
  );
  await expectCode(
    harness.service.confirmPreparation({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: afterSource.case.revision,
      operationId: operationId(),
      preparationId: afterSource.case.preparation?.preparationId as string,
      projectId,
    }),
    "state_conflict"
  );
});

test("conflicting facts and revoked access are surfaced, never resolved", async () => {
  const { harness, ownerUserId, projectId, caseId, applicationId } =
    await boundCase();
  harness.setConflictState(projectId, "conflicts");
  const detail = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  assert.equal(
    detail.case.requirements.find(
      (entry) => entry.code === "evidence_fact_available"
    )?.status,
    "conflicting"
  );
  assert.equal(
    detail.case.nextStepCodes.includes("resolve_conflicting_facts"),
    true
  );

  harness.setConflictState(projectId, "unavailable");
  const unavailable = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  assert.equal(
    unavailable.case.requirements.find(
      (entry) => entry.code === "evidence_fact_available"
    )?.status,
    "unknown"
  );

  const base = references();
  harness.updateApplication(applicationId, {
    references: [
      base[0] as SeedReference,
      { ...(base[1] as SeedReference), available: false, revoked: true },
    ],
  });
  const revoked = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  assert.equal(
    revoked.case.requirements.find(
      (entry) => entry.code === "evidence_document_available"
    )?.status,
    "missing"
  );
  assert.equal(revoked.case.application?.unavailableReferenceCount, 1);
});

test("a correction creates a new preparation version, never a mutation", async () => {
  const { harness, ownerUserId, projectId, caseId, applicationId } =
    await boundCase();
  const first = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  const v1 = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: first.case.revision,
    operationId: operationId(),
    projectId,
  });
  assert.equal(v1.preparationVersion, 1);
  harness.updateApplication(applicationId, { revision: 6 });
  const second = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  assert.equal(second.case.preparationStale, true);
  const v2 = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: second.case.revision,
    operationId: operationId(),
    projectId,
  });
  assert.equal(v2.preparationVersion, 2);
  assert.deepEqual(
    v2.case.preparationHistory.map((entry) => entry.version),
    [2, 1]
  );
  assert.equal(v2.case.preparation?.stale, false);
  // The historical version is retained with its own digest, not overwritten.
  assert.notEqual(
    v1.case.preparation?.inputsSha256,
    v2.case.preparation?.inputsSha256
  );
});

test("stub suggestions stay provisional and cannot satisfy a requirement", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  harness.setDrafting("stub_suggestion", [
    {
      sectionCode: "academic_background",
      sourceCodes: ["deterministic_template"],
      text: "Suggested academic summary sentence.",
      uncertaintyCodes: [],
    },
  ]);
  const detail = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  const prepared = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: detail.case.revision,
    operationId: operationId(),
    projectId,
  });
  assert.equal(prepared.case.preparation?.assistKind, "stub_suggestion");
  assert.equal(prepared.case.preparation?.provisional, true);
  assert.equal(
    prepared.case.preparation?.sections.find(
      (entry) => entry.code === "academic_background"
    )?.text,
    "Suggested academic summary sentence."
  );
  assert.equal(
    prepared.case.requirements.find(
      (entry) => entry.code === "customer_confirmation_recorded"
    )?.status,
    "missing"
  );
  assert.equal(
    prepared.case.disclosures.includes("ai_assist_unavailable"),
    false
  );
});

test("self-service external actions are customer-reported and never verified", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const recorded = await harness.service.recordExternalAction({
    acknowledged: true,
    actionKind: "school_portal_submission",
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: (
      await harness.service.get({ actorUserId: ownerUserId, caseId, projectId })
    ).case.revision,
    operationId: operationId(),
    performedOn: "2026-10-20",
    projectId,
  });
  assert.equal(recorded.case.externalActions.length, 1);
  const action = recorded.case.externalActions[0];
  assert.equal(action?.provenance, "customer_reported");
  assert.equal(action?.verified, false);
  assert.equal(action?.actionKind, "school_portal_submission");
  assert.equal(
    recorded.case.disclosures.includes("not_a_school_submission"),
    true
  );

  // Managed mode never accepts a customer self-report of the same action.
  const managed = await harness.service.setServiceMode({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: recorded.case.revision,
    operationId: operationId(),
    projectId,
    serviceMode: "managed_service",
  });
  await expectCode(
    harness.service.recordExternalAction({
      acknowledged: true,
      actionKind: "email_submission",
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: managed.case.revision,
      operationId: operationId(),
      performedOn: "2026-10-21",
      projectId,
    }),
    "state_conflict"
  );
});

test("managed readiness fails closed and never becomes a submission", async () => {
  const { harness, ownerUserId, projectId, caseId, applicationId } =
    await boundCase();
  const managed = await harness.service.setServiceMode({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: (
      await harness.service.get({ actorUserId: ownerUserId, caseId, projectId })
    ).case.revision,
    operationId: operationId(),
    projectId,
    serviceMode: "managed_service",
  });
  assert.equal(managed.case.serviceMode, "managed_service");
  assert.equal(managed.case.managedReadiness.status, "NOT_EVALUATED");
  assert.equal(managed.case.managedReadiness.submissionState, "not_connected");
  assert.equal(
    managed.case.disclosures.includes("vip_not_managed_entitlement"),
    true
  );

  // No approved M4 source: the observation is UNKNOWN and nothing is READY.
  const unknown = await harness.service.evaluateManagedReadiness({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: managed.case.revision,
    operationId: operationId(),
    projectId,
  });
  assert.equal(unknown.case.managedReadiness.status, "UNKNOWN");
  assert.deepEqual(unknown.case.managedReadiness.reasonCodes, [
    "readiness_source_unavailable",
  ]);

  harness.setManagedReadiness(applicationId, {
    reasonCodes: ["payment_required_unsatisfied", "review_not_approved"],
    status: "NOT_READY",
  });
  const notReady = await harness.service.evaluateManagedReadiness({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: unknown.case.revision,
    operationId: operationId(),
    projectId,
  });
  assert.equal(notReady.case.managedReadiness.status, "NOT_READY");
  assert.equal(notReady.case.managedReadiness.submissionState, "not_connected");
  const authority = notReady.case.requirements.find(
    (entry) => entry.code === "managed_authority_verified"
  );
  assert.equal(authority?.status, "missing");

  harness.setManagedReadiness(applicationId, {
    reasonCodes: [],
    status: "READY",
  });
  const ready = await harness.service.evaluateManagedReadiness({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: notReady.case.revision,
    operationId: operationId(),
    projectId,
  });
  // Even a READY M4 observation does not enable an institutional submission.
  assert.equal(ready.case.managedReadiness.status, "READY");
  assert.equal(ready.case.managedReadiness.submissionState, "not_connected");
  assert.equal(
    ready.case.disclosures.includes("managed_submission_not_connected"),
    true
  );
});

test("managed readiness requires a bound application case", async () => {
  const { harness, ownerUserId, projectId } = setup();
  const created = await harness.service.createCase({
    actorUserId: ownerUserId,
    courseTitle: "Bachelor of Design",
    institutionName: "Standalone College",
    operationId: operationId(),
    originKind: "existing_offer",
    projectId,
  });
  const managed = await harness.service.setServiceMode({
    actorUserId: ownerUserId,
    caseId: created.case.caseId,
    expectedRevision: created.case.revision,
    operationId: operationId(),
    projectId,
    serviceMode: "managed_service",
  });
  await expectCode(
    harness.service.evaluateManagedReadiness({
      actorUserId: ownerUserId,
      caseId: created.case.caseId,
      expectedRevision: managed.case.revision,
      operationId: operationId(),
      projectId,
    }),
    "state_conflict"
  );
});

test("offer decisions are forward-only and terminal states stay terminal", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const recorded = await harness.service.recordOutcome({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: (
      await harness.service.get({ actorUserId: ownerUserId, caseId, projectId })
    ).case.revision,
    expiresOn: "2027-01-31",
    kind: "offer",
    operationId: operationId(),
    projectId,
    provenance: "customer_reported",
    receivedOn: "2026-10-01",
  });
  const offer = recorded.case.offer;
  assert.equal(offer?.state, "received");
  assert.equal(offer?.expiryState, "valid");
  assert.equal(recorded.case.journey.offerState, "received");

  const reviewed = await harness.service.transitionOutcome({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: recorded.case.revision,
    kind: "offer",
    operationId: operationId(),
    outcomeId: offer?.outcomeId as string,
    projectId,
    action: "start_review",
  });
  assert.equal(reviewed.case.offer?.state, "under_review");
  assert.equal(reviewed.case.offer?.version, 2);
  assert.equal(reviewed.case.outcomeHistory.length, 2);
  assert.equal(
    reviewed.case.outcomeHistory.filter((e) => e.superseded).length,
    1
  );

  const accepted = await harness.service.transitionOutcome({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: reviewed.case.revision,
    kind: "offer",
    operationId: operationId(),
    outcomeId: reviewed.case.offer?.outcomeId as string,
    projectId,
    action: "accept",
    decisionOn: "2026-11-02",
  });
  assert.equal(accepted.case.offer?.state, "accepted");
  assert.equal(accepted.case.offer?.decisionOn, "2026-11-02");
  assert.equal(accepted.case.journey.offerTerminal, true);
  assert.equal(
    accepted.case.nextStepCodes.includes("await_institutional_response"),
    false
  );

  await expectCode(
    harness.service.transitionOutcome({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: accepted.case.revision,
      kind: "offer",
      operationId: operationId(),
      outcomeId: accepted.case.offer?.outcomeId as string,
      projectId,
      action: "decline",
    }),
    "state_conflict"
  );
});

test("provenance escalation, foreign documents and replayed payloads are rejected", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const revision = (
    await harness.service.get({ actorUserId: ownerUserId, caseId, projectId })
  ).case.revision;
  for (const provenance of ["source_reviewed", "provider_confirmed"] as const) {
    await expectCode(
      harness.service.recordOutcome({
        actorUserId: ownerUserId,
        caseId,
        expectedRevision: revision,
        kind: "offer",
        operationId: operationId(),
        projectId,
        provenance,
      }),
      "authority_unavailable"
    );
  }
  await expectCode(
    harness.service.recordOutcome({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: revision,
      kind: "offer",
      operationId: operationId(),
      projectId,
      provenance: "document_backed_unverified",
    }),
    "evidence_invalid"
  );
  await expectCode(
    harness.service.recordOutcome({
      actorUserId: ownerUserId,
      caseId,
      evidenceReferenceId: randomUUID(),
      expectedRevision: revision,
      kind: "offer",
      operationId: operationId(),
      projectId,
      provenance: "document_backed_unverified",
    }),
    "evidence_invalid"
  );
  const otherProject = randomUUID();
  const foreignDocument = randomUUID();
  harness.store.seedProject(otherProject, {
    ownerUserId: randomUUID(),
    status: "active",
  });
  harness.seedDocument({
    projectId: otherProject,
    referenceId: foreignDocument,
  });
  await expectCode(
    harness.service.recordOutcome({
      actorUserId: ownerUserId,
      caseId,
      evidenceReferenceId: foreignDocument,
      expectedRevision: revision,
      kind: "offer",
      operationId: operationId(),
      projectId,
      provenance: "document_backed_unverified",
    }),
    "evidence_invalid"
  );
});

test("cross-Project, staff and non-member actors are denied", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const otherProject = randomUUID();
  harness.store.seedProject(otherProject, {
    ownerUserId: randomUUID(),
    status: "active",
  });
  await expectCode(
    harness.service.get({
      actorUserId: ownerUserId,
      caseId,
      projectId: otherProject,
    }),
    "project_forbidden"
  );
  const guest = randomUUID();
  harness.store.seedActor(guest, { registeredCustomer: true });
  await expectCode(
    harness.service.get({ actorUserId: guest, caseId, projectId }),
    "project_forbidden"
  );
  await expectCode(
    harness.service.createCase({
      actorUserId: guest,
      courseTitle: "Course",
      institutionName: "School",
      operationId: operationId(),
      originKind: "existing_offer",
      projectId,
    }),
    "project_forbidden"
  );
  const staff = randomUUID();
  harness.store.seedActor(staff, { registeredCustomer: false, staff: true });
  await expectCode(
    harness.service.get({ actorUserId: staff, caseId, projectId }),
    "actor_not_eligible"
  );
  const pending = randomUUID();
  harness.store.seedActor(pending, {
    memberships: { [projectId]: "pending" },
    registeredCustomer: true,
  });
  await expectCode(
    harness.service.get({ actorUserId: pending, caseId, projectId }),
    "project_forbidden"
  );
  // Project membership never opens another customer's creator-private case.
  const member = randomUUID();
  harness.store.seedActor(member, {
    memberships: { [projectId]: "active" },
    registeredCustomer: true,
  });
  await expectCode(
    harness.service.get({ actorUserId: member, caseId, projectId }),
    "case_not_found"
  );
});

test("revoked membership and a concurrently closed Project fail closed", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const member = randomUUID();
  harness.store.seedActor(member, {
    memberships: { [projectId]: "active" },
    registeredCustomer: true,
  });
  await expectCode(
    harness.service.get({ actorUserId: member, caseId, projectId }),
    "case_not_found"
  );
  harness.store.setMembership(projectId, member, "revoked");
  await expectCode(
    harness.service.list({ actorUserId: member, projectId }),
    "project_forbidden"
  );

  // A closure committed after authorization but before the write still fails.
  harness.store.setWriteBarrier(() => {
    harness.store.setProjectStatus(projectId, "closed");
  });
  await expectCode(
    harness.service.prepare({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: (
        await harness.service
          .get({ actorUserId: ownerUserId, caseId, projectId })
          .catch(() => ({ case: { revision: 1 } }))
      ).case.revision,
      operationId: operationId(),
      projectId,
    }),
    "project_closed"
  );
  harness.store.setWriteBarrier(null);

  // Historical reads stay available on a closed Project; writes do not.
  const readable = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  assert.equal(readable.case.caseId, caseId);
  await expectCode(
    harness.service.prepare({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: readable.case.revision,
      operationId: operationId(),
      projectId,
    }),
    "project_closed"
  );
  assert.equal(harness.store.state().preparations.length, 0);
});

test("operation replay is exact, and a changed payload is an idempotency conflict", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const revision = (
    await harness.service.get({ actorUserId: ownerUserId, caseId, projectId })
  ).case.revision;
  const op = operationId();
  const first = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: revision,
    operationId: op,
    projectId,
  });
  const replay = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: revision,
    operationId: op,
    projectId,
  });
  assert.equal(first.preparationVersion, 1);
  assert.equal(replay.replayed, true);
  assert.equal(replay.preparationVersion, 1);
  assert.equal(harness.store.state().preparations.length, 1);
  await expectCode(
    harness.service.prepare({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: revision,
      operationId: op,
      projectId,
      locale: "en",
    }),
    "idempotency_conflict"
  );
});

test("optimistic concurrency admits exactly one writer per revision", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const revision = (
    await harness.service.get({ actorUserId: ownerUserId, caseId, projectId })
  ).case.revision;
  const results = await Promise.allSettled([
    harness.service.prepare({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: revision,
      operationId: operationId(),
      projectId,
    }),
    harness.service.prepare({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: revision,
      operationId: operationId(),
      projectId,
    }),
  ]);
  const fulfilled = results.filter((entry) => entry.status === "fulfilled");
  const rejected = results.filter((entry) => entry.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(
    (rejected[0] as PromiseRejectedResult).reason.code,
    "revision_conflict"
  );
  assert.equal(harness.store.state().preparations.length, 1);
});

test("one case per school application and archived applications are refused", async () => {
  const { harness, ownerUserId, projectId, applicationId, caseId } =
    await boundCase();
  assert.ok(caseId);
  await expectCode(
    harness.service.createCase({
      actorUserId: ownerUserId,
      applicationId,
      operationId: operationId(),
      originKind: "school_application",
      projectId,
    }),
    "state_conflict"
  );

  const archivedId = randomUUID();
  harness.seedApplication({
    applicationId: archivedId,
    applicationStatus: "archived",
    ownerUserId,
    projectId,
  });
  await expectCode(
    harness.service.createCase({
      actorUserId: ownerUserId,
      applicationId: archivedId,
      operationId: operationId(),
      originKind: "school_application",
      projectId,
    }),
    "application_archived"
  );

  // An application archived after the case exists blocks further preparation.
  harness.updateApplication(applicationId, {
    applicationStatus: "archived",
    archived: true,
  });
  const detail = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  await expectCode(
    harness.service.prepare({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: detail.case.revision,
      operationId: operationId(),
      projectId,
    }),
    "case_archived"
  );
});

test("every mutation is audited with an append-only operation record", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const detail = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  const prepared = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: detail.case.revision,
    operationId: operationId(),
    projectId,
  });
  await harness.service.confirmPreparation({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: prepared.case.revision,
    operationId: operationId(),
    preparationId: prepared.case.preparation?.preparationId as string,
    projectId,
  });
  const after = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  const eventTypes = after.case.events.map((entry) => entry.eventType);
  assert.deepEqual(eventTypes, [
    "school_admission_case_created",
    "school_admission_preparation_recorded",
    "school_admission_preparation_confirmed",
  ]);
  assert.deepEqual(
    after.case.events.map((entry) => entry.caseRevision),
    [1, 2, 3]
  );
  assert.equal(harness.store.state().operations.length, 3);
  for (const operation of harness.store.state().operations) {
    assert.match(operation.requestSha256, /^[0-9a-f]{64}$/u);
  }
});

test("a standalone case prepares without an application package", async () => {
  const { harness, ownerUserId, projectId } = setup();
  const created = await harness.service.createCase({
    actorUserId: ownerUserId,
    courseTitle: "Certificate III in Hospitality",
    institutionName: "Standalone Institute",
    operationId: operationId(),
    originKind: "existing_offer",
    projectId,
  });
  const prepared = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId: created.case.caseId,
    expectedRevision: created.case.revision,
    operationId: operationId(),
    projectId,
  });
  assert.equal(
    prepared.case.requirements.find(
      (entry) => entry.code === "preparation_package_usable"
    )?.status,
    "not_applicable"
  );
  assert.equal(prepared.case.preparation?.sections.length, 7);
  assert.equal(prepared.case.application, null);
  assert.equal(prepared.case.preparationState, "in_preparation");
  assert.equal(
    prepared.case.nextStepCodes.includes("record_offer_or_exception"),
    true
  );
});

test("reconfirmation: v1 → source change → v2 stays confirmable and auditable", async () => {
  const { harness, ownerUserId, projectId, caseId, applicationId } =
    await boundCase();
  const base = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  const v1 = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: base.case.revision,
    operationId: operationId(),
    projectId,
  });
  const confirmedV1 = await harness.service.confirmPreparation({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: v1.case.revision,
    operationId: operationId(),
    preparationId: v1.case.preparation?.preparationId as string,
    projectId,
  });
  assert.equal(confirmedV1.case.preparationState, "customer_confirmed");

  // An authorized source change makes v1 stale and forces a new version.
  harness.updateApplication(applicationId, { revision: 7 });
  const stale = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  assert.equal(stale.case.preparationStale, true);
  // The stale version cannot be confirmed again.
  await expectCode(
    harness.service.confirmPreparation({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: stale.case.revision,
      operationId: operationId(),
      preparationId: stale.case.preparation?.preparationId as string,
      projectId,
    }),
    "state_conflict"
  );

  const v2 = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: stale.case.revision,
    operationId: operationId(),
    projectId,
  });
  assert.equal(v2.preparationVersion, 2);
  // A new unconfirmed version correctly reads as unconfirmed.
  assert.equal(
    v2.case.requirements.find(
      (entry) => entry.code === "customer_confirmation_recorded"
    )?.status,
    "missing"
  );
  const confirmedV2 = await harness.service.confirmPreparation({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: v2.case.revision,
    operationId: operationId(),
    preparationId: v2.case.preparation?.preparationId as string,
    projectId,
  });
  assert.equal(confirmedV2.case.preparationState, "customer_confirmed");
  assert.equal(confirmedV2.case.preparation?.version, 2);
  assert.equal(confirmedV2.case.preparation?.confirmedAt !== null, true);
  // Both confirmations remain in the audit history; v1 is never re-currented.
  assert.deepEqual(
    confirmedV2.case.preparationHistory.map((entry) => entry.version),
    [2, 1]
  );
  assert.equal(
    confirmedV2.case.preparationHistory.filter(
      (entry) => entry.confirmedAt !== null
    ).length,
    2
  );
  const preparations = harness.store.state().preparations;
  assert.equal(
    preparations.filter((entry) => entry.confirmedAt !== null).length,
    2
  );
  // An older (already superseded) version can never be confirmed afterwards.
  await expectCode(
    harness.service.confirmPreparation({
      actorUserId: ownerUserId,
      caseId,
      expectedRevision: confirmedV2.case.revision,
      operationId: operationId(),
      preparationId: confirmedV1.case.preparation?.preparationId as string,
      projectId,
    }),
    "state_conflict"
  );
});

test("exact replays resolve after the preconditions they satisfied are gone", async () => {
  const { harness, ownerUserId, projectId } = setup();
  const applicationId = randomUUID();
  harness.seedApplication({
    applicationId,
    currentPackage: {
      contentSha256: SHA_C,
      inputsSha256: SHA_D,
      packageId: randomUUID(),
      staleReasonCodes: [],
      targetBindingSha256: SHA_A,
      usable: true,
      version: 1,
    },
    institutionId: "inst-1",
    ownerUserId,
    projectId,
    references: references(),
    revision: 4,
  });

  // 1. create: replay must still work after the application is archived.
  const createOp = operationId();
  const created = await harness.service.createCase({
    actorUserId: ownerUserId,
    applicationId,
    operationId: createOp,
    originKind: "school_application",
    projectId,
  });
  const caseId = created.case.caseId;
  harness.updateApplication(applicationId, {
    applicationStatus: "archived",
    archived: true,
  });
  const replayedCreate = await harness.service.createCase({
    actorUserId: ownerUserId,
    applicationId,
    operationId: createOp,
    originKind: "school_application",
    projectId,
  });
  assert.equal(replayedCreate.replayed, true);
  assert.equal(replayedCreate.case.caseId, caseId);
  assert.equal(harness.store.state().cases.length, 1);

  // 2. confirmation: replay after the case revision has advanced.
  harness.updateApplication(applicationId, {
    applicationStatus: "package_prepared",
    archived: false,
  });
  const detail = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  const prepared = await harness.service.prepare({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: detail.case.revision,
    operationId: operationId(),
    projectId,
  });
  const confirmOp = operationId();
  const confirmArgs = {
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: prepared.case.revision,
    operationId: confirmOp,
    preparationId: prepared.case.preparation?.preparationId as string,
    projectId,
  };
  const confirmed = await harness.service.confirmPreparation(confirmArgs);
  const replayedConfirm = await harness.service.confirmPreparation(confirmArgs);
  assert.equal(replayedConfirm.replayed, true);
  assert.equal(replayedConfirm.case.revision, confirmed.case.revision);
  assert.equal(harness.store.state().preparations.length, 1);
});

test("transition and verification replays never re-apply or re-ask", async () => {
  const { harness, ownerUserId, projectId, caseId } = await boundCase();
  const detail = await harness.service.get({
    actorUserId: ownerUserId,
    caseId,
    projectId,
  });
  const recorded = await harness.service.recordOutcome({
    actorUserId: ownerUserId,
    caseId,
    expectedRevision: detail.case.revision,
    kind: "offer",
    operationId: operationId(),
    projectId,
    provenance: "customer_reported",
    receivedOn: "2026-10-01",
  });
  const transitionOp = operationId();
  const transitionArgs = {
    actorUserId: ownerUserId,
    action: "start_review" as const,
    caseId,
    expectedRevision: recorded.case.revision,
    kind: "offer" as const,
    operationId: transitionOp,
    outcomeId: recorded.case.offer?.outcomeId as string,
    projectId,
  };
  const first = await harness.service.transitionOutcome(transitionArgs);
  assert.equal(first.case.offer?.state, "under_review");
  // The original outcome is now superseded; an exact retry still resolves.
  const replay = await harness.service.transitionOutcome(transitionArgs);
  assert.equal(replay.replayed, true);
  assert.equal(replay.case.offer?.version, 2);
  assert.equal(harness.store.state().outcomes.length, 2);
  const replayedRow = harness.store
    .state()
    .outcomes.find((entry) => entry.id === replay.outcomeId);
  assert.equal(replayedRow?.state, "under_review");

  // Exception verification: the replay must not need a second authority answer.
  harness.setVerification({
    authorityReference: "authority:replay",
    status: "verified",
  });
  const claimed = await harness.service.claimException({
    actorUserId: ownerUserId,
    caseId,
    description: "Customer states an exception applies.",
    expectedRevision: replay.case.revision,
    operationId: operationId(),
    projectId,
  });
  const verifyArgs = {
    actorUserId: ownerUserId,
    caseId,
    exceptionId: claimed.case.exception?.exceptionId as string,
    expectedRevision: claimed.case.revision,
    operationId: operationId(),
    projectId,
  };
  const verified =
    await harness.service.requestExceptionVerification(verifyArgs);
  assert.equal(verified.case.exception?.state, "verified");
  // Authority is now unavailable; only the recorded replay can still answer.
  harness.setVerification({ status: "unavailable" });
  const verifyReplay =
    await harness.service.requestExceptionVerification(verifyArgs);
  assert.equal(verifyReplay.replayed, true);
  assert.equal(verifyReplay.exceptionId, verified.exceptionId);
  assert.equal(harness.store.state().exceptions.length, 2);
});

test("list exposes only the actor's applications and selectable documents", async () => {
  const { harness, ownerUserId, projectId } = setup();
  const mine = [randomUUID(), randomUUID(), randomUUID()];
  for (const [index, applicationId] of mine.entries()) {
    harness.seedApplication({
      applicationId,
      institutionName: `Own School ${index + 1}`,
      ownerUserId,
      projectId,
    });
  }
  const otherMember = randomUUID();
  harness.store.seedActor(otherMember, {
    memberships: { [projectId]: "active" },
    registeredCustomer: true,
  });
  const foreign = randomUUID();
  harness.seedApplication({
    applicationId: foreign,
    institutionName: "Another Member School",
    ownerUserId: otherMember,
    projectId,
  });
  const documentId = randomUUID();
  harness.seedDocument({
    label: "Document 1 · application/pdf · 1234abcd",
    projectId,
    referenceId: documentId,
    version: 2,
  });

  const listed = await harness.service.list({
    actorUserId: ownerUserId,
    projectId,
  });
  assert.deepEqual(
    listed.applications.map((entry) => entry.applicationId).sort(),
    [...mine].sort()
  );
  assert.equal(
    listed.applications.some((entry) => entry.applicationId === foreign),
    false
  );
  assert.equal(
    listed.applications.every((entry) => entry.hasCase === false),
    true
  );
  assert.deepEqual(listed.documents, [
    {
      label: "Document 1 · application/pdf · 1234abcd",
      referenceId: documentId,
      version: 2,
    },
  ]);
  assert.equal(listed.documentsUnavailable, false);

  for (const applicationId of mine) {
    const created = await harness.service.createCase({
      actorUserId: ownerUserId,
      applicationId,
      operationId: operationId(),
      originKind: "school_application",
      projectId,
    });
    assert.equal(created.case.applicationId, applicationId);
  }
  const after = await harness.service.list({
    actorUserId: ownerUserId,
    projectId,
  });
  assert.equal(after.cases.length, 3);
  assert.equal(
    after.applications.every((entry) => entry.hasCase === true),
    true
  );

  const otherListed = await harness.service.list({
    actorUserId: otherMember,
    projectId,
  });
  assert.deepEqual(
    otherListed.applications.map((entry) => entry.applicationId),
    [foreign]
  );
  assert.equal(otherListed.cases.length, 0);
});

test("a selected document backs a CoE without becoming verified", async () => {
  const { harness, ownerUserId, projectId } = setup();
  const documentId = randomUUID();
  harness.seedDocument({
    label: "Document 1 · application/pdf · abcd1234",
    projectId,
    referenceId: documentId,
    version: 3,
  });
  const created = await harness.service.createCase({
    actorUserId: ownerUserId,
    courseTitle: "Master of Teaching",
    institutionName: "Document College",
    operationId: operationId(),
    originKind: "existing_coe",
    projectId,
  });
  const obtained = await harness.service.recordOutcome({
    actorUserId: ownerUserId,
    caseId: created.case.caseId,
    evidenceReferenceId: documentId,
    expectedRevision: created.case.revision,
    kind: "coe",
    operationId: operationId(),
    projectId,
    provenance: "document_backed_unverified",
  });
  assert.equal(obtained.case.coe?.evidenceAttached, true);
  assert.equal(obtained.case.coe?.independentlyVerified, false);
  assert.equal(
    obtained.case.disclosures.includes("document_not_authenticated"),
    true
  );
  assert.equal(
    obtained.case.disclosures.includes(
      "coe_does_not_establish_student_500_eligibility"
    ),
    true
  );
});
