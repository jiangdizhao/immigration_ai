import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_PROJECT_ARTIFACTS } from "./project-artifacts";
import {
  deriveProjectStages,
  PROJECT_STAGE_KEYS,
  PROJECT_STAGE_VIEWS,
  projectStageStatus,
  stageSignalsFromSummary,
} from "./project-stages";
import type { ProjectWorkspaceSummary } from "./project-workspace-summary";

const summary: ProjectWorkspaceSummary = {
  artifacts: EMPTY_PROJECT_ARTIFACTS,
  documents: { state: "disabled", summary: null },
  projectId: "11111111-1111-4111-8111-111111111111",
  projectStatus: "active",
  revision: 3,
  schoolApplications: {
    state: "available",
    summary: {
      archived: 1,
      draft: 2,
      missingInformation: 1,
      packagePrepared: 0,
      preparing: 0,
      stale: 0,
      stalePackages: 0,
      total: 3,
    },
  },
  stageChats: { bindings: [], state: "available" },
  student500: {
    state: "available",
    summary: {
      archived: 0,
      draft: 0,
      humanReviewRequired: 0,
      inProgress: 1,
      missingFacts: 0,
      screeningIncomplete: 1,
      screeningPendingReview: 0,
      total: 1,
    },
  },
};

test("only the real workspace surfaces are stages and each maps to a section", () => {
  assert.deepEqual(
    [...PROJECT_STAGE_KEYS],
    ["applications", "admissions", "student500", "documents"]
  );
  assert.equal(PROJECT_STAGE_VIEWS.applications, "applications");
  assert.equal(PROJECT_STAGE_VIEWS.admissions, "admissions");
  assert.equal(PROJECT_STAGE_VIEWS.student500, "student500");
  assert.equal(PROJECT_STAGE_VIEWS.documents, "documents");
});

test("a status is derived from real capability and counts, never from a percentage", () => {
  assert.equal(
    projectStageStatus({ capability: "available", count: 0 }),
    "not_started"
  );
  assert.equal(
    projectStageStatus({ capability: "available", count: 2 }),
    "in_progress"
  );
  assert.equal(
    projectStageStatus({
      capability: "available",
      count: 2,
      needsAttention: 1,
    }),
    "needs_information"
  );
  // An unreadable capability is blocked, never "complete" and never zero.
  for (const capability of ["disabled", "restricted", "unavailable"] as const) {
    assert.equal(projectStageStatus({ capability, count: null }), "blocked");
    assert.equal(projectStageStatus({ capability, count: 0 }), "blocked");
  }
  // A readable capability with no denominator stays unknown.
  assert.equal(
    projectStageStatus({ capability: "available", count: null }),
    "unknown"
  );
});

test("the navigation model separates archived records from open work", () => {
  const signals = stageSignalsFromSummary({
    admissionsCapability: "available",
    summary,
  });
  // 3 applications, 1 archived → 2 open; 1 missing information.
  assert.equal(signals.applications.count, 2);
  assert.equal(signals.applications.needsAttention, 1);
  // Student 500 counts one open record and no attention reason.
  assert.equal(signals.student500.count, 1);
  assert.equal(signals.student500.needsAttention, 0);
  // A blocked capability reports no number at all.
  assert.equal(signals.documents.capability, "disabled");
  assert.equal(signals.documents.count, null);
  // Admissions has no aggregate read model, so it never reports a count.
  assert.equal(signals.admissions.count, null);

  const stages = deriveProjectStages({
    boundStageKeys: ["student500"],
    signals,
    stageChatsAvailable: true,
  });
  const applications = stages.find((stage) => stage.key === "applications");
  const admissions = stages.find((stage) => stage.key === "admissions");
  const student500 = stages.find((stage) => stage.key === "student500");
  const documents = stages.find((stage) => stage.key === "documents");
  assert.equal(applications?.status, "needs_information");
  assert.equal(admissions?.status, "unknown");
  assert.equal(student500?.status, "in_progress");
  assert.equal(documents?.status, "blocked");
  // Only a real workflow step can own a step conversation.
  assert.equal(student500?.conversation.stageKey, "student500");
  assert.equal(student500?.conversation.bound, true);
  assert.equal(documents?.conversation.stageKey, null);
  assert.equal(documents?.conversation.available, false);
});

test("step conversations are unavailable while the binding schema is missing", () => {
  const stages = deriveProjectStages({
    boundStageKeys: [],
    signals: stageSignalsFromSummary({
      admissionsCapability: "restricted",
      summary,
    }),
    stageChatsAvailable: false,
  });
  for (const stage of stages) {
    if (stage.conversation.stageKey) {
      assert.equal(stage.conversation.available, false);
    }
  }
  assert.equal(
    stages.find((stage) => stage.key === "admissions")?.capability,
    "restricted"
  );
});

test("no stage invents a completion total or a readiness claim", () => {
  const stages = deriveProjectStages({
    boundStageKeys: [],
    signals: stageSignalsFromSummary({
      admissionsCapability: "available",
      summary,
    }),
    stageChatsAvailable: true,
  });
  for (const stage of stages) {
    assert.ok(
      stage.status !== ("complete" as unknown as typeof stage.status),
      "a stage must never be reported as complete"
    );
  }
});
