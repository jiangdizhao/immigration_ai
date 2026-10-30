import assert from "node:assert/strict";
import { test } from "node:test";
import { createApplication, readyApplication } from "./fixtures";
import { createM5IntegrationHarness, seedReference } from "./harness";

/**
 * I-02 — evidence and exact package binding.
 *
 * The M5.2 case must consume the *actual* M5.1 package identity (id, version,
 * hash) and must never upgrade an unverified M3 record into an official claim.
 */
test("I-02 the admission case consumes the exact M5.1 package identity", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness, {
    institutionKey: "northbridge",
  });

  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });

  // Exact package identity travels from M5.1 into the M5.2 view unchanged.
  assert.equal(
    opened.case.application?.currentPackage?.packageId,
    ready.package.packageId
  );
  assert.equal(opened.case.application?.currentPackage?.version, 1);
  assert.equal(
    opened.case.application?.currentPackage?.contentSha256,
    ready.package.contentSha256
  );
  assert.equal(opened.case.application?.currentPackage?.usable, true);
  assert.equal(opened.case.application?.revision, ready.package.revision);
  assert.equal(opened.case.application?.referenceCount, 2);
  assert.equal(opened.case.application?.unavailableReferenceCount, 0);

  // M5.1 does not claim the catalog record is independently verified, and M5.2
  // repeats that honest source status rather than upgrading it.
  const applicationView = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(applicationView.source.independentlyVerified, false);
  assert.equal(
    applicationView.source.status,
    "unverified_catalog_match",
    "an M3 match is a match, never an independent verification"
  );
  assert.equal(
    opened.case.application?.sourceStatus,
    applicationView.source.status
  );
  assert.equal(
    opened.case.disclosures.includes("catalog_not_independently_verified"),
    true
  );
  assert.equal(opened.case.disclosures.includes("draft_is_provisional"), true);
  assert.equal(
    opened.case.disclosures.includes("no_institutional_decision"),
    true
  );

  // The preparation carries the checklist's honest uncertainty instead of a
  // fabricated "verified" state.
  const prepared = await harness.admissions.prepare({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    operationId: harness.operationId("prep"),
    projectId: harness.projectId,
  });
  const requirement = (code: string) =>
    prepared.case.requirements.find((entry) => entry.code === code);
  assert.equal(requirement("education_source_resolved")?.status, "unverified");
  assert.deepEqual(requirement("education_source_resolved")?.uncertaintyCodes, [
    "unverified_catalog_record",
  ]);
  assert.equal(requirement("evidence_fact_available")?.status, "unknown");
  assert.equal(requirement("evidence_document_available")?.status, "satisfied");
  assert.equal(requirement("preparation_package_usable")?.status, "satisfied");
  assert.equal(prepared.case.preparationStale, false);
  assert.equal(prepared.case.preparation?.version, 1);
  assert.equal(prepared.case.preparation?.assistKind, "disabled");

  // Package hash travels into the stored preparation snapshot, so a later read
  // cannot silently substitute a different package.
  const detail = await harness.admissions.get({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    projectId: harness.projectId,
  });
  assert.equal(
    detail.case.application?.currentPackage?.packageId,
    ready.package.packageId
  );
  assert.equal(
    detail.case.application?.currentPackage?.contentSha256,
    ready.package.contentSha256
  );
  // The snapshot records the exact M5.1 application revision it was built from.
  assert.equal(
    detail.case.preparation?.applicationRevision,
    ready.package.revision
  );
  assert.match(
    String(detail.case.preparation?.contentSha256),
    /^[0-9a-f]{64}$/u
  );
  assert.match(
    String(detail.case.preparation?.inputsSha256),
    /^[0-9a-f]{64}$/u
  );
  // Re-reading never rewrites the immutable snapshot.
  assert.equal(
    (
      await harness.admissions.get({
        actorUserId: harness.ownerUserId,
        caseId: opened.case.caseId,
        projectId: harness.projectId,
      })
    ).case.preparation?.contentSha256,
    detail.case.preparation?.contentSha256
  );
});

test("I-02 a customer-declared application stays explicitly unverified", async () => {
  const harness = createM5IntegrationHarness();
  const application = await createApplication(harness, {
    institutionKey: "riverside",
  });
  const referenceId = seedReference(harness, { kind: "fact" });
  const bound = await harness.applications.bindReference({
    actorUserId: harness.ownerUserId,
    applicationId: application.applicationId,
    expectedRevision: application.revision,
    kind: "fact",
    operationId: harness.operationId("app-bind"),
    projectId: harness.projectId,
    referenceId,
  });
  const pkg = await harness.applications.buildPackage({
    actorUserId: harness.ownerUserId,
    applicationId: application.applicationId,
    expectedRevision: bound.application.revision,
    operationId: harness.operationId("app-package"),
    projectId: harness.projectId,
  });
  assert.equal(pkg.package.usable, true);

  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });
  const view = await harness.applications.get({
    actorUserId: harness.ownerUserId,
    applicationId: application.applicationId,
    projectId: harness.projectId,
  });
  assert.equal(view.source.status, "unverified_catalog_match");
  assert.equal(opened.case.application?.sourceStatus, view.source.status);

  const prepared = await harness.admissions.prepare({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    operationId: harness.operationId("prep"),
    projectId: harness.projectId,
  });
  assert.equal(
    prepared.case.requirements.find(
      (entry) => entry.code === "education_source_resolved"
    )?.status,
    "unverified"
  );
  assert.equal(
    prepared.case.preparation?.sections.some((section) =>
      section.uncertaintyCodes.includes("draft_is_provisional")
    ),
    true
  );
});
