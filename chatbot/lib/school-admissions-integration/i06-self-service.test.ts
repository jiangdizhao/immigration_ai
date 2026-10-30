import assert from "node:assert/strict";
import { test } from "node:test";
import { readyApplication } from "./fixtures";
import { createM5IntegrationHarness } from "./harness";

/**
 * I-06 — Self-Service path.
 *
 * The customer's own report is honest: mandatory acknowledgement, customer
 * provenance, no institution receipt and no implied professional approval.
 */
test("I-06 self-service external action needs acknowledgement and stays customer-reported", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  assert.equal(opened.case.serviceMode, "self_service");

  // Without acknowledgement nothing is recorded. The accepted contract declares
  // `acknowledged: true` as a literal, so this negative stimulus needs one narrow,
  // explicit boundary cast — the field name is the real one.
  const unacknowledged = {
    acknowledged: false as unknown as true,
    actionKind: "school_portal_submission" as const,
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    operationId: harness.operationId("external"),
    performedOn: "2026-10-26",
    projectId: harness.projectId,
  };
  const beforeRefusal = {
    externalActions: harness.admissionStore.state().externalActions.length,
    operations: harness.admissionStore.state().operations.length,
    events: harness.admissionStore.state().events.length,
    revision: (
      await harness.admissions.get({
        actorUserId: harness.ownerUserId,
        caseId: opened.case.caseId,
        projectId: harness.projectId,
      })
    ).case.revision,
  };
  await assert.rejects(
    harness.admissions.recordExternalAction(unacknowledged),
    (error: unknown) => (error as { code?: string }).code === "invalid_request",
    "an unacknowledged external action must be refused as invalid_request"
  );
  assert.equal(harness.admissionStore.state().externalActions.length, 0);
  assert.equal(
    harness.admissionStore.state().operations.length,
    beforeRefusal.operations,
    "a refused action commits no operation record"
  );
  assert.equal(
    harness.admissionStore.state().events.length,
    beforeRefusal.events,
    "a refused action commits no audit event"
  );
  assert.equal(
    (
      await harness.admissions.get({
        actorUserId: harness.ownerUserId,
        caseId: opened.case.caseId,
        projectId: harness.projectId,
      })
    ).case.revision,
    beforeRefusal.revision,
    "a refused action does not advance the case revision"
  );

  const recorded = await harness.admissions.recordExternalAction({
    actorUserId: harness.ownerUserId,
    acknowledged: true,
    actionKind: "school_portal_submission",
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    note: "Submitted through the school portal.",
    operationId: harness.operationId("external"),
    performedOn: "2026-10-26",
    projectId: harness.projectId,
  });
  const action = recorded.case.externalActions.at(0);
  assert.ok(action);
  assert.equal(action.provenance, "customer_reported");
  assert.equal(action.verified, false);
  assert.equal(action.performedOn, "2026-10-26");
  assert.equal(action.recordedAt, "2026-11-01T00:00:00.000Z");
  // The case never claims a receipt, submission or professional approval.
  assert.equal(
    recorded.case.disclosures.includes("not_a_school_submission"),
    true
  );
  assert.equal(
    recorded.case.disclosures.includes("no_institutional_decision"),
    true
  );
  assert.equal(recorded.case.managedReadiness.submissionState, "not_connected");
  assert.equal(
    recorded.case.disclosures.some((entry) =>
      String(entry).includes("professionally_reviewed")
    ),
    false
  );
});

test("I-06 self-service confirmation records the customer decision at an exact version", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  const prepared = await harness.admissions.prepare({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    operationId: harness.operationId("prep"),
    projectId: harness.projectId,
  });
  assert.equal(prepared.case.preparation?.assistKind, "disabled");
  assert.equal(prepared.case.preparation?.provisional, true);
  // Confirming a different preparation id fails: confirmation is exact-version.
  await assert.rejects(
    harness.admissions.confirmPreparation({
      actorUserId: harness.ownerUserId,
      caseId: opened.case.caseId,
      expectedRevision: prepared.case.revision,
      operationId: harness.operationId("confirm"),
      preparationId: "33333333-3333-4333-8333-333333333399",
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  const confirmed = await harness.admissions.confirmPreparation({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: prepared.case.revision,
    operationId: harness.operationId("confirm"),
    preparationId: prepared.case.preparation?.preparationId as string,
    projectId: harness.projectId,
  });
  assert.equal(confirmed.case.preparationState, "customer_confirmed");
  assert.equal(
    confirmed.case.preparation?.confirmedAt,
    "2026-11-01T00:00:00.000Z"
  );
  assert.equal(
    confirmed.case.requirements.find(
      (entry) => entry.code === "customer_confirmation_recorded"
    )?.status,
    "satisfied"
  );
  // Confirmation is a customer act, not a professional or institutional one.
  assert.equal(confirmed.case.serviceMode, "self_service");
  assert.equal(confirmed.case.managedReadiness.status, "NOT_EVALUATED");
  assert.equal(
    confirmed.case.managedReadiness.submissionState,
    "not_connected"
  );
});
