import assert from "node:assert/strict";
import { test } from "node:test";
import { createM5IntegrationHarness } from "./harness";

/**
 * I-05 — existing Offer / CoE / claimed-exception entry routes.
 *
 * These routes must never fabricate an M5.1 application, and unverified evidence
 * or an unknown exception must never be promoted to a verified outcome.
 */
test("I-05 existing Offer and CoE cases create no fictitious application", async () => {
  const harness = createM5IntegrationHarness();

  const offerCase = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    courseTitle: "Bachelor of Nursing",
    institutionName: "Northbridge University",
    operationId: harness.operationId("case-create"),
    originKind: "existing_offer",
    projectId: harness.projectId,
  });
  const coeCase = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    courseTitle: "Diploma of Business",
    institutionName: "Riverside Institute",
    operationId: harness.operationId("case-create"),
    originKind: "existing_coe",
    projectId: harness.projectId,
  });

  // No M5.1 application is invented for either route.
  assert.equal(offerCase.case.applicationId, null);
  assert.equal(coeCase.case.applicationId, null);
  assert.deepEqual(
    await harness.applications.list({
      actorUserId: harness.ownerUserId,
      projectId: harness.projectId,
    }),
    []
  );
  assert.equal(harness.applicationStore.state().applications.length, 0);

  // A customer-reported Offer stays customer-reported and is never verified.
  const offer = await harness.admissions.recordOutcome({
    actorUserId: harness.ownerUserId,
    caseId: offerCase.case.caseId,
    expectedRevision: offerCase.case.revision,
    kind: "offer",
    operationId: harness.operationId("outcome"),
    projectId: harness.projectId,
    provenance: "customer_reported",
    receivedOn: "2026-10-20",
  });
  assert.equal(offer.case.offer?.provenance, "customer_reported");
  assert.equal(offer.case.offer?.state, "received");
  assert.equal(
    offer.case.disclosures.includes("no_verified_offer_or_coe"),
    true
  );

  // A claimed CoE stays claimed, is not verified and grants no visa status.
  const coe = await harness.admissions.recordOutcome({
    actorUserId: harness.ownerUserId,
    caseId: coeCase.case.caseId,
    expectedRevision: coeCase.case.revision,
    kind: "coe",
    operationId: harness.operationId("outcome"),
    projectId: harness.projectId,
    provenance: "customer_reported",
  });
  assert.equal(coe.case.coe?.state, "claimed");
  assert.equal(coe.case.coe?.provenance, "customer_reported");
  assert.equal(coe.case.coe?.independentlyVerified, false);
  assert.equal(coe.case.journey.student500Eligibility, "not_determined");
  assert.equal(
    coe.case.disclosures.includes(
      "coe_does_not_establish_student_500_eligibility"
    ),
    true
  );
});

test("I-05 a claimed exception is never promoted to verified eligibility", async () => {
  const harness = createM5IntegrationHarness();
  const exceptionCase = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    courseTitle: "Bachelor of Nursing",
    institutionName: "Northbridge University",
    operationId: harness.operationId("case-create"),
    originKind: "claimed_exception",
    projectId: harness.projectId,
  });
  assert.equal(exceptionCase.case.applicationId, null);

  const claimed = await harness.admissions.claimException({
    actorUserId: harness.ownerUserId,
    caseId: exceptionCase.case.caseId,
    description: "The school confirmed an English requirement waiver.",
    expectedRevision: exceptionCase.case.revision,
    operationId: harness.operationId("exception"),
    projectId: harness.projectId,
  });
  assert.equal(claimed.case.exception?.state, "claimed");
  assert.equal(claimed.case.exception?.authorityReference, null);
  assert.equal(claimed.case.exception?.decidedAt, null);

  // Production verification authority is unavailable: the claim stays claimed.
  await assert.rejects(
    harness.admissions.requestExceptionVerification({
      actorUserId: harness.ownerUserId,
      caseId: claimed.case.caseId,
      exceptionId: claimed.case.exception?.exceptionId as string,
      expectedRevision: claimed.case.revision,
      operationId: harness.operationId("exception-verify"),
      projectId: harness.projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "authority_unavailable"
  );
  const after = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: claimed.case.caseId,
    projectId: harness.projectId,
  });
  assert.equal(after.case.exception?.state, "claimed");
  assert.equal(after.case.exception?.authorityReference, null);
  assert.equal(
    harness.admissionStore
      .state()
      .exceptions.filter((entry) => entry.state === "verified").length,
    0
  );
  // The case still discloses the missing institutional decision.
  assert.equal(
    after.case.disclosures.includes("no_institutional_decision"),
    true
  );
});
