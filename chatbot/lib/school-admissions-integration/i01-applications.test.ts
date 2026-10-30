import assert from "node:assert/strict";
import { test } from "node:test";
import { readyApplication } from "./fixtures";
import { createM5IntegrationHarness, M3_INSTITUTIONS } from "./harness";

/**
 * I-01 — three parallel school applications in one Project.
 *
 * Every assertion below is produced by the accepted M5.1/M5.2 services; the
 * M5.2 case list is resolved from the real M5.1 application service, not from a
 * canned fixture.
 */
test("I-01 three applications in one Project keep independent cases and identities", async () => {
  const harness = createM5IntegrationHarness();

  const nursing = await readyApplication(harness, {
    institutionKey: "northbridge",
  });
  const dataScience = await readyApplication(harness, {
    institutionKey: "northbridgeDataScience",
  });
  const business = await readyApplication(harness, {
    institutionKey: "riverside",
  });

  const ids = new Set([
    nursing.application.applicationId,
    dataScience.application.applicationId,
    business.application.applicationId,
  ]);
  assert.equal(ids.size, 3, "three distinct applications are required");

  // Two applications at the same institution stay independent by course/intake.
  const nursingView = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: nursing.application.applicationId,
    projectId: harness.projectId,
  });
  const dataView = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: dataScience.application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(
    nursingView.institution.catalogId,
    dataView.institution.catalogId,
    "fixture sanity: same institution"
  );
  assert.notEqual(nursingView.course.catalogId, dataView.course.catalogId);
  assert.notEqual(nursingView.intake.id, dataView.intake.id);
  assert.notEqual(
    nursing.package.packageId,
    dataScience.package.packageId,
    "packages are per application"
  );
  assert.notEqual(
    nursing.package.contentSha256,
    dataScience.package.contentSha256
  );

  // Each application opens exactly one admission case bound to itself.
  const cases: {
    applicationId: string | null;
    caseId: string;
    courseTitle: string | null;
    institutionName: string;
    originKind: string;
  }[] = [];
  for (const ready of [nursing, dataScience, business]) {
    const opened = await harness.admissions.createCase({
      actorUserId: harness.ownerUserId,
      applicationId: ready.application.applicationId,
      operationId: harness.operationId("case-create"),
      originKind: "school_application",
      projectId: harness.projectId,
    });
    cases.push(opened.case);
  }
  assert.equal(cases.length, 3);
  assert.equal(
    new Set(cases.map((entry) => entry.applicationId)).size,
    3,
    "every case binds its own application"
  );
  const expected = [nursing, dataScience, business];
  for (const [index, ready] of expected.entries()) {
    const entry = cases[index];
    assert.ok(entry);
    assert.equal(entry.applicationId, ready.application.applicationId);
    assert.equal(
      entry.institutionName,
      M3_INSTITUTIONS[ready.application.institutionKey].institutionName
    );
    assert.equal(
      entry.courseTitle,
      M3_INSTITUTIONS[ready.application.institutionKey].courseTitle
    );
  }

  // The M5.2 selection list comes from the real M5.1 service and marks already
  // bound applications so a second case cannot be offered.
  const listed = await harness.admissions.list({
    actorUserId: harness.ownerUserId,
    projectId: harness.projectId,
  });
  assert.equal(listed.cases.length, 3);
  assert.equal(listed.applications.length, 3);
  assert.equal(
    listed.applications.every((entry) => entry.hasCase),
    true
  );

  // No cross-application contamination in M5.1 packages either.
  const packages = await harness.applications.listPackages({
    actorUserId: harness.ownerUserId,
    applicationId: nursing.application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(packages.packages.length, 1);
  assert.equal(packages.currentPackage?.packageId, nursing.package.packageId);
  assert.ok(
    packages.packages.every(
      (entry) => entry.packageId !== dataScience.package.packageId
    )
  );

  // Another Project member cannot read the creator's private applications.
  assert.deepEqual(
    await harness.applications.list({
      actorUserId: harness.memberUserId,
      projectId: harness.projectId,
    }),
    []
  );
  const memberCaseList = await harness.admissions.list({
    actorUserId: harness.memberUserId,
    projectId: harness.projectId,
  });
  assert.deepEqual(memberCaseList.cases, []);
  assert.deepEqual(memberCaseList.applications, []);
  await assert.rejects(
    harness.applications.get({
      actorUserId: harness.memberUserId,
      applicationId: nursing.application.applicationId,
      projectId: harness.projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "application_not_found"
  );

  // The creator's cases stay inside the Project.
  await assert.rejects(
    harness.admissions.get({
      actorUserId: harness.strangerUserId,
      caseId: cases[0]?.caseId as string,
      projectId: harness.projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "project_forbidden"
  );
});

test("I-01 a second case for the same application is refused", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  await assert.rejects(
    harness.admissions.createCase({
      actorUserId: harness.ownerUserId,
      applicationId: ready.application.applicationId,
      operationId: harness.operationId("case-create"),
      originKind: "school_application",
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  assert.equal(harness.admissionStore.state().cases.length, 1);
});
