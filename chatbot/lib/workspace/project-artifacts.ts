/**
 * Phase 13 M9-A R1-05 — read-only **references** to generated artifacts.
 *
 * The approved M9-A contract asks the document centre to reference existing generated
 * artifacts, not to pretend they are uploaded M2 files. This module turns metadata that
 * the accepted customer-scoped services already return into a bounded, stable reference
 * list:
 *
 *   - M5.1 school-application preparation packages (immutable, digest-addressed)
 *   - M6.2 Student 500 GS draft versions
 *   - M6.2 Student 500 preparation snapshots
 *
 * It adds **no** access: the caller only passes rows the owning service already
 * authorized for this actor. It copies no content, exposes no generated text and offers
 * no preview or download — a reference carries identity, version, status and digest
 * only, plus the existing workspace view that owns it, so navigation stays truthful.
 *
 * M8 submission packages have no customer-scoped aggregate listing (they are read per
 * target) and are default-OFF, so they are reported as an honest unsupported/disabled
 * kind rather than being invented.
 */

export const PROJECT_ARTIFACT_KINDS = [
  "school_application_package",
  "student500_gs_draft",
  "student500_snapshot",
  "submission_package",
] as const;
export type ProjectArtifactKind = (typeof PROJECT_ARTIFACT_KINDS)[number];

export const PROJECT_ARTIFACT_KIND_STATES = [
  "available",
  "disabled",
  "unsupported",
  "unavailable",
] as const;
export type ProjectArtifactKindState =
  (typeof PROJECT_ARTIFACT_KIND_STATES)[number];

export const PROJECT_ARTIFACT_OWNER_VIEWS = [
  "applications",
  "student500",
] as const;
export type ProjectArtifactOwnerView =
  (typeof PROJECT_ARTIFACT_OWNER_VIEWS)[number];

export type ProjectArtifactReference = {
  kind: ProjectArtifactKind;
  /** Real persisted id of the exact artifact version. */
  referenceId: string;
  version: number | null;
  /** The application the version belongs to (same Project, actor-authorized). */
  targetId: string | null;
  /** The owning service's own status vocabulary, never re-interpreted. */
  status: string | null;
  /** Manifest/content digest when the owning service exposes one. */
  digest: string | null;
  createdAt: string | null;
  stale: boolean;
  /** Existing workspace view that owns this artifact; navigation only. */
  ownerView: ProjectArtifactOwnerView;
};

export type ProjectArtifactsSummary = {
  references: ProjectArtifactReference[];
  /** True when the bounded cap dropped older references. */
  truncated: boolean;
  kinds: Record<ProjectArtifactKind, ProjectArtifactKindState>;
};

export const MAX_PROJECT_ARTIFACT_REFERENCES = 20;

export const EMPTY_PROJECT_ARTIFACTS: ProjectArtifactsSummary = {
  kinds: {
    school_application_package: "unsupported",
    student500_gs_draft: "unsupported",
    student500_snapshot: "unsupported",
    submission_package: "unsupported",
  },
  references: [],
  truncated: false,
};

export type SchoolApplicationArtifactInput = {
  applicationId: string;
  status: string;
  packages: readonly {
    packageId: string;
    version: number;
    status: string;
    contentSha256: string;
    createdAt: string;
    usable: boolean;
  }[];
};

export type Student500PreparationArtifactInput = {
  applicationId: string;
  drafts: readonly {
    draftId: string;
    version: number;
    contentSha256: string;
    createdAt: string;
    stale: boolean;
  }[];
  snapshots: readonly {
    snapshotId: string;
    version: number;
    contentSha256: string;
    createdAt: string;
    stale: boolean;
  }[];
};

export type ProjectArtifactsInput = {
  /** State of the M5.1 capability for this actor in this Project. */
  schoolApplications: ProjectArtifactKindState;
  schoolApplicationRows: readonly SchoolApplicationArtifactInput[];
  /** State of the M6.2 preparation capability for this actor in this Project. */
  student500: ProjectArtifactKindState;
  student500Rows: readonly Student500PreparationArtifactInput[];
  /** M8 submission packages: default-OFF and per-target only. */
  submissionPackages: ProjectArtifactKindState;
};

function compareDescending(
  left: ProjectArtifactReference,
  right: ProjectArtifactReference
): number {
  const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return (right.version ?? 0) - (left.version ?? 0);
}

/**
 * Build the bounded reference list.
 *
 * Archived applications are excluded (dismissed work is not an open artifact),
 * references are newest-first, and the total is capped. The kind states describe
 capability, so a Project with no artifacts still reports `available` for a readable
 * kind with an empty list — that is not an error and no placeholder row is invented.
 */
export function buildProjectArtifacts(
  input: ProjectArtifactsInput
): ProjectArtifactsSummary {
  const references: ProjectArtifactReference[] = [];

  if (input.schoolApplications === "available") {
    for (const application of input.schoolApplicationRows) {
      if (application.status === "archived") {
        continue;
      }
      for (const pkg of application.packages) {
        references.push({
          createdAt: pkg.createdAt,
          digest: pkg.contentSha256,
          kind: "school_application_package",
          ownerView: "applications",
          referenceId: pkg.packageId,
          stale: !pkg.usable,
          status: pkg.status,
          targetId: application.applicationId,
          version: pkg.version,
        });
      }
    }
  }

  if (input.student500 === "available") {
    for (const application of input.student500Rows) {
      for (const draft of application.drafts) {
        references.push({
          createdAt: draft.createdAt,
          digest: draft.contentSha256,
          kind: "student500_gs_draft",
          ownerView: "student500",
          referenceId: draft.draftId,
          stale: draft.stale,
          status: null,
          targetId: application.applicationId,
          version: draft.version,
        });
      }
      for (const snapshot of application.snapshots) {
        references.push({
          createdAt: snapshot.createdAt,
          digest: snapshot.contentSha256,
          kind: "student500_snapshot",
          ownerView: "student500",
          referenceId: snapshot.snapshotId,
          stale: snapshot.stale,
          status: null,
          targetId: application.applicationId,
          version: snapshot.version,
        });
      }
    }
  }

  references.sort(compareDescending);
  const capped = references.slice(0, MAX_PROJECT_ARTIFACT_REFERENCES);

  return {
    kinds: {
      school_application_package: input.schoolApplications,
      student500_gs_draft: input.student500,
      student500_snapshot: input.student500,
      submission_package: input.submissionPackages,
    },
    references: capped,
    truncated: references.length > capped.length,
  };
}
