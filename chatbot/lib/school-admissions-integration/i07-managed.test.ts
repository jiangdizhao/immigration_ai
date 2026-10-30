import assert from "node:assert/strict";
import { test } from "node:test";
import { readyApplication } from "./fixtures";
import { createM5IntegrationHarness } from "./harness";

/**
 * I-07 — Managed Service fails closed.
 *
 * The real M4 readiness evaluator is composed with deny-all authority ports, so
 * missing professional credentials, engagement, payment, disclosure, exact-review
 * or provider authority can only ever produce NOT_READY or UNKNOWN.
 */
test("I-07 managed readiness never returns READY without M4 authorities", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });

  const managed = await harness.admissions.setServiceMode({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    operationId: harness.operationId("mode"),
    projectId: harness.projectId,
    serviceMode: "managed_service",
  });
  assert.equal(managed.case.serviceMode, "managed_service");

  const evaluated = await harness.admissions.evaluateManagedReadiness({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: managed.case.revision,
    operationId: harness.operationId("readiness"),
    projectId: harness.projectId,
  });
  const readiness = evaluated.case.managedReadiness;
  assert.notEqual(readiness.status, "READY", "no authority is present offline");
  assert.ok(["NOT_READY", "UNKNOWN"].includes(readiness.status));
  assert.equal(readiness.submissionState, "not_connected");
  assert.equal(
    readiness.revalidationToken === null ||
      typeof readiness.revalidationToken === "string",
    true
  );
  // The M4 evaluator names the missing authorities instead of guessing.
  assert.ok(readiness.reasonCodes.length > 0);
  assert.equal(
    harness.admissionStore
      .state()
      .cases.filter((entry) => entry.managedReadinessStatus === "READY").length,
    0
  );

  // Switching back to self-service cannot upgrade readiness either.
  const back = await harness.admissions.setServiceMode({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: evaluated.case.revision,
    operationId: harness.operationId("mode"),
    projectId: harness.projectId,
    serviceMode: "self_service",
  });
  assert.equal(back.case.serviceMode, "self_service");
  assert.notEqual(back.case.managedReadiness.status, "READY");
  assert.equal(back.case.managedReadiness.submissionState, "not_connected");
});

test("I-07 a managed case still cannot submit or imply a professional approval", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  const managed = await harness.admissions.setServiceMode({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    operationId: harness.operationId("mode"),
    projectId: harness.projectId,
    serviceMode: "managed_service",
  });
  const evaluated = await harness.admissions.evaluateManagedReadiness({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: managed.case.revision,
    operationId: harness.operationId("readiness"),
    projectId: harness.projectId,
  });

  // The managed checklist asks for the real M4 authorities and does not claim
  // they exist.
  const requirement = (code: string) =>
    evaluated.case.requirements.find((entry) => entry.code === code);
  assert.notEqual(
    requirement("managed_engagement_current")?.status,
    "satisfied",
    "engagement authority cannot be satisfied offline"
  );
  assert.equal(
    requirement("managed_engagement_current")?.appliesTo,
    "managed_service"
  );
  assert.notEqual(
    requirement("managed_authority_verified")?.status,
    "satisfied",
    "professional authority cannot be satisfied offline"
  );
  assert.equal(
    evaluated.case.managedReadiness.disclosures.includes(
      "professional_authority_unavailable"
    ) || evaluated.case.managedReadiness.reasonCodes.length > 0,
    true
  );
  // No external submission capability exists in any mode.
  assert.equal(
    evaluated.case.managedReadiness.submissionState,
    "not_connected"
  );
  assert.equal(
    harness.admissionStore
      .state()
      .externalActions.filter(
        (entry) => entry.provenance !== "customer_reported"
      ).length,
    0
  );
});
