import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeSchoolApplications } from "./project-workspace-summaries";
import { parseProjectWorkspaceSummary } from "./project-workspace-summary-client";

const validSummary = {
  artifacts: {
    kinds: {
      school_application_package: "available",
      student500_gs_draft: "available",
      student500_snapshot: "available",
      submission_package: "disabled",
    },
    references: [
      {
        createdAt: "2026-11-01T00:00:00.000Z",
        digest: "a".repeat(64),
        kind: "school_application_package",
        ownerView: "applications",
        referenceId: "package-1",
        stale: false,
        status: "current",
        targetId: "44444444-4444-4444-8444-444444444444",
        version: 1,
      },
    ],
    truncated: false,
  },
  documents: { state: "disabled", summary: null },
  projectId: "11111111-1111-4111-8111-111111111111",
  projectStatus: "active",
  revision: 4,
  schoolApplications: {
    state: "available",
    summary: {
      archived: 1,
      draft: 1,
      missingInformation: 0,
      packagePrepared: 0,
      preparing: 0,
      stale: 0,
      stalePackages: 0,
      total: 2,
    },
  },
  stageChats: {
    bindings: [
      {
        chatId: "22222222-2222-4222-8222-222222222222",
        stageKey: "student500",
      },
    ],
    state: "available",
  },
  student500: { state: "restricted", summary: null },
};

test("a valid projection is parsed strictly", () => {
  const parsed = parseProjectWorkspaceSummary(validSummary);
  assert.ok(parsed);
  assert.equal(parsed.revision, 4);
  assert.equal(parsed.schoolApplications.state, "available");
  assert.equal(parsed.schoolApplications.summary?.total, 2);
  assert.equal(parsed.student500.state, "restricted");
  assert.equal(parsed.student500.summary, null);
  assert.deepEqual(parsed.stageChats.bindings, [
    {
      chatId: "22222222-2222-4222-8222-222222222222",
      stageKey: "student500",
    },
  ]);
});

test("an unexpected shape is rejected instead of being coerced", () => {
  // A blocked capability may never carry numbers: that is how a fabricated progress
  // indicator would reach the customer.
  assert.equal(
    parseProjectWorkspaceSummary({
      ...validSummary,
      documents: {
        state: "unavailable",
        summary: validSummary.schoolApplications.summary,
      },
    }),
    null
  );
  // Unknown capability vocabulary.
  assert.equal(
    parseProjectWorkspaceSummary({
      ...validSummary,
      student500: { state: "ready", summary: null },
    }),
    null
  );
  // An artifact kind state the server never sends is refused rather than guessed.
  assert.equal(
    parseProjectWorkspaceSummary({
      ...validSummary,
      artifacts: {
        ...validSummary.artifacts,
        kinds: {
          ...validSummary.artifacts.kinds,
          submission_package: "maybe",
        },
      },
    }),
    null
  );
  // An artifact reference with an unknown kind or owner view is refused.
  assert.equal(
    parseProjectWorkspaceSummary({
      ...validSummary,
      artifacts: {
        ...validSummary.artifacts,
        references: [
          { ...validSummary.artifacts.references[0], kind: "matter_document" },
        ],
      },
    }),
    null
  );
  assert.equal(
    parseProjectWorkspaceSummary({
      ...validSummary,
      artifacts: {
        ...validSummary.artifacts,
        references: [
          { ...validSummary.artifacts.references[0], ownerView: "documents" },
        ],
      },
    }),
    null
  );
  // A reference without an exact identity is refused.
  assert.equal(
    parseProjectWorkspaceSummary({
      ...validSummary,
      artifacts: {
        ...validSummary.artifacts,
        references: [
          { ...validSummary.artifacts.references[0], referenceId: 5 },
        ],
      },
    }),
    null
  );
  // A missing artifacts projection is refused: the reference list is not optional.
  const { artifacts: _omitted, ...withoutArtifacts } = validSummary;
  assert.equal(parseProjectWorkspaceSummary(withoutArtifacts), null);
  // Missing counter.
  assert.equal(
    parseProjectWorkspaceSummary({
      ...validSummary,
      schoolApplications: {
        state: "available",
        summary: { total: 1, draft: 1 },
      },
    }),
    null
  );
  // Negative / non-integer counters.
  assert.equal(
    parseProjectWorkspaceSummary({
      ...validSummary,
      schoolApplications: {
        state: "available",
        summary: { ...validSummary.schoolApplications.summary, total: -1 },
      },
    }),
    null
  );
  // A binding for a step that is not in the closed vocabulary.
  assert.equal(
    parseProjectWorkspaceSummary({
      ...validSummary,
      stageChats: {
        bindings: [{ chatId: "x", stageKey: "workflow_step_9" }],
        state: "available",
      },
    }),
    null
  );
  // Unknown Project status, missing Project id.
  assert.equal(
    parseProjectWorkspaceSummary({ ...validSummary, projectStatus: "draft" }),
    null
  );
  assert.equal(
    parseProjectWorkspaceSummary({ ...validSummary, projectId: undefined }),
    null
  );
});

test("summaries count real states and exclude archived records from open work", () => {
  const counts = summarizeSchoolApplications([
    { missingDataCodes: ["intake"], status: "draft" },
    { packageStale: true, status: "package_prepared" },
    { status: "archived" },
    { missingDataCodes: [], status: "preparing" },
  ]);
  assert.equal(counts.total, 4);
  assert.equal(counts.archived, 1);
  assert.equal(counts.draft, 1);
  assert.equal(counts.preparing, 1);
  assert.equal(counts.packagePrepared, 1);
  assert.equal(counts.missingInformation, 1);
  assert.equal(counts.stalePackages, 1);
});
