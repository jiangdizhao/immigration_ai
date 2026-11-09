import {
  ARTIFACT_SOURCE_STATES,
  MAX_PROJECT_REVIEW_ITEMS,
  type ProjectReviewSummary,
  type ReviewItem,
} from "./review-summary";

/**
 * Phase 13 M9-B — client access to the exact-version review surface.
 *
 * Deliberately thin, like the M8.1 client: the server owns authorization, availability,
 * review state and every reason code. This module can only read the summary and forward
 * one bounded review request. It never decides whether a review is allowed, never invents
 * a state and never sends an identity the server did not provide.
 */

export type ReviewRequestState =
  | { readonly status: "idle" }
  | { readonly status: "pending" }
  | { readonly status: "recorded"; readonly reviewRequestId: string }
  | { readonly status: "blocked"; readonly reasonCode: string }
  | { readonly status: "failed" };

export type ProjectReviewSnapshot = {
  readonly loading: boolean;
  readonly review: ProjectReviewSummary | null;
  readonly error:
    | "unauthenticated"
    | "not_found"
    | "unavailable"
    | "invalid"
    | null;
  readonly request: ReviewRequestState;
};

export function reviewSummaryPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/review-summary`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dimension(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.state === "string" &&
    (value.reasonCode === null || typeof value.reasonCode === "string")
  );
}

function isReviewItem(value: unknown): value is ReviewItem {
  return (
    isRecord(value) &&
    typeof value.artifactKind === "string" &&
    typeof value.referenceId === "string" &&
    isRecord(value.exactVersion) &&
    typeof value.exactVersion.targetKind === "string" &&
    typeof value.exactVersion.targetId === "string" &&
    typeof value.exactVersion.targetVersion === "number" &&
    dimension(value.aiCheck) &&
    dimension(value.confirmation) &&
    dimension(value.professionalReview) &&
    isRecord(value.integrity) &&
    typeof value.integrity.state === "string" &&
    isRecord(value.requestEligibility) &&
    typeof value.requestEligibility.allowed === "boolean" &&
    (value.reviewTarget === null || isRecord(value.reviewTarget))
  );
}

/** Strict-enough parse: an unexpected shape is an error, never a silent default. */
export function parseProjectReviewSummary(
  value: unknown
): ProjectReviewSummary | null {
  const review = isRecord(value) ? value.review : null;
  if (
    !isRecord(review) ||
    typeof review.projectId !== "string" ||
    !Array.isArray(review.items) ||
    review.items.length > MAX_PROJECT_REVIEW_ITEMS ||
    typeof review.truncated !== "boolean" ||
    !isRecord(review.professionalReview) ||
    typeof review.professionalReview.state !== "string" ||
    !Array.isArray(review.professionalReview.supportedTargetKinds) ||
    !isRecord(review.aiChecking) ||
    typeof review.aiChecking.state !== "string" ||
    !isRecord(review.limits) ||
    typeof review.limits.maxItems !== "number" ||
    // Correction 3: the source state is part of the contract, so a response that cannot
    // say whether the list was empty or unreadable is rejected rather than guessed.
    !isRecord(review.artifactSource) ||
    typeof review.artifactSource.state !== "string" ||
    !(ARTIFACT_SOURCE_STATES as readonly string[]).includes(
      review.artifactSource.state
    ) ||
    (review.artifactSource.reasonCode !== null &&
      typeof review.artifactSource.reasonCode !== "string")
  ) {
    return null;
  }
  const items: ReviewItem[] = [];
  for (const candidate of review.items) {
    if (!isReviewItem(candidate)) {
      return null;
    }
    items.push(candidate);
  }
  return { ...(review as unknown as ProjectReviewSummary), items };
}

export type ReviewFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

function classify(status: number): ProjectReviewSnapshot["error"] {
  if (status === 401) {
    return "unauthenticated";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 503) {
    return "unavailable";
  }
  return "invalid";
}

/**
 * Reads the review surface and can ask for one professional review.
 *
 * A blocked request is reported with the server's own reason code and never converted to
 * success; a failed request reports its own failure and never mutates a loaded summary.
 */
export function createProjectReviewClient(
  options: { fetchImpl?: ReviewFetch; newOperationId?: () => string } = {}
) {
  const fetchImpl: ReviewFetch =
    options.fetchImpl ?? ((input, init) => fetch(input, init));
  const newOperationId =
    options.newOperationId ??
    (() =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `op-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  return {
    async load(projectId: string): Promise<ProjectReviewSnapshot> {
      let response: Response;
      try {
        response = await fetchImpl(reviewSummaryPath(projectId), {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
      } catch {
        return {
          error: "unavailable",
          loading: false,
          request: { status: "idle" },
          review: null,
        };
      }
      if (!response.ok) {
        return {
          error: classify(response.status),
          loading: false,
          request: { status: "idle" },
          review: null,
        };
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return {
          error: "invalid",
          loading: false,
          request: { status: "idle" },
          review: null,
        };
      }
      const review = parseProjectReviewSummary(body);
      return {
        error: review === null ? "invalid" : null,
        loading: false,
        request: { status: "idle" },
        review,
      };
    },

    async requestReview(input: {
      projectId: string;
      item: ReviewItem;
    }): Promise<ReviewRequestState> {
      const target = input.item.reviewTarget;
      if (target === null || !input.item.requestEligibility.allowed) {
        // The client never invents a target or overrides the server's eligibility.
        return {
          reasonCode:
            input.item.requestEligibility.reasonCode ??
            "review_target_kind_unsupported",
          status: "blocked",
        };
      }
      let response: Response;
      try {
        response = await fetchImpl(reviewSummaryPath(input.projectId), {
          body: JSON.stringify({
            operationId: newOperationId(),
            reviewScope: ["eligibility_review", "document_completeness"],
            targetId: target.targetId,
            targetKind: target.targetKind,
            targetSha256: target.targetSha256,
            targetVersion: target.targetVersion,
          }),
          credentials: "same-origin",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          method: "POST",
        });
      } catch {
        return { status: "failed" };
      }
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (
        response.ok &&
        isRecord(body) &&
        typeof body.reviewRequestId === "string"
      ) {
        return { reviewRequestId: body.reviewRequestId, status: "recorded" };
      }
      if (isRecord(body) && typeof body.reasonCode === "string") {
        return { reasonCode: body.reasonCode, status: "blocked" };
      }
      return { status: "failed" };
    },
  };
}

/** Stable selection key for one exact version (kind + real persisted id). */
export function reviewItemKey(item: ReviewItem): string {
  return `${item.artifactKind}:${item.referenceId}`;
}

/**
 * Keeps a selection only while the same exact version is still present. Switching Project
 * (or a version disappearing) must drop the selection so Project A's version can never be
 * shown or acted on inside Project B.
 */
export function reconcileReviewSelection(input: {
  readonly review: ProjectReviewSummary | null;
  readonly selectedKey: string | null;
}): ReviewItem | null {
  if (!input.review || input.selectedKey === null) {
    return null;
  }
  return (
    input.review.items.find(
      (item) => reviewItemKey(item) === input.selectedKey
    ) ?? null
  );
}
