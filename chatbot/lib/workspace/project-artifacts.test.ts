import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProjectArtifacts,
  EMPTY_PROJECT_ARTIFACTS,
  MAX_PROJECT_ARTIFACT_REFERENCES,
  type ProjectArtifactsInput,
} from "./project-artifacts";

/**
 * Phase 13 M9-A R1-05 — the artifact projection must be a *reference* list: identity,
 * version, status, digest and the owning view. It must never copy content, invent an
 * artifact type that no service exposes, or turn "capability closed" into an empty list
 * that looks like "nothing to do".
 */

const application = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const student500Application = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function input(
  overrides: Partial<ProjectArtifactsInput> = {}
): ProjectArtifactsInput {
  return {
    schoolApplicationRows: [
      {
        applicationId: application,
        packages: [
          {
            contentSha256: "c".repeat(64),
            createdAt: "2026-11-01T00:00:00.000Z",
            packageId: "package-1",
            status: "current",
            usable: true,
            version: 1,
          },
        ],
        status: "package_prepared",
      },
    ],
    schoolApplications: "available",
    student500: "available",
    student500Rows: [
      {
        applicationId: student500Application,
        drafts: [
          {
            contentSha256: "d".repeat(64),
            createdAt: "2026-11-02T00:00:00.000Z",
            draftId: "draft-2",
            stale: false,
            version: 2,
          },
        ],
        snapshots: [
          {
            contentSha256: "e".repeat(64),
            createdAt: "2026-11-03T00:00:00.000Z",
            snapshotId: "snapshot-1",
            stale: true,
            version: 1,
          },
        ],
      },
    ],
    submissionPackages: "disabled",
    ...overrides,
  };
}

test("references carry identity, version, status, digest and the owning view only", () => {
  const artifacts = buildProjectArtifacts(input());
  assert.equal(artifacts.references.length, 3);
  const pkg = artifacts.references.find(
    (reference) => reference.kind === "school_application_package"
  );
  assert.deepEqual(pkg, {
    createdAt: "2026-11-01T00:00:00.000Z",
    digest: "c".repeat(64),
    kind: "school_application_package",
    ownerView: "applications",
    referenceId: "package-1",
    stale: false,
    status: "current",
    targetId: application,
    version: 1,
  });
  // Newest first: snapshot (11-03) → draft (11-02) → package (11-01).
  assert.deepEqual(
    artifacts.references.map((reference) => reference.kind),
    ["student500_snapshot", "student500_gs_draft", "school_application_package"]
  );
  // No field can carry artifact content.
  for (const reference of artifacts.references) {
    assert.equal(
      Object.keys(reference).some((key) =>
        ["content", "text", "body", "sections", "preview"].includes(key)
      ),
      false
    );
  }
});

test("kind states report capability, not emptiness", () => {
  const artifacts = buildProjectArtifacts(
    input({ schoolApplicationRows: [], student500Rows: [] })
  );
  assert.deepEqual(artifacts.references, []);
  // A readable kind with no artifacts is still `available`, so the UI can distinguish
  // "nothing generated yet" from "cannot read".
  assert.equal(artifacts.kinds.school_application_package, "available");
  assert.equal(artifacts.kinds.student500_gs_draft, "available");
  assert.equal(artifacts.kinds.student500_snapshot, "available");
  assert.equal(artifacts.kinds.submission_package, "disabled");

  const closed = buildProjectArtifacts(
    input({
      schoolApplications: "disabled",
      student500: "unavailable",
      student500Rows: [],
      submissionPackages: "unsupported",
    })
  );
  assert.equal(closed.kinds.school_application_package, "disabled");
  assert.equal(closed.kinds.student500_gs_draft, "unavailable");
  assert.equal(closed.kinds.student500_snapshot, "unavailable");
  assert.equal(closed.kinds.submission_package, "unsupported");
  // A closed capability contributes no references even if rows were somehow supplied.
  assert.deepEqual(closed.references, []);
});

test("archived applications are excluded and the list is bounded", () => {
  const archived = buildProjectArtifacts(
    input({
      schoolApplicationRows: [
        { ...input().schoolApplicationRows[0], status: "archived" },
      ],
    })
  );
  assert.equal(
    archived.references.some(
      (reference) => reference.kind === "school_application_package"
    ),
    false
  );

  const many = buildProjectArtifacts(
    input({
      schoolApplicationRows: [
        {
          applicationId: application,
          packages: Array.from(
            { length: MAX_PROJECT_ARTIFACT_REFERENCES + 5 },
            (_unused, index) => ({
              contentSha256: "f".repeat(64),
              createdAt: `2026-11-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
              packageId: `package-${index}`,
              status: "superseded",
              usable: false,
              version: index + 1,
            })
          ),
          status: "preparing",
        },
      ],
      student500Rows: [],
    })
  );
  assert.equal(many.references.length, MAX_PROJECT_ARTIFACT_REFERENCES);
  assert.equal(many.truncated, true);
  // Only metadata-only kinds are ever referenced; submission packages never appear.
  assert.equal(
    many.references.some(
      (reference) => reference.kind === "submission_package"
    ),
    false
  );
});

test("the empty projection is explicitly unsupported rather than falsely available", () => {
  assert.deepEqual(EMPTY_PROJECT_ARTIFACTS.references, []);
  assert.equal(EMPTY_PROJECT_ARTIFACTS.truncated, false);
  for (const state of Object.values(EMPTY_PROJECT_ARTIFACTS.kinds)) {
    assert.equal(state, "unsupported");
  }
});
