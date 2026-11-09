import type { ProjectReviewSummary } from "./review-summary";

/**
 * Phase 13 M9-B — bounded HTTP surface for the customer exact-version review.
 *
 * Exactly one read and one action:
 *
 *   GET  /api/projects/{projectId}/review-summary
 *   POST /api/projects/{projectId}/review-summary   (request professional review)
 *
 * The GET re-derives the actor from the session in the composition; it never accepts an
 * actor, a role or an availability flag from the client. The POST only forwards a bounded
 * request to the **existing** M4-006 workflow, so when that workflow is fail-closed the
 * customer receives its exact refusal (`503`/`403`), never a fabricated success. A blocked
 * response carries no review data.
 */

export type ReviewSummaryResult =
  | { readonly kind: "ok"; readonly summary: ProjectReviewSummary }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable" };

export type ReviewRequestResult =
  | {
      readonly kind: "created";
      readonly reviewRequestId: string;
      readonly state: string;
      readonly revision: number;
    }
  | { readonly kind: "replayed"; readonly reviewRequestId: string }
  | { readonly kind: "not_found" }
  | {
      readonly kind: "blocked";
      readonly reasonCode: string;
      readonly status: number;
    }
  | { readonly kind: "invalid_request" }
  | { readonly kind: "unavailable" };

export type ReviewHandlerDependencies = {
  readonly authenticate: () => Promise<{
    readonly userId: string;
    readonly type?: string;
  } | null>;
  /** Operator flag; can only hide the surface. Never authorization. */
  readonly enabled: () => boolean;
  readonly loadSummary: (input: {
    readonly actorUserId: string;
    readonly actorType: "guest" | "regular";
    readonly projectId: string;
  }) => Promise<ReviewSummaryResult>;
  readonly requestReview: (input: {
    readonly actorUserId: string;
    readonly actorType: "guest" | "regular";
    readonly projectId: string;
    readonly request: {
      readonly operationId: string;
      readonly reviewScope: readonly string[];
      readonly targetId: string;
      readonly targetKind: string;
      readonly targetSha256: string;
      readonly targetVersion: number;
    };
  }) => Promise<ReviewRequestResult>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const OPERATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TARGET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const REVIEW_SCOPES = [
  "eligibility_review",
  "document_completeness",
  "form_accuracy",
  "legal_advice_alignment",
] as const;

const BLOCKED_STATUS: Record<string, number> = {
  managed_target_provider_unavailable: 503,
  professional_authority_unavailable: 503,
  professional_credential_registry_unavailable: 503,
  professional_review_disabled: 404,
  review_authority_denied: 403,
  review_state_not_requestable: 409,
  review_target_kind_unsupported: 409,
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A blocked state is a *code*, never prose and never partial data. */
export function blockedReviewResponse(reasonCode: string) {
  return jsonResponse(
    { blocked: true, reasonCode },
    BLOCKED_STATUS[reasonCode] ?? 409
  );
}

export function createReviewHandlers(deps: ReviewHandlerDependencies) {
  async function prepare() {
    const session = await deps.authenticate();
    if (!session) {
      return {
        ok: false as const,
        response: jsonResponse({ error: "Authentication required." }, 401),
      };
    }
    if (!deps.enabled()) {
      // Hidden exactly like an absent Project, so its existence is not disclosed while
      // the operator keeps the surface switched off.
      return {
        ok: false as const,
        response: jsonResponse({ error: "Project not found." }, 404),
      };
    }
    return {
      ok: true as const,
      actor: {
        actorType:
          session.type === "guest" ? ("guest" as const) : ("regular" as const),
        actorUserId: session.userId,
      },
    };
  }

  return {
    async getProjectReview(
      _request: Request,
      projectId: string
    ): Promise<Response> {
      const prepared = await prepare();
      if (!prepared.ok) {
        return prepared.response;
      }
      if (!UUID_RE.test(projectId)) {
        return jsonResponse({ error: "Project not found." }, 404);
      }
      const result = await deps.loadSummary({ ...prepared.actor, projectId });
      if (result.kind === "not_found") {
        return jsonResponse({ error: "Project not found." }, 404);
      }
      if (result.kind === "unavailable") {
        return jsonResponse(
          { error: "Project review is temporarily unavailable." },
          503
        );
      }
      return jsonResponse({ review: result.summary });
    },

    async requestProjectReview(
      request: Request,
      projectId: string
    ): Promise<Response> {
      const prepared = await prepare();
      if (!prepared.ok) {
        return prepared.response;
      }
      if (!UUID_RE.test(projectId)) {
        return jsonResponse({ error: "Project not found." }, 404);
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid review request." }, 400);
      }
      if (!isRecord(body)) {
        return jsonResponse({ error: "Invalid review request." }, 400);
      }
      const {
        operationId,
        reviewScope,
        targetId,
        targetKind,
        targetSha256,
        targetVersion,
      } = body;
      if (
        typeof operationId !== "string" ||
        !OPERATION_ID_RE.test(operationId) ||
        typeof targetId !== "string" ||
        !TARGET_ID_RE.test(targetId) ||
        typeof targetKind !== "string" ||
        targetKind.length === 0 ||
        targetKind.length > 64 ||
        typeof targetSha256 !== "string" ||
        !SHA256_RE.test(targetSha256) ||
        typeof targetVersion !== "number" ||
        !Number.isSafeInteger(targetVersion) ||
        targetVersion < 1 ||
        !Array.isArray(reviewScope) ||
        reviewScope.length === 0 ||
        reviewScope.length > REVIEW_SCOPES.length ||
        reviewScope.some(
          (entry) =>
            typeof entry !== "string" ||
            !(REVIEW_SCOPES as readonly string[]).includes(entry)
        ) ||
        new Set(reviewScope).size !== reviewScope.length
      ) {
        return jsonResponse({ error: "Invalid review request." }, 400);
      }
      const result = await deps.requestReview({
        ...prepared.actor,
        projectId,
        request: {
          operationId,
          reviewScope: reviewScope as string[],
          targetId,
          targetKind,
          targetSha256,
          targetVersion,
        },
      });
      switch (result.kind) {
        case "created":
          return jsonResponse(
            {
              replayed: false,
              reviewRequestId: result.reviewRequestId,
              revision: result.revision,
              state: result.state,
            },
            201
          );
        case "replayed":
          return jsonResponse({
            replayed: true,
            reviewRequestId: result.reviewRequestId,
          });
        case "invalid_request":
          return jsonResponse({ error: "Invalid review request." }, 400);
        case "not_found":
          return jsonResponse({ error: "Project not found." }, 404);
        case "blocked":
          return blockedReviewResponse(result.reasonCode);
        default:
          return jsonResponse(
            { error: "Professional review is temporarily unavailable." },
            503
          );
      }
    },
  };
}
