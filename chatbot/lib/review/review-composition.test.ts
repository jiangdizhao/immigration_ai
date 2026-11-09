import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectArtifactsSummary } from "@/lib/workspace/project-artifacts";
import {
  type ArtifactReadResult,
  composeProjectReviewSummary,
  type SubmissionReadResult,
} from "./review-composition";
import type { ReviewProfessionalAvailability } from "./review-summary";

/**
 * Phase 13 M9-B correction 3 — a genuinely empty authorized list, an unreadable source and
 * a denied source must be three different answers. Before this correction a failed read
 * was swallowed and rendered exactly like "this Project has no versions".
 */

const projectId = "22222222-2222-4222-8222-222222222222";

const availability: ReviewProfessionalAvailability = {
  authorityCode: "deny_by_default_professional_review_authority",
  credentialVerifierCode: "unavailable_professional_credential_verifier",
  purpose: "managed_handoff_authorization",
  reasonCode: "professional_authority_unavailable",
  state: "unavailable",
  supportedTargetKinds: [
    "managed_school_application",
    "student_500_visa_application",
  ],
  targetProviderCode: "unavailable_managed_target_provider",
};

const emptyArtifacts: ProjectArtifactsSummary = {
  kinds: {} as ProjectArtifactsSummary["kinds"],
  references: [],
  truncated: false,
};

const oneArtifact: ProjectArtifactsSummary = {
  kinds: {} as ProjectArtifactsSummary["kinds"],
  references: [
    {
      createdAt: "2026-11-08T00:00:00.000Z",
      digest: "a".repeat(64),
      kind: "school_application_package",
      ownerView: "applications",
      referenceId: "77777777-7777-4777-8777-777777777777",
      stale: false,
      status: "usable",
      targetId: "44444444-4444-4444-8444-444444444444",
      version: 1,
    },
  ],
  truncated: false,
};

function compose(input: {
  artifacts: ArtifactReadResult;
  submission?: SubmissionReadResult;
}) {
  return composeProjectReviewSummary({
    aiCheckAvailability: "unsupported",
    professionalAvailability: availability,
    projectId,
    readArtifacts: () => Promise.resolve(input.artifacts),
    readSubmission: input.submission
      ? () => Promise.resolve(input.submission as SubmissionReadResult)
      : undefined,
  });
}

test("a successful but empty authorized read is reported as empty, not unavailable", async () => {
  const summary = await compose({
    artifacts: { artifacts: emptyArtifacts, kind: "ok" },
  });
  assert.deepEqual(summary.items, []);
  assert.equal(summary.truncated, false);
  assert.deepEqual(summary.artifactSource, {
    reasonCode: null,
    state: "empty",
  });
  // The professional workflow state is still explained independently.
  assert.equal(summary.professionalReview.state, "unavailable");
});

test("an unreadable artifact source is reported as unavailable with a stable code", async () => {
  const summary = await compose({
    artifacts: {
      kind: "unavailable",
      reasonCode: "artifact_source_unavailable",
    },
  });
  assert.deepEqual(summary.items, []);
  assert.deepEqual(summary.artifactSource, {
    reasonCode: "artifact_source_unavailable",
    state: "unavailable",
  });
});

test("a denied artifact source is reported as restricted, not as empty", async () => {
  const summary = await compose({
    artifacts: { kind: "denied", reasonCode: "artifact_source_restricted" },
  });
  assert.deepEqual(summary.items, []);
  assert.deepEqual(summary.artifactSource, {
    reasonCode: "artifact_source_restricted",
    state: "restricted",
  });
});

test("a readable source with items is available", async () => {
  const summary = await compose({
    artifacts: { artifacts: oneArtifact, kind: "ok" },
  });
  assert.equal(summary.items.length, 1);
  assert.deepEqual(summary.artifactSource, {
    reasonCode: null,
    state: "available",
  });
});

test("a partial read is labelled partial and never silently complete", async () => {
  const summary = await compose({
    artifacts: { artifacts: oneArtifact, kind: "ok" },
    submission: {
      kind: "unavailable",
      reasonCode: "submission_source_unavailable",
    },
  });
  assert.equal(summary.items.length, 1);
  assert.deepEqual(summary.artifactSource, {
    reasonCode: "artifact_source_partial",
    state: "partial",
  });
});

test("a disabled submission source alone does not masquerade as an error", async () => {
  const summary = await compose({
    artifacts: { artifacts: oneArtifact, kind: "ok" },
    submission: {
      kind: "disabled",
      reasonCode: "submission_packages_disabled",
    },
  });
  assert.equal(summary.items.length, 1);
  assert.equal(summary.artifactSource.state, "partial");

  const nothingReadable = await compose({
    artifacts: { kind: "disabled", reasonCode: "artifact_source_disabled" },
    submission: {
      kind: "disabled",
      reasonCode: "submission_packages_disabled",
    },
  });
  assert.deepEqual(nothingReadable.artifactSource, {
    reasonCode: "artifact_source_disabled",
    state: "disabled",
  });
});

test("the composed payload carries no exception text or foreign identity", async () => {
  const summary = await compose({
    artifacts: {
      kind: "unavailable",
      reasonCode: "artifact_source_unavailable",
    },
  });
  const serialized = JSON.stringify(summary);
  assert.equal(
    /Error|stack|at Object|password|postgres/iu.test(serialized),
    false
  );
  assert.deepEqual(Object.keys(summary.artifactSource).sort(), [
    "reasonCode",
    "state",
  ]);
});
