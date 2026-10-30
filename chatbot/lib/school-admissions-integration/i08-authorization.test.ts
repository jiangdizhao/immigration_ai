import assert from "node:assert/strict";
import { test } from "node:test";
import { readyApplication } from "./fixtures";
import { createM5IntegrationHarness } from "./harness";

/**
 * I-08 — ownership and authorization.
 *
 * Read isolation and write protection are proven across both modules, and a
 * refused mutation must leave no operation, event or state change behind.
 */
function noResidue(harness: ReturnType<typeof createM5IntegrationHarness>) {
  return {
    admissionOperations: harness.admissionStore.state().operations.length,
    admissionEvents: harness.admissionStore.state().events.length,
    admissions: harness.admissionStore.state().cases.length,
    applicationOperations: harness.applicationStore.state().operations.length,
    applicationEvents: harness.applicationStore.state().events.length,
    applications: harness.applicationStore.state().applications.length,
  };
}

test("I-08 another member, stranger, staff and guest are all refused", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);

  // An active member may create their own application, but never sees the
  // creator's application or case: privacy is per-creator, not per-Project.
  const memberCreated = await harness.applications.create({
    actorUserId: harness.memberUserId,
    courseId: null,
    courseTitle: "Member Course",
    institutionId: null,
    institutionName: "Member College",
    intakeId: null,
    intakeLabel: null,
    operationId: harness.operationId("member-app"),
    projectId: harness.projectId,
  });
  assert.equal(memberCreated.application.status, "draft");
  const memberView = await harness.applications.list({
    actorUserId: harness.memberUserId,
    projectId: harness.projectId,
  });
  assert.equal(memberView.length, 1);
  assert.equal(
    memberView[0]?.applicationId,
    memberCreated.application.applicationId
  );
  assert.notEqual(
    memberView[0]?.applicationId,
    ready.application.applicationId
  );

  // Snapshot after the member's own legitimate write, so the loop can prove that
  // refused mutations add nothing at all.
  const before = noResidue(harness);

  for (const actorUserId of [
    harness.strangerUserId,
    harness.staffUserId,
    harness.guestUserId,
  ]) {
    // Non-members are refused outright: no empty-looking "success" response can
    // be mistaken for an authorised read.
    await assert.rejects(
      harness.applications.list({ actorUserId, projectId: harness.projectId }),
      (error: unknown) =>
        ["project_forbidden", "actor_not_eligible"].includes(
          (error as { code?: string }).code ?? ""
        )
    );
    await assert.rejects(
      harness.admissions.list({ actorUserId, projectId: harness.projectId }),
      (error: unknown) =>
        [
          "project_forbidden",
          "actor_not_eligible",
          "actor_ineligible",
        ].includes((error as { code?: string }).code ?? "")
    );
    // Writes are refused and leave nothing behind.
    await assert.rejects(
      harness.applications.create({
        actorUserId,
        courseId: null,
        courseTitle: "Injected Course",
        institutionId: null,
        institutionName: "Injected College",
        intakeId: null,
        intakeLabel: null,
        operationId: harness.operationId("intruder-app"),
        projectId: harness.projectId,
      })
    );
    await assert.rejects(
      harness.admissions.createCase({
        actorUserId,
        applicationId: ready.application.applicationId,
        operationId: harness.operationId("intruder-case"),
        originKind: "school_application",
        projectId: harness.projectId,
      })
    );
  }
  assert.deepEqual(noResidue(harness), before);
});

test("I-08 revoked membership and a closed Project fail closed", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });

  // A member with revoked membership loses access to both modules.
  harness.applicationStore.setMembership(
    harness.projectId,
    harness.memberUserId,
    "revoked"
  );
  harness.admissionStore.setMembership(
    harness.projectId,
    harness.memberUserId,
    "revoked"
  );
  await assert.rejects(
    harness.applications.list({
      actorUserId: harness.memberUserId,
      projectId: harness.projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "project_forbidden"
  );
  await assert.rejects(
    harness.admissions.prepare({
      actorUserId: harness.memberUserId,
      caseId: opened.case.caseId,
      expectedRevision: opened.case.revision,
      operationId: harness.operationId("member-prep"),
      projectId: harness.projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "project_forbidden"
  );

  // A closed Project refuses further mutations in both modules.
  const before = noResidue(harness);
  harness.applicationStore.setProjectStatus(harness.projectId, "closed");
  harness.admissionStore.setProjectStatus(harness.projectId, "closed");
  await assert.rejects(
    harness.applications.archive({
      actorUserId: harness.ownerUserId,
      applicationId: ready.application.applicationId,
      expectedRevision: ready.package.revision,
      operationId: harness.operationId("close-archive"),
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "project_closed"
  );
  await assert.rejects(
    harness.admissions.prepare({
      actorUserId: harness.ownerUserId,
      caseId: opened.case.caseId,
      expectedRevision: opened.case.revision,
      operationId: harness.operationId("close-prep"),
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "project_closed"
  );
  assert.deepEqual(noResidue(harness), before);
});

test("I-08 cross-Project access is refused without disclosure", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });

  // The owner cannot reach a case through another Project scope.
  await assert.rejects(
    harness.admissions.get({
      actorUserId: harness.ownerUserId,
      caseId: opened.case.caseId,
      projectId: harness.otherProjectId,
    })
  );
  await assert.rejects(
    harness.applications.get({
      actorUserId: harness.ownerUserId,
      applicationId: ready.application.applicationId,
      projectId: harness.otherProjectId,
    })
  );
  // A stranger's Project has no visibility into these records at all.
  assert.deepEqual(
    await harness.admissions.list({
      actorUserId: harness.strangerUserId,
      projectId: harness.otherProjectId,
    }),
    { applications: [], cases: [], documents: [], documentsUnavailable: false }
  );
});
