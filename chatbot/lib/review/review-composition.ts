import type { ProjectArtifactsSummary } from "@/lib/workspace/project-artifacts";
import {
  candidateFromSubmissionPackage,
  candidatesFromArtifacts,
  dedupeCandidates,
  type SubmissionPackageCandidateInput,
} from "./review-candidates";
import {
  buildProjectReviewSummary,
  describeArtifactSource,
  type ProjectReviewSummary,
  type ReviewCandidate,
  type ReviewProfessionalAvailability,
  type ReviewProfessionalObservation,
  type ReviewSourceReadState,
} from "./review-summary";

/**
 * Phase 13 M9-B correction 3 — pure composition of the review surface.
 *
 * The runtime used to swallow a failed artifact read and present the result as an empty
 * list, which is indistinguishable from "this Project genuinely has no reviewable
 * versions". This module separates the two facts and keeps the *reads* injectable so the
 * three required outcomes (successful empty, unavailable, denied) are provable offline.
 *
 * It adds no authorization: each reader is the caller's already-authorized service call,
 * and a reader that fails is reported as a state, never retried and never interpreted.
 */

/** Result of the caller's artifact read, as a fact rather than an exception. */
export type ArtifactReadResult =
  | { readonly kind: "ok"; readonly artifacts: ProjectArtifactsSummary }
  | {
      readonly kind: "denied" | "disabled" | "unavailable";
      /** Stable code only; never exception text. */
      readonly reasonCode: string;
    };

/** Result of the caller's M8.1 package read, as a fact rather than an exception. */
export type SubmissionReadResult =
  | {
      readonly kind: "ok";
      readonly candidates: readonly ReviewCandidate[];
      /**
       * Set only when part of the source answered — for example one target's M8.1
       * package read failed while another succeeded. A partly readable source must
       * never be reported as a complete list.
       */
      readonly partialReasonCode?: string | null;
    }
  | {
      readonly kind: "denied" | "disabled" | "unavailable";
      readonly reasonCode: string;
    };

/** Stable code for "this source answered, but not for every target". */
export const SUBMISSION_SOURCE_PARTIAL = "submission_source_partial";

/**
 * M9-C: turns the caller's M8.1 read outcome into a result.
 *
 * `failedReads` counts the target- and kind-level reads that did not answer. The old
 * runtime discarded that count, so a half-readable package source produced a list that
 * looked complete — the under-reported partiality recorded as M9-B debt. Counting is
 * mechanical: it never decides whether a package exists, only whether the enumeration
 * finished.
 */
export function submissionReadResult(input: {
  readonly candidates: readonly ReviewCandidate[];
  readonly failedReads: number;
}): SubmissionReadResult {
  return {
    candidates: input.candidates,
    kind: "ok",
    partialReasonCode: input.failedReads > 0 ? SUBMISSION_SOURCE_PARTIAL : null,
  };
}

function artifactFailureState(
  result: Exclude<ArtifactReadResult, { kind: "ok" }>
): Exclude<ReviewSourceReadState, "ok"> {
  if (result.kind === "denied") {
    return "restricted";
  }
  return result.kind === "disabled" ? "disabled" : "unavailable";
}

function submissionFailureState(
  result: Exclude<SubmissionReadResult, { kind: "ok" }>
): Exclude<ReviewSourceReadState, "ok"> {
  if (result.kind === "denied") {
    return "restricted";
  }
  return result.kind === "disabled" ? "disabled" : "unavailable";
}

/** Maps an M8.1 workspace view's package versions to candidates (no content). */
export function submissionCandidateInputs(input: {
  readonly targetKind: string;
  readonly targetId: string;
  readonly packages: readonly SubmissionPackageCandidateInput["version"][];
}): ReviewCandidate[] {
  return input.packages.map((version) =>
    candidateFromSubmissionPackage({
      targetId: input.targetId,
      targetKind: input.targetKind,
      version,
    })
  );
}

export async function composeProjectReviewSummary(input: {
  readonly projectId: string;
  readonly readArtifacts: () => Promise<ArtifactReadResult>;
  readonly readSubmission?: () => Promise<SubmissionReadResult>;
  readonly professionalAvailability: ReviewProfessionalAvailability;
  readonly aiCheckAvailability: ProjectReviewSummary["aiChecking"]["state"];
  readonly professional?: ReadonlyMap<string, ReviewProfessionalObservation>;
  readonly maxItems?: number;
}): Promise<ProjectReviewSummary> {
  let artifactState: Exclude<ReviewSourceReadState, "ok"> | null = null;
  let artifactCandidates: ReviewCandidate[] = [];
  const artifacts = await input.readArtifacts();
  if (artifacts.kind === "ok") {
    artifactCandidates = candidatesFromArtifacts(artifacts.artifacts);
  } else {
    artifactState = artifactFailureState(artifacts);
  }

  let submissionState: Exclude<ReviewSourceReadState, "ok"> | null = null;
  let submissionCandidates: ReviewCandidate[] = [];
  if (input.readSubmission) {
    const submission = await input.readSubmission();
    if (submission.kind === "ok") {
      submissionCandidates = [...submission.candidates];
      // A source that answered only in part is handled exactly like the other
      // "did not answer" outcomes, so the existing precedence below labels the list
      // `partial` (some items readable) or `unavailable` (nothing readable) instead of
      // `available`/`empty`. No new state vocabulary and no new authorization.
      if (submission.partialReasonCode) {
        submissionState = "unavailable";
      }
    } else {
      submissionState = submissionFailureState(submission);
    }
  }

  const candidates = dedupeCandidates([
    ...artifactCandidates,
    ...submissionCandidates,
  ]);
  return buildProjectReviewSummary({
    aiCheckAvailability: input.aiCheckAvailability,
    artifactSource: describeArtifactSource({
      artifacts: artifactState,
      hasItems: candidates.length > 0,
      submission: submissionState,
    }),
    candidates,
    maxItems: input.maxItems,
    professional: input.professional ?? new Map(),
    professionalAvailability: input.professionalAvailability,
    projectId: input.projectId,
  });
}
