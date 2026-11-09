import type {
  ProjectReviewSummary,
  ReviewItem,
} from "@/lib/review/review-summary";
import {
  type StaffProjectAccessDecision,
  type StaffProjectShell,
  staffProjectAccessDecision,
} from "./staff-queue";

/**
 * Phase 13 M9-B — Staff review detail under an explicit content gate.
 *
 * The staff detail is the place where a Project-assignment read would most easily become
 * a private-data read, so the shape itself enforces the boundary:
 *
 *   - `shell`      — the minimal Project shell M4-002 authorizes (always);
 *   - `review`     — the per-version review read model **only** when the content gate
 *                    allowed it; otherwise `null` and the gate reason is reported;
 *   - `permitted`  — the field groups the actor may see, computed by the server;
 *   - `blocked`    — the reason codes explaining everything that was withheld.
 *
 * There is no field that can carry document bytes, extracted text, Project Facts, GS
 * draft prose, AI Chat content, human message bodies or package manifests. A future
 * content adapter must add an explicitly reviewed field, not reuse this one.
 */

export const STAFF_PERMITTED_FIELD_GROUPS = [
  "project_shell",
  "assignment_identity",
  "disclosure_state",
  "review_status",
  "review_version_identity",
] as const;
export type StaffPermittedFieldGroup =
  (typeof STAFF_PERMITTED_FIELD_GROUPS)[number];

export type StaffReviewDetail = {
  readonly projectId: string;
  readonly shell: StaffProjectShell | null;
  readonly disclosure: {
    readonly decision: "ALLOW" | "DENY";
    readonly reasonCode: string;
  };
  /**
   * Per-version review items, or `null` when the content gate denied them. A denied
   * detail never carries a partially populated list.
   */
  readonly review: ProjectReviewSummary | null;
  readonly permitted: readonly StaffPermittedFieldGroup[];
  readonly blockedReasonCodes: readonly string[];
  readonly professionalReview: {
    readonly state: string;
    readonly reasonCode: string | null;
  };
};

const DENY_REASON = "disclosure_denied";

export function buildStaffReviewDetail(input: {
  readonly projectId: string;
  readonly assignmentStatus: Parameters<
    typeof staffProjectAccessDecision
  >[0]["assignmentStatus"];
  readonly actorRole: string;
  readonly projectLifecycle: Parameters<
    typeof staffProjectAccessDecision
  >[0]["projectLifecycle"];
  readonly shell: StaffProjectShell | null;
  /** The existing M4-004 evaluator result; the caller may not invent an ALLOW. */
  readonly disclosure: {
    readonly decision: "ALLOW" | "DENY";
    readonly reasonCode: string;
  } | null;
  /** Read only when the gate allowed it. */
  readonly review: ProjectReviewSummary | null;
  readonly professionalReview: {
    readonly state: string;
    readonly reasonCode: string | null;
  };
}): StaffReviewDetail {
  const access: StaffProjectAccessDecision = staffProjectAccessDecision({
    actorRole: input.actorRole,
    assignmentStatus: input.assignmentStatus,
    projectLifecycle: input.projectLifecycle,
  });
  if (!access.allowed || input.shell === null) {
    // Fail closed before any other consideration: no shell, no review, no content.
    return {
      blockedReasonCodes: [
        access.allowed ? "staff_project_shell_unavailable" : access.reasonCode,
      ],
      disclosure: {
        decision: "DENY",
        reasonCode: access.allowed ? DENY_REASON : access.reasonCode,
      },
      permitted: [],
      professionalReview: input.professionalReview,
      projectId: input.projectId,
      review: null,
      shell: null,
    };
  }
  const disclosure = input.disclosure ?? {
    decision: "DENY" as const,
    reasonCode: "disclosure_unverified",
  };
  const allowed = disclosure.decision === "ALLOW";
  const blockedReasonCodes: string[] = [];
  if (!allowed) {
    blockedReasonCodes.push(disclosure.reasonCode);
  }
  if (
    input.professionalReview.state !== "available" &&
    input.professionalReview.reasonCode !== null
  ) {
    blockedReasonCodes.push(input.professionalReview.reasonCode);
  }
  const permitted: StaffPermittedFieldGroup[] = [
    "project_shell",
    "assignment_identity",
    "disclosure_state",
    "review_status",
  ];
  if (allowed) {
    permitted.push("review_version_identity");
  }
  return {
    blockedReasonCodes,
    disclosure,
    permitted,
    professionalReview: input.professionalReview,
    projectId: input.projectId,
    // A denied gate must never carry a populated list, even if the caller passed one.
    review: allowed ? input.review : null,
    shell: input.shell,
  };
}

/**
 * The staff-visible summary of one review item: identity and status only. Called by the
 * UI so it never reaches into a possibly-denied structure.
 */
export function staffReviewItemIdentity(item: ReviewItem): {
  readonly artifactKind: string;
  readonly version: number;
  readonly status: string | null;
  readonly confirmationState: string;
  readonly professionalState: string;
} {
  return {
    artifactKind: item.artifactKind,
    confirmationState: item.confirmation.state,
    professionalState: item.professionalReview.state,
    status: item.status,
    version: item.exactVersion.targetVersion,
  };
}
