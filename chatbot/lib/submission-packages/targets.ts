import type { ManagedTargetKind } from "@/lib/managed-target/policy";
import type { SchoolApplicationService } from "@/lib/school-applications/service";
import type { Student500PreparationService } from "@/lib/student-500/preparation/service";
import { SubmissionPackageError } from "./contracts";
import type {
  SubmissionDependencies,
  SubmissionFactReferenceIdentity,
  SubmissionGsDraftIdentity,
  SubmissionIndicator,
  SubmissionTargetReader,
  SubmissionTargetState,
} from "./ports";

/**
 * Phase 13 M8.1 - target adapters.
 *
 * Two narrow adapters over the accepted upstream services. They translate live
 * state into the shared dependency identity set and the non-sensitive content
 * summary M8 freezes. Neither adapter decides anything legal, and neither copies
 * document bodies, fact values, chat content or GS section text: a package
 * references the pinned immutable upstream versions instead.
 */

/** The accepted M5.1 detail read is the only school authority M8 uses. */
export type SchoolTargetSource = {
  readonly get: SchoolApplicationService["get"];
  /**
   * Exact-version immutable package snapshot, authorized and hash-verified by M5.1.
   * Used only to show the customer what they are confirming.
   */
  readonly readPackageSnapshot: SchoolApplicationService["readPackageSnapshot"];
};

/** The accepted M6.2 preparation read is the only Student 500 authority M8 uses. */
export type Student500TargetSource = {
  readonly get: Student500PreparationService["get"];
  /** Exact pinned draft version, redacted for the current actor by M6.2. */
  readonly getDraft: Student500PreparationService["getDraft"];
};

export function student500DraftIdentity(draft: {
  readonly draftId: string;
  readonly version: number;
  readonly contentSha256: string;
  readonly redactedSectionCount: number;
  readonly sections: readonly {
    readonly sectionKey: string;
    readonly heading: string;
    readonly missingInformation: readonly string[];
  }[];
}): SubmissionGsDraftIdentity {
  return {
    contentSha256: draft.contentSha256,
    draftId: draft.draftId,
    missingInformation: [
      ...new Set(
        draft.sections.flatMap((section) => section.missingInformation)
      ),
    ].sort(),
    redactedSectionCount: draft.redactedSectionCount,
    sectionHeadings: draft.sections.map((section) => section.heading),
    sectionKeys: draft.sections.map((section) => section.sectionKey),
    version: draft.version,
  };
}

function wrapTargetError(error: unknown): never {
  if (error instanceof SubmissionPackageError) {
    throw error;
  }
  // This is the single place a bare, uncoded upstream failure is normalized.
  throw new SubmissionPackageError("source_unavailable");
}

export function createSchoolTargetReader(input: {
  readonly school: SchoolTargetSource;
}): (args: {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetId: string;
}) => Promise<SubmissionTargetState> {
  return async (args) => {
    let detail: Awaited<ReturnType<SchoolTargetSource["get"]>>;
    try {
      detail = await input.school.get({
        actorUserId: args.actorUserId,
        applicationId: args.targetId,
        projectId: args.projectId,
      });
    } catch (error) {
      wrapTargetError(error);
    }
    const currentPackage = detail.currentPackage;
    const dependencies: SubmissionDependencies = {
      applicationRevision: detail.revision,
      applicationStatus: detail.status,
      factReferences: [],
      gsDraft: null,
      legalSourceRevision: null,
      preparationSnapshot: null,
      schoolPackage: currentPackage
        ? {
            contentSha256: currentPackage.contentSha256,
            packageId: currentPackage.packageId,
            targetBindingSha256: currentPackage.targetBindingSha256,
            usable: currentPackage.usable,
            version: currentPackage.version,
          }
        : null,
      sourceAvailability:
        currentPackage === null
          ? "unavailable"
          : currentPackage.usable
            ? "available"
            : "partially_unavailable",
    };
    const indicators: SubmissionIndicator[] = [
      ...detail.missingDataCodes.map((code) => ({
        code,
        kind: "missing" as const,
      })),
      ...(detail.source.status.startsWith("verified")
        ? []
        : [{ code: detail.source.status, kind: "unverified" as const }]),
      ...(currentPackage === null
        ? [{ code: "school_package_absent", kind: "missing" as const }]
        : currentPackage.usable
          ? []
          : [{ code: "school_package_not_current", kind: "unknown" as const }]),
      { code: "documents_trust_unavailable", kind: "unknown" as const },
    ];
    // The reviewed content is the *exact* immutable M5.1 package version the manifest
    // pins, read back through M5.1's own authorization and re-verified against its
    // recorded content hash. If that version cannot be reconstructed under current
    // authorization the review is null and confirmation fails closed; a live summary
    // is never substituted for the frozen content.
    let review: SubmissionTargetState["review"] = null;
    let reviewUnavailableReason: SubmissionTargetState["reviewUnavailableReason"] =
      null;
    if (currentPackage === null) {
      reviewUnavailableReason = "source_unavailable";
    } else {
      try {
        const pinned = await input.school.readPackageSnapshot({
          actorUserId: args.actorUserId,
          applicationId: args.targetId,
          contentSha256: currentPackage.contentSha256,
          packageId: currentPackage.packageId,
          projectId: args.projectId,
          version: currentPackage.version,
        });
        const snapshot = pinned.snapshot;
        if (pinned.reasonCode !== "ok" || snapshot === null) {
          reviewUnavailableReason =
            pinned.reasonCode === "content_changed" ||
            pinned.reasonCode === "version_mismatch"
              ? "school_package_changed"
              : "source_unavailable";
        } else {
          review = {
            gsDraft: null,
            sections: [
              {
                heading: "Institution and course",
                key: "institution",
                lines: [
                  { label: "Institution", value: snapshot.institution.name },
                  { label: "Course", value: snapshot.course.title },
                  {
                    label: "Intake",
                    value: snapshot.intake.label ?? "not specified",
                  },
                  {
                    label: "Source status",
                    value: snapshot.institution.sourceStatus,
                  },
                ],
              },
              {
                heading: "Frozen package version",
                key: "package",
                lines: [
                  {
                    label: "Package version",
                    value: String(snapshot.packageVersion),
                  },
                  {
                    label: "Application revision",
                    value: String(snapshot.applicationRevision),
                  },
                  {
                    label: "Prepared references",
                    value:
                      snapshot.references.length === 0
                        ? "none"
                        : snapshot.references
                            .map(
                              (reference) =>
                                `${reference.kind} v${reference.referenceVersion}`
                            )
                            .join(", "),
                  },
                  {
                    label: "Missing information",
                    value:
                      snapshot.missingDataCodes.length === 0
                        ? "none"
                        : snapshot.missingDataCodes.join(", "),
                  },
                  {
                    label: "Disclosures",
                    value:
                      snapshot.disclosures.length === 0
                        ? "none"
                        : snapshot.disclosures.join(", "),
                  },
                  {
                    label: "Submission status",
                    value: snapshot.submissionStatus,
                  },
                  {
                    label: "Professional review",
                    value: snapshot.professionalReviewStatus,
                  },
                ],
              },
            ],
            source: "pinned_school_package_version" as const,
            title: `${snapshot.institution.name} - ${snapshot.course.title}`,
          };
        }
      } catch {
        reviewUnavailableReason = "source_unavailable";
      }
    }
    return {
      archived: detail.status === "archived",
      content: {
        applicationRevision: detail.revision,
        applicationStatus: detail.status,
        school: {
          catalogRecordClass: detail.institution.catalogRecordClass,
          courseTitle: detail.course.title,
          institutionName: detail.institution.name,
          intakeLabel: detail.intake.label,
          referenceCount: detail.references.length,
          sourceStatus: detail.source.status,
        },
        student500: null,
        targetLabel: "school_application",
        title: `${detail.institution.name} - ${detail.course.title}`,
      },
      dependencies,
      indicators,
      review,
      reviewUnavailableReason,
      targetId: detail.applicationId,
      targetKind: "managed_school_application",
      targetVersion: detail.revision,
    };
  };
}

export function createStudent500TargetReader(input: {
  readonly student500: Student500TargetSource;
}): (args: {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly targetId: string;
}) => Promise<SubmissionTargetState> {
  return async (args) => {
    let view: Awaited<ReturnType<Student500TargetSource["get"]>>;
    try {
      view = await input.student500.get({
        actorUserId: args.actorUserId,
        applicationId: args.targetId,
        projectId: args.projectId,
      });
    } catch (error) {
      wrapTargetError(error);
    }
    // Only references that are authorized and currently visible may be frozen. A
    // reference that is not readable right now is not included at all, so a package
    // can never imply access the actor does not have.
    const factReferences: SubmissionFactReferenceIdentity[] = view.selectedFacts
      .filter(
        (fact) =>
          fact.revokedAt === null &&
          fact.aiUseAuthorized &&
          fact.currentState === "covered_by_authorized_fact"
      )
      .map((fact) => ({
        factAssertionId: fact.factAssertionId,
        factKey: fact.factKey,
        factReferenceId: fact.factReferenceId,
        factVersion: fact.factVersion,
      }));
    const gsDraft = view.latestDraft
      ? student500DraftIdentity(view.latestDraft)
      : null;
    const dependencies: SubmissionDependencies = {
      applicationRevision: view.applicationRevision,
      applicationStatus: view.applicationStatus,
      factReferences,
      gsDraft,
      legalSourceRevision: view.legalSourceRevision,
      preparationSnapshot: view.latestSnapshot
        ? {
            contentSha256: view.latestSnapshot.contentSha256,
            legalSourceRevision: view.latestSnapshot.legalSourceRevision,
            snapshotId: view.latestSnapshot.snapshotId,
            version: view.latestSnapshot.version,
          }
        : null,
      schoolPackage: null,
      sourceAvailability: "available",
    };
    const indicators: SubmissionIndicator[] = [
      ...(gsDraft === null
        ? [{ code: "gs_draft_absent", kind: "missing" as const }]
        : []),
      ...(gsDraft !== null && gsDraft.redactedSectionCount > 0
        ? [{ code: "gs_draft_sections_redacted", kind: "unknown" as const }]
        : []),
      ...(view.reconciliation.counts.missing > 0
        ? [{ code: "missing_evidence", kind: "missing" as const }]
        : []),
      ...(view.reconciliation.conflictCount > 0
        ? [{ code: "fact_conflict", kind: "conflicted" as const }]
        : []),
      ...(view.reconciliation.requirements.some(
        (requirement) => requirement.humanReviewRequired
      )
        ? [{ code: "human_review_required", kind: "unverified" as const }]
        : []),
      { code: "legal_source_coverage_partial", kind: "unverified" as const },
      { code: "documents_trust_unavailable", kind: "unknown" as const },
    ];
    let review: SubmissionTargetState["review"] = null;
    let reviewUnavailableReason: SubmissionTargetState["reviewUnavailableReason"] =
      null;
    const summarySections = [
      {
        heading: "Application",
        key: "application",
        lines: [
          { label: "Application place", value: view.context.applicationPlace },
          { label: "Entry route", value: view.context.entryRoute ?? "-" },
          { label: "CoE status", value: view.context.coeStatus },
        ],
      },
    ];
    if (view.latestDraft === null) {
      // No GS draft exists yet: the review is the application summary itself.
      review = {
        gsDraft: null,
        sections: summarySections,
        source: "pinned_gs_draft_version",
        title: "Student 500 application",
      };
    } else {
      try {
        const pinned = await input.student500.getDraft({
          actorUserId: args.actorUserId,
          applicationId: args.targetId,
          draftId: view.latestDraft.draftId,
          projectId: args.projectId,
        });
        const exactVersion =
          pinned.contentSha256 === view.latestDraft.contentSha256 &&
          pinned.version === view.latestDraft.version;
        // A redacted draft or a version that does not match the pinned digest means
        // the exact content cannot be reconstructed for this actor right now.
        if (!exactVersion || pinned.redactedSectionCount > 0) {
          reviewUnavailableReason = "gs_draft_unavailable";
        } else {
          review = {
            gsDraft: {
              contentSha256: pinned.contentSha256,
              draftId: pinned.id,
              sections: pinned.sections.map((section) => ({
                heading: section.heading,
                missingInformation: section.missingInformation,
                sectionKey: section.sectionKey,
                text: section.text,
              })),
              version: pinned.version,
            },
            sections: summarySections,
            source: "pinned_gs_draft_version",
            title: "Student 500 application",
          };
        }
      } catch {
        reviewUnavailableReason = "gs_draft_unavailable";
      }
    }
    return {
      archived: view.applicationStatus === "archived",
      content: {
        applicationRevision: view.applicationRevision,
        applicationStatus: view.applicationStatus,
        school: null,
        student500: {
          applicationPlace: view.context.applicationPlace,
          coeStatus: view.context.coeStatus,
          coverage: {
            conflicted: view.reconciliation.conflictCount,
            covered: view.reconciliation.counts.covered,
            humanReviewRequired: view.reconciliation.requirements.filter(
              (requirement) => requirement.humanReviewRequired
            ).length,
            missing: view.reconciliation.counts.missing,
          },
          entryRoute: view.context.entryRoute,
          factReferenceCount: factReferences.length,
          gsDraft,
          preparationSnapshot: dependencies.preparationSnapshot,
        },
        targetLabel: "student_500_application",
        title: "Student 500 application",
      },
      dependencies,
      indicators,
      review,
      reviewUnavailableReason,
      targetId: view.applicationId,
      targetKind: "student_500_visa_application",
      targetVersion: view.applicationRevision,
    };
  };
}

export function createSubmissionTargetReader(input: {
  readonly school: SchoolTargetSource;
  readonly student500: Student500TargetSource;
}): SubmissionTargetReader {
  const school = createSchoolTargetReader({ school: input.school });
  const student500 = createStudent500TargetReader({
    student500: input.student500,
  });
  return async (args) => {
    const kind: ManagedTargetKind = args.targetKind;
    if (kind === "managed_school_application") {
      return await school(args);
    }
    if (kind === "student_500_visa_application") {
      return await student500(args);
    }
    throw new SubmissionPackageError("invalid_request");
  };
}
