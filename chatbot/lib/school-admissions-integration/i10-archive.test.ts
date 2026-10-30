import assert from "node:assert/strict";
import { test } from "node:test";
import { readyApplication } from "./fixtures";
import { createM5IntegrationHarness } from "./harness";

/**
 * I-10 — archive and historical integrity.
 *
 * Archiving stops operational use while every historical package, reference and
 * case record stays auditable.
 */
test("I-10 an archived application keeps history but loses operational usability", async () => {
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
  await harness.admissions.confirmPreparation({
    actorUserId: harness.ownerUserId,
    caseId: prepared.case.caseId,
    expectedRevision: prepared.case.revision,
    operationId: harness.operationId("confirm"),
    preparationId: prepared.case.preparation?.preparationId as string,
    projectId: harness.projectId,
  });

  const before = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    projectId: harness.projectId,
  });
  const archived = await harness.applications.archive({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    expectedRevision: before.revision,
    operationId: harness.operationId("app-archive"),
    projectId: harness.projectId,
  });
  assert.equal(archived.application.status, "archived");
  assert.notEqual(archived.application.archivedAt, null);
  // History is retained: the package is still listed, never deleted.
  assert.equal(archived.application.packages.length, 1);
  assert.equal(
    archived.application.packages[0]?.packageId,
    ready.package.packageId
  );
  assert.ok(
    archived.application.staleReasonCodes.includes("application_archived")
  );
  // Operational usability is gone.
  assert.notEqual(archived.application.currentPackage?.usable, true);

  // M5.2 reflects the archived state and refuses new preparation work.
  const caseArchived = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    projectId: harness.projectId,
  });
  assert.equal(caseArchived.case.application?.archived, true);
  assert.equal(caseArchived.case.application?.status, "archived");
  assert.equal(caseArchived.case.preparationStale, true);
  assert.ok(caseArchived.case.staleReasonCodes.includes("case_archived"));
  // The confirmed preparation remains auditable.
  assert.equal(caseArchived.case.preparationState, "customer_confirmed");
  assert.equal(caseArchived.case.preparationHistory.length, 1);
  assert.equal(
    caseArchived.case.preparationHistory.at(0)?.confirmedAt !== null,
    true
  );
  await assert.rejects(
    harness.admissions.prepare({
      actorUserId: harness.ownerUserId,
      caseId: caseArchived.case.caseId,
      expectedRevision: caseArchived.case.revision,
      operationId: harness.operationId("prep"),
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "case_archived"
  );
  // An archived case can never be promoted to managed readiness.
  await assert.rejects(
    harness.admissions.evaluateManagedReadiness({
      actorUserId: harness.ownerUserId,
      caseId: caseArchived.case.caseId,
      expectedRevision: caseArchived.case.revision,
      operationId: harness.operationId("readiness"),
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  assert.equal(
    harness.admissionStore
      .state()
      .cases.filter((entry) => entry.managedReadinessStatus === "READY").length,
    0
  );
  // The archived application is still listed for the customer, marked archived
  // and still bound to its case, so the UI can report the state honestly.
  const listed = await harness.admissions.list({
    actorUserId: harness.ownerUserId,
    projectId: harness.projectId,
  });
  const option = listed.applications.find(
    (entry) => entry.applicationId === ready.application.applicationId
  );
  assert.equal(option?.archived, true);
  assert.equal(option?.hasCase, true);
  assert.equal(listed.cases.length, 1);
  assert.equal(listed.cases[0]?.preparationStale, true);
});
