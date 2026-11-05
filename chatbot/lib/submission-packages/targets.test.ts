/**
 * Phase 13 M8.1-R2 - exact-version school package review.
 *
 * The review the customer confirms must be the *frozen* M5.1 package version, not a
 * live summary. These tests drive the adapter with a fake M5.1 service, so they prove
 * the adapter's own contract: exact version passed through, hash mismatch refused,
 * upstream failure refused.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSchoolTargetReader } from "./targets";

const PROJECT = "22222222-2222-4222-8222-222222222801";
const APPLICATION = "33333333-3333-4333-8333-333333333801";
const PACKAGE = "55555555-5555-4555-8555-555555555801";
const CONTENT_HASH = "a".repeat(64);
const ACTOR = "11111111-1111-4111-8111-111111111801";

function detail() {
  return {
    applicationId: APPLICATION,
    course: { title: "Master of Data Science" },
    currentPackage: {
      contentSha256: CONTENT_HASH,
      packageId: PACKAGE,
      targetBindingSha256: "b".repeat(64),
      usable: true,
      version: 2,
    },
    institution: { catalogRecordClass: "verified", name: "Example University" },
    intake: { label: "2027 February" },
    missingDataCodes: [],
    references: [
      {
        kind: "transcript",
        referenceId: "r1",
        referenceSha256: "c".repeat(64),
        referenceVersion: 3,
      },
    ],
    revision: 4,
    source: { status: "verified_current" },
    status: "in_progress",
  } as const;
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    admissionStatus: "no_decision",
    applicationId: APPLICATION,
    applicationRevision: 4,
    coeStatus: "no_coe",
    course: { catalogId: null, title: "Master of Data Science" },
    deliveryId: null,
    disclosures: ["not_submitted_to_any_authority"],
    inputsSha256: "d".repeat(64),
    institution: {
      catalogId: null,
      catalogRecordClass: "verified",
      catalogSnapshotToken: null,
      name: "Example University",
      sourceStatus: "verified_current",
    },
    intake: { id: null, label: "2027 February" },
    missingDataCodes: [],
    offerStatus: "no_offer",
    packageVersion: 2,
    professionalReviewStatus: "not_requested",
    projectId: PROJECT,
    references: [
      {
        kind: "transcript",
        referenceId: "r1",
        referenceSha256: "c".repeat(64),
        referenceVersion: 3,
      },
    ],
    schema: "phase13.m5.school-application-package.v1",
    submissionStatus: "not_submitted",
    target: {
      id: APPLICATION,
      kind: "managed_school_application",
      sha256: CONTENT_HASH,
      version: 2,
    },
    ...overrides,
  };
}

test("the school review is the exact frozen version requested from M5.1", async () => {
  const calls: unknown[] = [];
  const reader = createSchoolTargetReader({
    school: {
      get: async () => detail(),
      readPackageSnapshot: (input: unknown) => {
        calls.push(input);
        return Promise.resolve({
          contentSha256: CONTENT_HASH,
          packageId: PACKAGE,
          reasonCode: "ok",
          snapshot: snapshot(),
          version: 2,
        });
      },
    } as never,
  });

  const state = await reader({
    actorUserId: ACTOR,
    projectId: PROJECT,
    targetId: APPLICATION,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    actorUserId: ACTOR,
    applicationId: APPLICATION,
    contentSha256: CONTENT_HASH,
    packageId: PACKAGE,
    projectId: PROJECT,
    version: 2,
  });
  assert.ok(state.review);
  assert.equal(state.review.source, "pinned_school_package_version");
  const packageSection = state.review.sections.find(
    (section) => section.key === "package"
  );
  assert.ok(packageSection);
  const labels = packageSection.lines.map((line) => line.label);
  assert.ok(labels.includes("Package version"));
  assert.ok(labels.includes("Prepared references"));
  const versionLine = packageSection.lines.find(
    (line) => line.label === "Package version"
  );
  assert.equal(versionLine?.value, "2");
  assert.equal(state.reviewUnavailableReason, null);
});

test("a hash or version mismatch hides the review and blocks confirmation", async () => {
  for (const reasonCode of [
    "content_changed",
    "version_mismatch",
    "package_not_found",
  ] as const) {
    const reader = createSchoolTargetReader({
      school: {
        get: async () => detail(),
        readPackageSnapshot: () =>
          Promise.resolve({
            contentSha256: CONTENT_HASH,
            packageId: PACKAGE,
            reasonCode,
            snapshot: null,
            version: 2,
          }),
      } as never,
    });
    const state = await reader({
      actorUserId: ACTOR,
      projectId: PROJECT,
      targetId: APPLICATION,
    });
    assert.equal(state.review, null, `review must be null for ${reasonCode}`);
    assert.equal(
      state.reviewUnavailableReason,
      reasonCode === "package_not_found"
        ? "source_unavailable"
        : "school_package_changed"
    );
  }
});

test("an upstream failure during the exact read is fail-closed, not a summary", async () => {
  const reader = createSchoolTargetReader({
    school: {
      get: async () => detail(),
      readPackageSnapshot: () =>
        Promise.reject(new Error("upstream unavailable")),
    } as never,
  });
  const state = await reader({
    actorUserId: ACTOR,
    projectId: PROJECT,
    targetId: APPLICATION,
  });
  assert.equal(state.review, null);
  assert.equal(state.reviewUnavailableReason, "source_unavailable");
  // The dependency identity is still frozen, so the package can be built and later
  // reviewed once the source is readable again - but never confirmed while unreadable.
  assert.equal(state.dependencies.schoolPackage?.packageId, PACKAGE);
});
