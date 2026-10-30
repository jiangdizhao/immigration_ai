import assert from "node:assert/strict";
import { test } from "node:test";
import { readyApplication } from "./fixtures";
import { createM5IntegrationHarness } from "./harness";

/**
 * I-04 — Offer and CoE versioning, provenance and supersession.
 *
 * A customer report is never a provider confirmation, transitions are
 * forward-only with immutable history, and exactly one outcome stays current.
 */
test("I-04 customer-reported Offer transitions keep history and one current row", async () => {
  const harness = createM5IntegrationHarness();
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });

  const recorded = await harness.admissions.recordOutcome({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    expiresOn: "2027-03-31",
    kind: "offer",
    operationId: harness.operationId("outcome"),
    projectId: harness.projectId,
    provenance: "customer_reported",
    receivedOn: "2026-10-15",
  });
  assert.equal(recorded.case.offer?.state, "received");
  assert.equal(recorded.case.offer?.version, 1);
  assert.equal(recorded.case.offer?.provenance, "customer_reported");

  const outcomeId = recorded.case.offer?.outcomeId as string;
  const review = await harness.admissions.transitionOutcome({
    actorUserId: harness.ownerUserId,
    action: "start_review",
    caseId: opened.case.caseId,
    decisionOn: "2026-10-20",
    expectedRevision: recorded.case.revision,
    kind: "offer",
    operationId: harness.operationId("transition"),
    outcomeId,
    projectId: harness.projectId,
  });
  assert.equal(review.case.offer?.state, "under_review");
  assert.equal(review.case.offer?.version, 2);

  const accepted = await harness.admissions.transitionOutcome({
    actorUserId: harness.ownerUserId,
    action: "accept",
    caseId: opened.case.caseId,
    decisionOn: "2026-10-25",
    expectedRevision: review.case.revision,
    kind: "offer",
    operationId: harness.operationId("transition"),
    outcomeId: review.case.offer?.outcomeId as string,
    projectId: harness.projectId,
  });
  assert.equal(accepted.case.offer?.state, "accepted");
  assert.equal(accepted.case.offer?.version, 3);
  // The transition supersedes, never rewrites, so history keeps every version.
  assert.deepEqual(
    accepted.case.outcomeHistory
      .filter((entry) => entry.kind === "offer")
      .map((entry) => entry.version)
      .sort(),
    [1, 2, 3]
  );
  assert.equal(
    accepted.case.outcomeHistory.filter(
      (entry) => entry.kind === "offer" && !entry.superseded
    ).length,
    1
  );
  // Provenance never upgrades itself through a transition.
  assert.equal(accepted.case.offer?.provenance, "customer_reported");
  assert.equal(
    accepted.case.disclosures.includes("no_verified_offer_or_coe"),
    true
  );
  // A provider-confirmed claim is not authorable by a customer request.
  await assert.rejects(
    harness.admissions.recordOutcome({
      actorUserId: harness.ownerUserId,
      caseId: opened.case.caseId,
      expectedRevision: accepted.case.revision,
      kind: "offer",
      operationId: harness.operationId("outcome"),
      projectId: harness.projectId,
      provenance: "provider_confirmed",
    }),
    (error: unknown) =>
      (error as { code?: string }).code === "authority_unavailable"
  );
  assert.equal(
    harness.admissionStore
      .state()
      .outcomes.filter((entry) => entry.provenance === "provider_confirmed")
      .length,
    0
  );
});

test("I-04 a document-backed CoE is attached evidence, not verification", async () => {
  const harness = createM5IntegrationHarness();
  const document = harness.documents.seed({
    canonicalMime: "application/pdf",
    sha256: "d".repeat(64),
    version: 2,
  });
  const ready = await readyApplication(harness);
  const opened = await harness.admissions.createCase({
    actorUserId: harness.ownerUserId,
    applicationId: ready.application.applicationId,
    operationId: harness.operationId("case-create"),
    originKind: "school_application",
    projectId: harness.projectId,
  });

  // The customer can only select documents the M2 policy exposes.
  const listed = await harness.admissions.list({
    actorUserId: harness.ownerUserId,
    projectId: harness.projectId,
  });
  assert.equal(listed.documents.length, 1);
  assert.equal(listed.documents[0]?.referenceId, document.assetId);
  assert.equal(listed.documents[0]?.version, 2);
  assert.equal(listed.documentsUnavailable, false);

  const claimed = await harness.admissions.recordOutcome({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    expectedRevision: opened.case.revision,
    kind: "coe",
    operationId: harness.operationId("outcome"),
    projectId: harness.projectId,
    provenance: "customer_reported",
  });
  assert.equal(claimed.case.coe?.state, "claimed");
  assert.equal(claimed.case.coe?.evidenceAttached, false);

  const obtained = await harness.admissions.recordOutcome({
    actorUserId: harness.ownerUserId,
    caseId: opened.case.caseId,
    evidenceReferenceId: document.assetId,
    expectedRevision: claimed.case.revision,
    kind: "coe",
    operationId: harness.operationId("outcome"),
    projectId: harness.projectId,
    provenance: "document_backed_unverified",
  });
  assert.equal(obtained.case.coe?.state, "obtained");
  assert.equal(obtained.case.coe?.evidenceAttached, true);
  assert.equal(obtained.case.coe?.independentlyVerified, false);
  assert.equal(obtained.case.coe?.provenance, "document_backed_unverified");
  assert.equal(
    obtained.case.disclosures.includes("document_not_authenticated"),
    true
  );
  assert.equal(obtained.case.journey.student500Eligibility, "not_determined");

  // A document that fails the scan is no longer selectable.
  harness.documents.setSecurityStatus(document.assetId, "infected");
  const afterScan = await harness.admissions.list({
    actorUserId: harness.ownerUserId,
    projectId: harness.projectId,
  });
  assert.deepEqual(afterScan.documents, []);
  assert.equal(
    harness.admissionStore
      .state()
      .outcomes.filter((entry) => entry.provenance === "provider_confirmed")
      .length,
    0,
    "no provider-confirmed outcome is ever produced offline"
  );
});
