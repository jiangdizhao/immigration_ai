import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bindReferences,
  createApplication,
  readyApplication,
} from "./fixtures";
import {
  createM5IntegrationHarness,
  M3_INSTITUTIONS,
  M5_OWNER_ID,
  seedReference,
} from "./harness";

/**
 * I-09 — idempotency, concurrency and durable audit integrity across modules.
 */
test("I-09 exact replays return the recorded result in both modules", async () => {
  const harness = createM5IntegrationHarness();
  const entry = M3_INSTITUTIONS.northbridge;
  const authored = {
    actorUserId: M5_OWNER_ID,
    courseId: entry.courseId,
    courseTitle: entry.courseTitle,
    institutionId: entry.institutionId,
    institutionName: entry.institutionName,
    intakeId: entry.intakeId,
    intakeLabel: entry.intakeLabel,
    operationId: "replay-create-1",
    projectId: harness.projectId,
  };
  const created = await harness.applications.create(authored);
  const createAgain = await harness.applications.create(authored);
  assert.equal(createAgain.replayed, true);
  assert.equal(
    createAgain.application.applicationId,
    created.application.applicationId
  );
  assert.equal(harness.applicationStore.state().applications.length, 1);

  // A changed authored payload under the same operationId conflicts.
  await assert.rejects(
    harness.applications.create({
      ...authored,
      courseTitle: "Different Course",
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "idempotency_conflict"
  );

  // The same rule holds on the M5.2 side.
  const ready = await readyApplication(harness);
  const caseOp = "replay-case-1";
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: caseOp,
    originKind: "school_application",
    projectId: harness.projectId,
  });
  const openedAgain = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: caseOp,
    originKind: "school_application",
    projectId: harness.projectId,
  });
  assert.equal(openedAgain.replayed, true);
  assert.equal(openedAgain.case.caseId, opened.case.caseId);
  assert.equal(harness.admissionStore.state().cases.length, 1);
  await assert.rejects(
    harness.admissions.createCase({
      actorUserId: harness.ownerUserId,
      courseTitle: "Changed",
      institutionName: "Changed College",
      operationId: caseOp,
      originKind: "existing_offer",
      projectId: harness.projectId,
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "idempotency_conflict"
  );
});

test("I-09 concurrent package builds enforce single-writer CAS", async () => {
  const harness = createM5IntegrationHarness();

  // Precondition for genuine CAS: NO package exists yet, so the store's
  // "reuse current package" path cannot absorb one of the two writers. Both
  // requests must therefore attempt a real version-1 build at the same revision.
  const application = await createApplication(harness, {
    institutionKey: "northbridge",
  });
  const referenceId = seedReference(harness, { kind: "fact" });
  const boundRevision = await bindReferences(harness, {
    applicationId: application.applicationId,
    references: [{ kind: "fact", referenceId }],
  });
  const before = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(before.revision, boundRevision);
  assert.equal(
    before.currentPackage,
    null,
    "no current package before the race"
  );
  assert.equal(
    harness.applicationStore
      .state()
      .packages.filter(
        (entry) => entry.applicationId === application.applicationId
      ).length,
    0
  );

  const results = await Promise.allSettled([
    harness.applications.buildPackage({
      actorUserId: harness.ownerUserId,
      applicationId: application.applicationId,
      expectedRevision: before.revision,
      operationId: "cas-build-a",
      projectId: harness.projectId,
    }),
    harness.applications.buildPackage({
      actorUserId: harness.ownerUserId,
      applicationId: application.applicationId,
      expectedRevision: before.revision,
      operationId: "cas-build-b",
      projectId: harness.projectId,
    }),
  ]);

  const winners = results.filter(
    (
      entry
    ): entry is PromiseFulfilledResult<
      Awaited<ReturnType<typeof harness.applications.buildPackage>>
    > => entry.status === "fulfilled"
  );
  const losers = results.filter(
    (entry): entry is PromiseRejectedResult => entry.status === "rejected"
  );

  // 1 + 2: exactly one winner and exactly one optimistic-concurrency rejection.
  assert.equal(winners.length, 1, "exactly one build may win");
  assert.equal(losers.length, 1, "exactly one build must be rejected");
  assert.equal(
    (losers[0]?.reason as { code?: string }).code,
    "revision_conflict"
  );

  // 3: exactly one new package version became current.
  const packages = await harness.applications.listPackages({
    actorUserId: harness.ownerUserId,
    applicationId: application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(packages.packages.length, 1);
  assert.equal(packages.currentPackage?.version, 1);
  assert.equal(
    packages.currentPackage?.packageId,
    winners[0]?.value.package.packageId
  );

  // 4: no duplicate current rows in the store.
  const currentRows = harness.applicationStore
    .state()
    .packages.filter(
      (entry) =>
        entry.applicationId === application.applicationId &&
        entry.status === "current"
    );
  assert.equal(currentRows.length, 1);
  assert.equal(currentRows[0]?.id, packages.currentPackage?.packageId);

  // 5: the rejected writer produced no operation record and no audit event.
  const winnerOperationIndex = results.findIndex(
    (entry) => entry.status === "fulfilled"
  );
  const loserOperationId =
    winnerOperationIndex === 0 ? "cas-build-b" : "cas-build-a";
  const winnerOperationId =
    winnerOperationIndex === 0 ? "cas-build-a" : "cas-build-b";
  const operations = harness.applicationStore.state().operations;
  assert.equal(
    operations.filter((entry) => entry.operationId === loserOperationId).length,
    0,
    "a refused CAS attempt must not record an operation"
  );
  assert.equal(
    operations.filter((entry) => entry.operationId === winnerOperationId)
      .length,
    1
  );
  const packageEvents = harness.applicationStore
    .state()
    .events.filter(
      (entry) =>
        entry.eventType === "school_application_package_built" &&
        entry.subjectId === packages.currentPackage?.packageId
    );
  assert.equal(packageEvents.length, 1);
  assert.equal(
    harness.applicationStore
      .state()
      .events.filter(
        (entry) => entry.eventType === "school_application_package_built"
      ).length,
    1,
    "exactly one build event was committed"
  );

  // 6: the application revision advanced by exactly the legitimate amount.
  const after = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.currentPackage?.version, 1);
});

test("I-09 concurrent admission preparations produce one winner and one revision conflict", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  const prepareResults = await Promise.allSettled([
    harness.admissions.prepare({
      actorUserId: harness.ownerUserId,
      caseId: opened.case.caseId,
      expectedRevision: opened.case.revision,
      operationId: "concurrent-prep-a",
      projectId: harness.projectId,
    }),
    harness.admissions.prepare({
      actorUserId: harness.ownerUserId,
      caseId: opened.case.caseId,
      expectedRevision: opened.case.revision,
      operationId: "concurrent-prep-b",
      projectId: harness.projectId,
    }),
  ]);
  const prepareWins = prepareResults.filter(
    (entry) => entry.status === "fulfilled"
  );
  const prepareLosses = prepareResults.filter(
    (entry): entry is PromiseRejectedResult => entry.status === "rejected"
  );
  assert.equal(prepareWins.length, 1, "exactly one preparation wins");
  assert.equal(prepareLosses.length, 1);
  assert.equal(
    (prepareLosses[0]?.reason as { code?: string }).code,
    "revision_conflict"
  );
  assert.equal(harness.admissionStore.state().preparations.length, 1);
});
