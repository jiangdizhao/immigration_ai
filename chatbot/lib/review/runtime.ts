import "server-only";

import { auth } from "@/app/(auth)/auth";
import {
  ProjectFoundationError,
  projectFoundationRepository,
} from "@/lib/db/project-foundation";
import { schoolApplicationSchemaAvailable } from "@/lib/db/school-application-schema-availability";
import { student500SchemaAvailable } from "@/lib/db/student-500-schema-availability";
import {
  denyAllProfessionalReviewAuthority,
  unavailableProfessionalCredentialVerifier,
} from "@/lib/professional-review/authority";
import { ProfessionalReviewError } from "@/lib/professional-review/errors";
import { professionalReviewService } from "@/lib/professional-review/runtime";
import { unavailableManagedTargetProvider } from "@/lib/professional-review/target-provider";
import { schoolApplicationsEnabled } from "@/lib/school-applications/contracts";
import { schoolApplicationService } from "@/lib/school-applications/runtime";
import { student500ApplicationsEnabled } from "@/lib/student-500/contracts";
import { student500Service } from "@/lib/student-500/runtime";
import { submissionPackagesEnabled } from "@/lib/submission-packages/contracts";
import { submissionPackageService } from "@/lib/submission-packages/runtime";
import { loadWorkspaceSummaryForActor } from "@/lib/workspace/workspace-summary-server";
import {
  AI_CHECK_AVAILABILITY,
  describeProfessionalReviewAvailability,
} from "./professional-review-availability";
import { candidateFromSubmissionPackage } from "./review-candidates";
import {
  type ArtifactReadResult,
  composeProjectReviewSummary,
  type SubmissionReadResult,
  submissionReadResult,
} from "./review-composition";
import { createReviewHandlers } from "./review-http";
import type {
  ProjectReviewSummary,
  ReviewCandidate,
  ReviewProfessionalAvailability,
} from "./review-summary";

/**
 * Phase 13 M9-B runtime composition for the customer exact-version review.
 *
 * Authorization is entirely inherited:
 *
 *   - the Project is resolved through M1 (`getProjectForActor`), so a non-member and a
 *     foreign Project are indistinguishable;
 *   - artifact references come from the accepted M9-A read model, which only reports what
 *     the M5.1/M6.2 services already authorized for this actor;
 *   - M8.1 submission packages are read through the M8.1 service (its own flag, schema
 *     probe and actor eligibility), and a refusal simply yields no candidate;
 *   - professional review availability is the *static* M4-006 composition state, and the
 *     request action is forwarded to the existing M4-006 service, which stays deny-all.
 *
 * Nothing here can create a package, a confirmation or an approval.
 */

/** Bounded so the review page cannot become an application enumeration tool. */
const MAX_APPLICATION_READS_PER_KIND = 3;

/**
 * What the package enumeration actually managed to read. `failedReads` is the number of
 * target- or kind-level reads that did not answer, so the caller can distinguish a
 * complete list from one that is merely all it could reach.
 */
type SubmissionReadOutcome = {
  readonly candidates: ReviewCandidate[];
  readonly failedReads: number;
};

function reviewSurfaceEnabled(): boolean {
  return (
    process.env.PHASE13_PROJECT_REVIEW_ENABLED?.trim().toLowerCase() === "true"
  );
}

/**
 * The production M4-006 composition, read from the same singletons the M4-006 handlers
 * use. Duplicating the *codes* here would drift; importing the singletons cannot.
 */
const professionalAvailability: ReviewProfessionalAvailability =
  describeProfessionalReviewAvailability({
    authorityCode: denyAllProfessionalReviewAuthority.code,
    credentialVerifierCode: unavailableProfessionalCredentialVerifier.code,
    enabled:
      process.env.PHASE13_PROFESSIONAL_REVIEW_ENABLED?.trim().toLowerCase() ===
      "true",
    targetProviderCode: unavailableManagedTargetProvider.code,
  });

async function submissionCandidates(input: {
  actorUserId: string;
  actorType: "guest" | "regular";
  projectId: string;
}): Promise<SubmissionReadOutcome> {
  if (!submissionPackagesEnabled() || input.actorType === "guest") {
    return { candidates: [], failedReads: 0 };
  }
  const targets: { targetId: string; targetKind: string }[] = [];
  /**
   * M9-C: reads that do not answer are counted, not discarded. The M9-B runtime dropped
   * them, so a Project whose package source could only partly be read was presented as a
   * complete list — the "partiality under-reported" debt recorded in D-P13-033. The count
   * is mechanical and never interprets a refusal as "no package exists".
   */
  let failedReads = 0;
  try {
    if (
      schoolApplicationsEnabled() &&
      (await schoolApplicationSchemaAvailable())
    ) {
      const rows = await schoolApplicationService.list({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
      });
      for (const row of rows.slice(0, MAX_APPLICATION_READS_PER_KIND)) {
        if (row.archivedAt === null) {
          targets.push({
            targetId: row.applicationId,
            targetKind: "managed_school_application",
          });
        }
      }
    }
  } catch {
    // A refused or failed M5.1 read contributes no target, and its targets are unknown.
    failedReads += 1;
  }
  try {
    if (
      student500ApplicationsEnabled() &&
      (await student500SchemaAvailable())
    ) {
      const rows = await student500Service.list({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
      });
      for (const row of rows.slice(0, MAX_APPLICATION_READS_PER_KIND)) {
        if (row.archivedAt === null) {
          targets.push({
            targetId: row.applicationId,
            targetKind: "student_500_visa_application",
          });
        }
      }
    }
  } catch {
    // Same: no target, no invention — but the source is now known to be incomplete.
    failedReads += 1;
  }
  const candidates: ReviewCandidate[] = [];
  for (const target of targets) {
    try {
      const view = await submissionPackageService.get({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        targetId: target.targetId,
        targetKind: target.targetKind as never,
      });
      for (const version of view.packages) {
        candidates.push(
          candidateFromSubmissionPackage({
            targetId: target.targetId,
            targetKind: target.targetKind,
            version,
          })
        );
      }
    } catch {
      // The M8.1 service refused or could not serve this target for this actor: contribute
      // no candidate, but never let the rest of the list look complete.
      failedReads += 1;
    }
  }
  return { candidates, failedReads };
}

export async function loadProjectReviewSummaryForActor(input: {
  actorUserId: string;
  actorType: "guest" | "regular";
  projectId: string;
}): Promise<
  | { kind: "ok"; summary: ProjectReviewSummary }
  | { kind: "not_found" }
  | { kind: "unavailable" }
> {
  let project: { id: string };
  try {
    project = await projectFoundationRepository.getProjectForActor({
      actorUserId: input.actorUserId,
      projectId: input.projectId,
    });
  } catch (error) {
    return {
      kind:
        error instanceof ProjectFoundationError ? "not_found" : "unavailable",
    };
  }

  /**
   * Correction 3: a failed artifact read is reported as a state, never as an empty list.
   * Only stable codes cross this boundary — no exception text and no foreign identity.
   */
  const readArtifacts = async (): Promise<ArtifactReadResult> => {
    try {
      const workspace = await loadWorkspaceSummaryForActor(input);
      if (workspace.kind === "ok") {
        return { artifacts: workspace.summary.artifacts, kind: "ok" };
      }
      return {
        kind: workspace.kind === "not_found" ? "denied" : "unavailable",
        reasonCode:
          workspace.kind === "not_found"
            ? "artifact_source_restricted"
            : "artifact_source_unavailable",
      };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      const denied =
        code === "actor_not_eligible" ||
        code === "project_forbidden" ||
        code === "project_not_found";
      return {
        kind: denied ? "denied" : "unavailable",
        reasonCode: denied
          ? "artifact_source_restricted"
          : "artifact_source_unavailable",
      };
    }
  };

  const readSubmission = async (): Promise<SubmissionReadResult> => {
    if (!submissionPackagesEnabled()) {
      return { kind: "disabled", reasonCode: "submission_packages_disabled" };
    }
    if (input.actorType === "guest") {
      return { kind: "denied", reasonCode: "submission_packages_restricted" };
    }
    try {
      return submissionReadResult(await submissionCandidates(input));
    } catch {
      return {
        kind: "unavailable",
        reasonCode: "submission_source_unavailable",
      };
    }
  };

  // No per-Project review enumeration exists in M4-006 (`findCurrent` is exact-target
  // only) and adding one would need a new query plus per-row authority, so the honest
  // composition reports `not_requested` for an exact version the customer has not just
  // requested in this session. Nothing is invented from a missing list.
  const summary = await composeProjectReviewSummary({
    aiCheckAvailability: AI_CHECK_AVAILABILITY,
    professionalAvailability,
    projectId: project.id,
    readArtifacts,
    readSubmission,
  });
  return { kind: "ok", summary };
}

export const reviewHandlers = createReviewHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { type: session.user.type, userId: session.user.id };
  },
  enabled: reviewSurfaceEnabled,
  loadSummary: loadProjectReviewSummaryForActor,
  async requestReview(input) {
    if (professionalAvailability.state !== "available") {
      // Reported as blocked *before* any write, so a customer can never see a request
      // that would not exist.
      return {
        kind: "blocked",
        reasonCode:
          professionalAvailability.reasonCode ??
          "professional_authority_unavailable",
        status: professionalAvailability.state === "disabled" ? 404 : 503,
      };
    }
    try {
      const result = await professionalReviewService.createReviewRequest({
        actor: {
          actorRole: "unknown",
          actorUserId: input.actorUserId,
          reviewerAssignmentId: null,
          reviewerAssignmentStatus: "unavailable",
        },
        operationId: input.request.operationId,
        projectId: input.projectId,
        reviewPurpose: "managed_handoff_authorization",
        reviewScope: input.request.reviewScope as never,
        target: {
          targetId: input.request.targetId,
          targetKind: input.request.targetKind as never,
          targetSha256: input.request.targetSha256,
          targetVersion: input.request.targetVersion,
        },
      });
      return result.replayed
        ? { kind: "replayed", reviewRequestId: result.record.reviewRequestId }
        : {
            kind: "created",
            reviewRequestId: result.record.reviewRequestId,
            revision: result.record.revision,
            state: result.record.state,
          };
    } catch (error) {
      if (error instanceof ProfessionalReviewError) {
        switch (error.code) {
          case "invalid_request":
            return { kind: "invalid_request" };
          case "not_found":
            return { kind: "not_found" };
          case "forbidden":
          case "authority_denied":
            return {
              kind: "blocked",
              reasonCode: "review_authority_denied",
              status: 403,
            };
          case "unavailable":
            return {
              kind: "blocked",
              reasonCode: "professional_authority_unavailable",
              status: 503,
            };
          case "target_kind_unsupported":
          case "target_untrusted":
          case "target_mismatch":
          case "state_conflict":
          case "revision_conflict":
          case "idempotency_conflict":
            return {
              kind: "blocked",
              reasonCode: "review_state_not_requestable",
              status: 409,
            };
          default:
            return { kind: "unavailable" };
        }
      }
      return { kind: "unavailable" };
    }
  },
});
