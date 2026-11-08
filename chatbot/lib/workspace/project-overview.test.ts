import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_PROJECT_ARTIFACTS } from "./project-artifacts";
import { deriveProjectOverview } from "./project-overview";
import { deriveProjectStages, stageSignalsFromSummary } from "./project-stages";
import type { ProjectWorkspaceSummary } from "./project-workspace-summary";

const base: ProjectWorkspaceSummary = {
  artifacts: EMPTY_PROJECT_ARTIFACTS,
  documents: { state: "disabled", summary: null },
  projectId: "11111111-1111-4111-8111-111111111111",
  projectStatus: "active",
  revision: 1,
  schoolApplications: {
    state: "available",
    summary: {
      archived: 0,
      draft: 1,
      missingInformation: 1,
      packagePrepared: 0,
      preparing: 0,
      stale: 0,
      stalePackages: 1,
      total: 1,
    },
  },
  stageChats: { bindings: [], state: "available" },
  student500: {
    state: "available",
    summary: {
      archived: 0,
      draft: 0,
      humanReviewRequired: 1,
      inProgress: 0,
      missingFacts: 1,
      screeningIncomplete: 0,
      screeningPendingReview: 1,
      total: 1,
    },
  },
};

function overviewFor(summary: ProjectWorkspaceSummary, submission = false) {
  const stages = deriveProjectStages({
    boundStageKeys: [],
    signals: stageSignalsFromSummary({
      admissionsCapability: "available",
      summary,
    }),
    stageChatsAvailable: summary.stageChats.state === "available",
  });
  return deriveProjectOverview({
    stages,
    submissionCapabilityEnabled: submission,
    summary,
  });
}

test("preparation counts come only from readable stages", () => {
  const overview = overviewFor(base);
  // Admissions has no aggregate read model, so only applications + Student 500 and
  // the (blocked) document centre exist: two readable areas out of four.
  assert.equal(overview.preparation.readableStages, 2);
  assert.equal(overview.preparation.totalStages, 4);
  assert.equal(overview.preparation.openItems, 2);
  // 2 school-application attention reasons + 2 Student 500 attention reasons.
  assert.equal(overview.preparation.needsAttention, 4);
  assert.equal(overview.preparation.state, "needs_information");
});

test("an unreadable Project reports no counts instead of zero progress", () => {
  const overview = overviewFor({
    ...base,
    schoolApplications: { state: "unavailable", summary: null },
    stageChats: { bindings: [], state: "unavailable" },
    student500: { state: "disabled", summary: null },
  });
  assert.equal(overview.preparation.readableStages, 0);
  assert.equal(overview.preparation.openItems, null);
  assert.equal(overview.preparation.needsAttention, null);
  assert.equal(overview.preparation.state, "unknown");
  assert.equal(overview.nextAction.kind, "none");
});

test("submission readiness is separate from preparation and never inferred", () => {
  const disabled = overviewFor(base, false);
  assert.deepEqual(disabled.readiness, {
    reason: "submission_capability_disabled",
    state: "unavailable",
  });
  // Even with the capability enabled no readiness is claimed from counts.
  const enabled = overviewFor(base, true);
  assert.deepEqual(enabled.readiness, {
    reason: "no_authoritative_signal",
    state: "not_assessed",
  });
});

test("blockers are real persisted signals, not invented risk", () => {
  const overview = overviewFor(base);
  assert.deepEqual(overview.blockers, [
    "documents_unavailable",
    "school_application_missing_information",
    "school_application_package_stale",
    "student500_missing_facts",
    "student500_human_review_required",
  ]);
  // A fully readable Project with nothing open reports no blocker.
  const clean = overviewFor({
    ...base,
    documents: {
      state: "available",
      summary: {
        active: 0,
        cleanupPending: 0,
        securityClean: 0,
        securityFailed: 0,
        securityPending: 0,
        securityRejected: 0,
        storageFailed: 0,
        storagePending: 0,
        storageStored: 0,
        total: 0,
        withdrawn: 0,
      },
    },
    schoolApplications: {
      state: "available",
      summary: {
        archived: 0,
        draft: 0,
        missingInformation: 0,
        packagePrepared: 0,
        preparing: 0,
        stale: 0,
        stalePackages: 0,
        total: 0,
      },
    },
    student500: {
      state: "available",
      summary: {
        archived: 0,
        draft: 0,
        humanReviewRequired: 0,
        inProgress: 0,
        missingFacts: 0,
        screeningIncomplete: 0,
        screeningPendingReview: 0,
        total: 0,
      },
    },
  });
  assert.deepEqual(clean.blockers, []);
});

test("the next action is one deterministic, real step", () => {
  // Missing information outranks starting an empty step.
  assert.deepEqual(overviewFor(base).nextAction, {
    kind: "open_stage",
    reason: "needs_information",
    stageKey: "applications",
  });
  const empty = overviewFor({
    ...base,
    schoolApplications: {
      state: "available",
      summary: {
        archived: 0,
        draft: 0,
        missingInformation: 0,
        packagePrepared: 0,
        preparing: 0,
        stale: 0,
        stalePackages: 0,
        total: 0,
      },
    },
    student500: {
      state: "available",
      summary: {
        archived: 0,
        draft: 0,
        humanReviewRequired: 0,
        inProgress: 0,
        missingFacts: 0,
        screeningIncomplete: 0,
        screeningPendingReview: 0,
        total: 0,
      },
    },
  });
  assert.deepEqual(empty.nextAction, {
    kind: "open_stage",
    reason: "not_started",
    stageKey: "applications",
  });
});
