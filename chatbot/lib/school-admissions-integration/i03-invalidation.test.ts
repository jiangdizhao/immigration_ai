import assert from "node:assert/strict";
import { test } from "node:test";
import { bindReferences, readyApplication } from "./fixtures";
import { createM5IntegrationHarness, seedReference } from "./harness";

/**
 * I-03 — source and permission invalidation across the module boundary.
 *
 * One M2 reference identity is read by both modules, so a change committed on
 * the M2 side must be observed by the M5.1 package *and* the M5.2 preparation.
 */
async function confirmedCase(
  harness: ReturnType<typeof createM5IntegrationHarness>
) {
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
  const confirmed = await harness.admissions.confirmPreparation({
    actorUserId: harness.ownerUserId,
    caseId: prepared.case.caseId,
    expectedRevision: prepared.case.revision,
    operationId: harness.operationId("confirm"),
    preparationId: prepared.case.preparation?.preparationId as string,
    projectId: harness.projectId,
  });
  return { confirmed, harness, opened, prepared, ready };
}

test("I-03 a changed M2 reference stales both modules and blocks reconfirmation", async () => {
  const harness = createM5IntegrationHarness();
  const { confirmed, ready } = await confirmedCase(harness);
  assert.equal(confirmed.case.preparationState, "customer_confirmed");
  assert.equal(confirmed.case.preparationStale, false);
  assert.equal(confirmed.case.application?.currentPackage?.usable, true);

  // M2-side change: the same reference moves to version 2 with a new hash.
  harness.m2.setAvailable({
    referenceId: ready.factReferenceId,
    available: true,
    sha256: "9".repeat(64),
    version: 2,
  });

  const applicationView = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(applicationView.packageStale, true);
  assert.equal(applicationView.currentPackage?.usable, false);
  assert.deepEqual([...applicationView.staleReasonCodes].sort(), [
    "material_inputs_changed",
    "reference_changed",
  ]);
  assert.equal(
    applicationView.references.find((entry) => entry.kind === "fact")?.changed,
    true
  );

  const caseAfter = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: confirmed.case.caseId,
    projectId: harness.projectId,
  });
  assert.equal(caseAfter.case.preparationStale, true);
  assert.equal(caseAfter.case.application?.currentPackage?.usable, false);
  assert.ok(caseAfter.case.staleReasonCodes.includes("source_changed"));
  assert.ok(caseAfter.case.staleReasonCodes.includes("requirements_changed"));
  assert.equal(
    caseAfter.case.requirements.find(
      (entry) => entry.code === "preparation_package_usable"
    )?.status,
    "missing"
  );
  // The historical confirmation is still recorded; it is simply not current.
  assert.equal(caseAfter.case.preparationState, "customer_confirmed");
  assert.equal(caseAfter.case.preparation?.confirmedAt !== null, true);

  // A stale preparation cannot be reconfirmed.
  await assert.rejects(
    harness.admissions.confirmPreparation({
      actorUserId: harness.ownerUserId,
      caseId: caseAfter.case.caseId,
      expectedRevision: caseAfter.case.revision,
      operationId: harness.operationId("confirm"),
      preparationId: caseAfter.case.preparation?.preparationId as string,
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  assert.equal(
    harness.admissionStore
      .state()
      .preparations.filter((entry) => entry.confirmedAt !== null).length,
    1,
    "a refused reconfirmation must not add a confirmation"
  );
});

test("I-03 a revoked reference is unavailable to both modules", async () => {
  const harness = createM5IntegrationHarness();
  const { confirmed, ready } = await confirmedCase(harness);

  harness.m2.revoke({ referenceId: ready.documentReferenceId });

  const applicationView = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(applicationView.currentPackage?.usable, false);
  assert.ok(applicationView.staleReasonCodes.includes("reference_unavailable"));
  const documentReference = applicationView.references.find(
    (entry) => entry.referenceId === ready.documentReferenceId
  );
  // The M5.1 record itself was not revoked through the M5.1 API; the M2-side
  // revocation simply makes the reference unresolvable, so `available` is false
  // and `revokedAt` stays null. Both are reported, neither is invented.
  assert.equal(documentReference?.available, false);
  assert.equal(documentReference?.revokedAt, null);

  const caseAfter = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: confirmed.case.caseId,
    projectId: harness.projectId,
  });
  assert.equal(caseAfter.case.preparationStale, true);
  assert.equal(caseAfter.case.application?.unavailableReferenceCount, 1);
  assert.equal(
    caseAfter.case.requirements.find(
      (entry) => entry.code === "evidence_document_available"
    )?.status !== "satisfied",
    true,
    "a revoked document reference can never satisfy an evidence requirement"
  );
});

test("I-03 revoked required evidence keeps the case stale and blocks v2 confirmation", async () => {
  const harness = createM5IntegrationHarness();
  const { confirmed, ready } = await confirmedCase(harness);

  // M5.1-side revocation through the real API records `revokedAt`.
  const current = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    projectId: harness.projectId,
  });
  const referenceRecord = current.references.find(
    (entry) => entry.referenceId === ready.documentReferenceId
  );
  assert.ok(referenceRecord);
  const revoked = await harness.applications.revokeReference({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    expectedRevision: current.revision,
    operationId: harness.operationId("app-revoke"),
    projectId: harness.projectId,
    referenceRecordId: referenceRecord.referenceRecordId,
  });
  const revokedReference = revoked.application.references.find(
    (entry) => entry.referenceId === ready.documentReferenceId
  );
  assert.equal(revokedReference?.revokedAt !== null, true);
  // No usable current package survives a revocation.
  assert.equal(revoked.application.currentPackage?.usable ?? false, false);
  assert.ok(
    revoked.application.staleReasonCodes.includes("reference_unavailable") ||
      revoked.application.currentPackage === null
  );

  const caseAfterRevoke = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: confirmed.case.caseId,
    projectId: harness.projectId,
  });
  assert.equal(caseAfterRevoke.case.preparationStale, true);
  assert.equal(caseAfterRevoke.case.application?.unavailableReferenceCount, 1);

  // A rebuilt package is usable, but the required document evidence is now
  // missing, so the case stays stale and cannot be reconfirmed.
  const rebuilt = await harness.applications.buildPackage({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    expectedRevision: revoked.application.revision,
    operationId: harness.operationId("app-package"),
    projectId: harness.projectId,
  });
  assert.equal(rebuilt.package.version, 2);
  assert.equal(rebuilt.package.usable, true);

  const v2 = await harness.admissions.prepare({
    actorUserId: harness.ownerUserId,
    caseId: confirmed.case.caseId,
    expectedRevision: caseAfterRevoke.case.revision,
    operationId: harness.operationId("prep"),
    projectId: harness.projectId,
  });
  assert.equal(v2.preparationVersion, 2);
  assert.equal(v2.case.preparationStale, true);
  assert.ok(v2.case.staleReasonCodes.includes("source_unavailable"));
  assert.equal(
    v2.case.requirements.find(
      (entry) => entry.code === "evidence_document_available"
    )?.status,
    "missing"
  );
  await assert.rejects(
    harness.admissions.confirmPreparation({
      actorUserId: harness.ownerUserId,
      caseId: v2.case.caseId,
      expectedRevision: v2.case.revision,
      operationId: harness.operationId("confirm"),
      preparationId: v2.case.preparation?.preparationId as string,
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict",
    "a preparation with missing required evidence cannot be confirmed"
  );
});
test("I-03 a divergent application target keeps the case stale and unconfirmable", async () => {
  const harness = createM5IntegrationHarness();
  const { confirmed, ready } = await confirmedCase(harness);

  // The customer switches intake; M3 must resolve it as its own catalog record.
  harness.m3.seed({
    courseId: "course:northbridge:bachelor-nursing-s2",
    courseTitle: "Bachelor of Nursing",
    deliveryId: null,
    institutionId: "provider:northbridge",
    institutionName: "Northbridge University",
    intakeId: "intake:northbridge:2027-s2",
    intakeLabel: "Semester 2 2027",
    recordClass: "UNVERIFIED",
    snapshotToken: "m3-snapshot:northbridge:1",
  });
  const beforeUpdate = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    projectId: harness.projectId,
  });
  const updated = await harness.applications.update({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    courseId: "course:northbridge:bachelor-nursing-s2",
    courseTitle: "Bachelor of Nursing",
    expectedRevision: beforeUpdate.revision,
    institutionId: "provider:northbridge",
    institutionName: "Northbridge University",
    intakeId: "intake:northbridge:2027-s2",
    intakeLabel: "Semester 2 2027",
    operationId: harness.operationId("app-update"),
    projectId: harness.projectId,
  });
  assert.notEqual(updated.application.revision, beforeUpdate.revision);

  const caseAfterTarget = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: confirmed.case.caseId,
    projectId: harness.projectId,
  });
  assert.equal(caseAfterTarget.case.preparationStale, true);
  assert.ok(
    caseAfterTarget.case.staleReasonCodes.includes("application_changed")
  );
  assert.ok(caseAfterTarget.case.staleReasonCodes.includes("package_changed"));
  // The case keeps the labels recorded when it was opened and discloses the
  // divergence by staleness instead of silently rewriting the record.
  assert.equal(caseAfterTarget.case.intakeLabel, "Semester 1 2027");
  assert.equal(
    caseAfterTarget.case.requirements.find(
      (entry) => entry.code === "preparation_package_usable"
    )?.status,
    "missing"
  );

  // A stale case cannot be reconfirmed, and its history stays intact.
  await assert.rejects(
    harness.admissions.confirmPreparation({
      actorUserId: harness.ownerUserId,
      caseId: caseAfterTarget.case.caseId,
      expectedRevision: caseAfterTarget.case.revision,
      operationId: harness.operationId("confirm"),
      preparationId: caseAfterTarget.case.preparation?.preparationId as string,
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  assert.equal(
    caseAfterTarget.case.preparationHistory.filter(
      (entry) => entry.confirmedAt !== null
    ).length,
    1
  );
});

/**
 * I-03 (recovery) — the full cross-module pathway:
 * valid v1 → material M2 change → stale refusal → authorized recovery →
 * new package → new preparation → confirmed v2, with immutable history.
 *
 * Only accepted public contracts are used: M2-side changes go through the shared
 * registry, M5.1 changes through the M5.1 service, and every M5.2 transition
 * through the M5.2 service. No store state is written directly.
 */
test("I-03 recovery: stale v1 is superseded by an authorized v2 reconfirmation", async () => {
  const harness = createM5IntegrationHarness();

  // ---------------------------------------------------------------------------
  // Stage A — initially valid state (v1)
  // ---------------------------------------------------------------------------
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  const prepared1 = await harness.admissions.prepare({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    operationId: harness.operationId("prep"),
    projectId: harness.projectId,
  });
  const confirmed1 = await harness.admissions.confirmPreparation({
    actorUserId: harness.ownerUserId,
    caseId: prepared1.case.caseId,
    expectedRevision: prepared1.case.revision,
    operationId: harness.operationId("confirm"),
    preparationId: prepared1.case.preparation?.preparationId as string,
    projectId: harness.projectId,
  });

  // An unrelated application + case in the same Project must stay untouched.
  const bystander = await readyApplication(harness, {
    institutionKey: "riverside",
  });
  const bystanderCase = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: bystander.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  const bystanderPrepared = await harness.admissions.prepare({
    actorUserId: harness.ownerUserId,
    caseId: bystanderCase.case.caseId,
    expectedRevision: bystanderCase.case.revision,
    operationId: harness.operationId("prep"),
    projectId: harness.projectId,
  });

  const v1 = {
    applicationRevision: ready.package.revision,
    caseId: opened.case.caseId,
    confirmedAt: confirmed1.case.preparation?.confirmedAt,
    contentSha256: prepared1.case.preparation?.contentSha256 as string,
    inputsSha256: prepared1.case.preparation?.inputsSha256 as string,
    packageId: ready.package.packageId,
    packageSha256: ready.package.contentSha256,
    preparationId: prepared1.case.preparation?.preparationId as string,
  };
  assert.equal(confirmed1.case.preparationState, "customer_confirmed");
  assert.equal(confirmed1.case.preparationStale, false);
  assert.equal(typeof v1.confirmedAt, "string");
  assert.equal(
    confirmed1.case.application?.currentPackage?.packageId,
    v1.packageId
  );
  assert.equal(
    confirmed1.case.application?.currentPackage?.contentSha256,
    v1.packageSha256
  );
  assert.equal(
    bystanderPrepared.case.preparationStale,
    false,
    "the bystander starts current"
  );

  // ---------------------------------------------------------------------------
  // Stage B — material invalidation of a bound M2 fact fingerprint
  // ---------------------------------------------------------------------------
  harness.m2.setAvailable({
    available: true,
    referenceId: ready.factReferenceId,
    sha256: "9".repeat(64),
    version: 2,
  });

  const applicationAfterChange = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(
    applicationAfterChange.packageStale,
    true,
    "M5.1 must detect the material change"
  );
  assert.equal(applicationAfterChange.currentPackage?.usable, false);
  assert.ok(
    applicationAfterChange.staleReasonCodes.includes("material_inputs_changed")
  );
  assert.ok(
    applicationAfterChange.staleReasonCodes.includes("reference_changed")
  );
  assert.equal(
    applicationAfterChange.references.find(
      (entry) => entry.referenceId === ready.factReferenceId
    )?.changed,
    true
  );

  const caseAfterChange = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: v1.caseId,
    projectId: harness.projectId,
  });
  assert.equal(
    caseAfterChange.case.preparationStale,
    true,
    "M5.2 must see the same change"
  );
  assert.ok(caseAfterChange.case.staleReasonCodes.includes("source_changed"));
  assert.ok(
    caseAfterChange.case.staleReasonCodes.includes("requirements_changed")
  );
  assert.equal(
    caseAfterChange.case.requirements.find(
      (entry) => entry.code === "preparation_package_usable"
    )?.status,
    "missing"
  );

  // Stale v1 can be neither reconfirmed nor treated as current.
  await assert.rejects(
    harness.admissions.confirmPreparation({
      actorUserId: harness.ownerUserId,
      caseId: v1.caseId,
      expectedRevision: caseAfterChange.case.revision,
      operationId: harness.operationId("confirm"),
      preparationId: v1.preparationId,
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  // The earlier confirmation and snapshot remain intact and auditable.
  assert.equal(
    caseAfterChange.case.preparationHistory.length,
    1,
    "no extra preparation was manufactured by the refusal"
  );
  assert.equal(
    caseAfterChange.case.preparationHistory[0]?.preparationId,
    v1.preparationId
  );
  assert.equal(
    caseAfterChange.case.preparationHistory[0]?.confirmedAt,
    v1.confirmedAt
  );
  assert.equal(
    caseAfterChange.case.preparation?.contentSha256,
    v1.contentSha256,
    "the stored v1 snapshot is immutable"
  );
  assert.equal(
    harness.admissionStore
      .state()
      .preparations.filter((entry) => entry.confirmedAt !== null).length,
    1
  );

  // ---------------------------------------------------------------------------
  // Stage C — authorized recovery through real M5.1 / M5.2 operations
  // ---------------------------------------------------------------------------
  // The customer supplies a replacement fact reference (a legitimate M5.1
  // operation); it resolves through the same shared M2 registry.
  const replacementFactId = seedReference(harness, {
    kind: "fact",
    sha256: "6".repeat(64),
    version: 1,
  });
  const revisionAfterBind = await bindReferences(harness, {
    applicationId: ready.application.applicationId,
    references: [{ kind: "fact", referenceId: replacementFactId }],
  });

  const rebuilt = await harness.applications.buildPackage({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    expectedRevision: revisionAfterBind,
    operationId: harness.operationId("app-package"),
    projectId: harness.projectId,
  });
  assert.equal(rebuilt.package.version, 2, "recovery must mint a new version");
  assert.notEqual(rebuilt.package.packageId, v1.packageId);
  assert.notEqual(
    rebuilt.package.contentSha256,
    v1.packageSha256,
    "the content hash must reflect the changed inputs"
  );
  assert.notEqual(rebuilt.package.inputsSha256, v1.inputsSha256);
  assert.equal(rebuilt.package.usable, true);
  assert.deepEqual([...rebuilt.package.staleReasonCodes], []);

  // Previous package history is retained, never overwritten.
  const packageHistory = await harness.applications.listPackages({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(packageHistory.packages.length, 2);
  assert.equal(
    packageHistory.currentPackage?.packageId,
    rebuilt.package.packageId
  );
  assert.deepEqual(
    packageHistory.packages.map((entry) => entry.version).sort(),
    [1, 2]
  );

  const caseReady = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: v1.caseId,
    projectId: harness.projectId,
  });
  // The application is fully current again, but the case's *current* preparation
  // is still v1 and therefore still stale until a new preparation is generated.
  assert.equal(rebuilt.application.packageStale, false);
  assert.equal(rebuilt.application.currentPackage?.usable, true);
  assert.equal(
    caseReady.case.preparationStale,
    true,
    "v1 stays stale until v2 is prepared"
  );
  assert.ok(caseReady.case.staleReasonCodes.includes("package_changed"));

  const prepared2 = await harness.admissions.prepare({
    actorUserId: harness.ownerUserId,
    caseId: v1.caseId,
    expectedRevision: caseReady.case.revision,
    operationId: harness.operationId("prep"),
    projectId: harness.projectId,
  });
  assert.equal(prepared2.preparationVersion, 2);
  assert.equal(prepared2.case.preparationStale, false, "v2 is current");
  assert.equal(
    prepared2.case.preparation?.applicationRevision,
    rebuilt.application.revision
  );
  assert.notEqual(prepared2.case.preparation?.contentSha256, v1.contentSha256);
  assert.equal(
    prepared2.case.requirements.find(
      (entry) => entry.code === "preparation_package_usable"
    )?.status,
    "satisfied"
  );

  const confirmed2 = await harness.admissions.confirmPreparation({
    actorUserId: harness.ownerUserId,
    caseId: v1.caseId,
    expectedRevision: prepared2.case.revision,
    operationId: harness.operationId("confirm"),
    preparationId: prepared2.case.preparation?.preparationId as string,
    projectId: harness.projectId,
  });

  // ---------------------------------------------------------------------------
  // Stage D — history, immutability and no inferred authority
  // ---------------------------------------------------------------------------
  const v2PreparationId = prepared2.case.preparation?.preparationId as string;
  assert.notEqual(v2PreparationId, v1.preparationId);
  assert.equal(confirmed2.case.preparationState, "customer_confirmed");
  assert.equal(confirmed2.case.preparation?.version, 2);
  assert.equal(
    confirmed2.case.preparation?.preparationId,
    v2PreparationId,
    "the case points at version 2"
  );

  // Both versions keep their own confirmation timestamp.
  const history = confirmed2.case.preparationHistory;
  assert.equal(history.length, 2);
  const v1History = history.find((entry) => entry.version === 1);
  const v2History = history.find((entry) => entry.version === 2);
  assert.equal(v1History?.preparationId, v1.preparationId);
  assert.equal(v1History?.confirmedAt, v1.confirmedAt);
  assert.equal(v2History?.preparationId, v2PreparationId);
  assert.equal(typeof v2History?.confirmedAt, "string");
  assert.equal(
    harness.admissionStore
      .state()
      .preparations.filter((entry) => entry.confirmedAt !== null).length,
    2,
    "both confirmations are durable"
  );

  // v1 stays immutable in storage.
  const storedV1 = harness.admissionStore
    .state()
    .preparations.find((entry) => entry.id === v1.preparationId);
  assert.ok(storedV1);
  assert.equal(storedV1?.contentSha256, v1.contentSha256);
  assert.equal(storedV1?.inputsSha256, v1.inputsSha256);
  // The store keeps the confirmation instant as a Date; the view exposes ISO.
  assert.equal(
    new Date(storedV1?.confirmedAt as unknown as Date).toISOString(),
    v1.confirmedAt
  );

  // Backwards reconfirmation of v1 is refused and adds nothing.
  await assert.rejects(
    harness.admissions.confirmPreparation({
      actorUserId: harness.ownerUserId,
      caseId: v1.caseId,
      expectedRevision: confirmed2.case.revision,
      operationId: harness.operationId("confirm"),
      preparationId: v1.preparationId,
      projectId: harness.projectId,
    }),
    (error: unknown) => (error as { code?: string }).code === "state_conflict"
  );
  assert.equal(
    harness.admissionStore
      .state()
      .preparations.filter((entry) => entry.confirmedAt !== null).length,
    2,
    "a refused backwards confirmation adds no confirmation"
  );

  // Unrelated application and case are unaffected by the recovery.
  const bystanderAfter = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: bystander.application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(
    bystanderAfter.currentPackage?.packageId,
    bystander.package.packageId
  );
  assert.equal(bystanderAfter.currentPackage?.usable, true);
  assert.equal(bystanderAfter.packageStale, false);
  const bystanderCaseAfter = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: bystanderCase.case.caseId,
    projectId: harness.projectId,
  });
  assert.equal(bystanderCaseAfter.case.preparationStale, false);
  assert.equal(bystanderCaseAfter.case.preparationState, "in_preparation");

  // Recovery never infers professional, institutional or submission authority.
  assert.notEqual(confirmed2.case.managedReadiness.status, "READY");
  assert.equal(
    confirmed2.case.managedReadiness.submissionState,
    "not_connected"
  );
  assert.equal(confirmed2.case.exception, null);
  assert.equal(confirmed2.case.offer, null);
  assert.equal(confirmed2.case.coe, null);
  assert.equal(confirmed2.case.journey.student500Eligibility, "not_determined");
  assert.equal(
    confirmed2.case.disclosures.includes("no_institutional_decision"),
    true
  );
  assert.equal(
    confirmed2.case.disclosures.includes("no_verified_offer_or_coe"),
    true
  );
  assert.equal(
    confirmed2.case.disclosures.includes("not_a_school_submission"),
    true
  );
});
