import { z } from "zod";
import {
  STUDENT_500_GS_MAX_SECTION_TEXT,
  Student500PreparationError,
} from "./contracts";
import {
  STUDENT_500_EDITORIAL_DISCLOSURE_SCOPES,
  STUDENT_500_EDITORIAL_RATIONALE_CODES,
  STUDENT_500_MAX_DISCLOSED_FACTS,
  STUDENT_500_MAX_EDITORIAL_COMMENT_LENGTH,
  STUDENT_500_MAX_EDITORIAL_COMMENTS,
  STUDENT_500_MAX_EDITORIAL_EDITS,
} from "./m7-contracts";
import type { Student500DeepPreparationService } from "./m7-service";

/**
 * Phase 13 M7 HTTP surface.
 *
 * Same shape and posture as the accepted M6.2 handlers: the actor comes from the
 * authenticated session, the Project and application come from the route, and every
 * body schema is strict, so a payload can never supply identity, consent evidence,
 * authority, credential status, verification or a verification verdict. The server
 * derives all of those.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 32 * 1024;
const UUID = z.string().regex(UUID_PATTERN);

const proposeBody = z
  .object({ action: z.literal("propose_gs_revision") })
  .strict();

const decisionBody = (action: "accept_gs_revision" | "reject_gs_revision") =>
  z.object({ action: z.literal(action), proposalId: UUID }).strict();

const reviewDecisionBody = (
  action: "accept_editorial_review" | "reject_editorial_review"
) => z.object({ action: z.literal(action), reviewId: UUID }).strict();

const requestReviewBody = z
  .object({
    action: z.literal("request_editorial_review"),
    consentCode: z.string().min(1).max(128),
    consentGranted: z.literal(true),
    disclosureScopes: z
      .array(z.enum(STUDENT_500_EDITORIAL_DISCLOSURE_SCOPES))
      .min(1)
      .max(3),
    draftId: UUID,
    draftVersion: z.number().int().positive().safe(),
    factReferenceIds: z.array(UUID).max(STUDENT_500_MAX_DISCLOSED_FACTS),
  })
  .strict();

const feedbackBody = z
  .object({
    action: z.literal("submit_editorial_feedback"),
    comments: z
      .array(
        z
          .object({
            body: z
              .string()
              .min(1)
              .max(STUDENT_500_MAX_EDITORIAL_COMMENT_LENGTH),
            proposedText: z
              .string()
              .min(1)
              .max(STUDENT_500_GS_MAX_SECTION_TEXT)
              .nullish(),
            sectionKey: z.string().min(1).max(64).nullish(),
          })
          .strict()
      )
      .max(STUDENT_500_MAX_EDITORIAL_COMMENTS),
    proposedEdits: z
      .array(
        z
          .object({
            proposedText: z
              .string()
              .min(1)
              .max(STUDENT_500_GS_MAX_SECTION_TEXT),
            rationaleCode: z.enum(STUDENT_500_EDITORIAL_RATIONALE_CODES),
            sectionKey: z.string().min(1).max(64),
          })
          .strict()
      )
      .max(STUDENT_500_MAX_EDITORIAL_EDITS),
    reviewId: UUID,
  })
  .strict();

const actionBody = z.discriminatedUnion("action", [
  proposeBody,
  decisionBody("accept_gs_revision"),
  decisionBody("reject_gs_revision"),
  requestReviewBody,
  feedbackBody,
  reviewDecisionBody("accept_editorial_review"),
  reviewDecisionBody("reject_editorial_review"),
]);

type AuthenticatedSession = { userId: string; type: "guest" | "regular" };

type HandlerDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  enabled: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  projectWritesEnabled?: () => boolean;
  service: Pick<
    Student500DeepPreparationService,
    | "get"
    | "proposeRevision"
    | "decideProposal"
    | "requestEditorialReview"
    | "submitEditorialFeedback"
    | "decideEditorialReview"
  >;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function mapError(error: unknown): Response {
  if (error instanceof Student500PreparationError) {
    switch (error.code) {
      case "invalid_request":
        return errorResponse("Invalid Student 500 request.", 400);
      case "actor_not_eligible":
      case "project_forbidden":
        return errorResponse("Student 500 preparation not found.", 404);
      case "project_not_found":
      case "application_not_found":
      case "application_archived":
      case "draft_not_found":
      case "proposal_not_found":
      case "editorial_review_not_found":
        return errorResponse("Student 500 preparation not found.", 404);
      case "consent_required":
        return errorResponse("Disclosure consent is required.", 400);
      case "editorial_authority_unavailable":
        return errorResponse(
          "Professional editorial authority is not available.",
          403
        );
      case "composer_unavailable":
        return errorResponse("Draft assistance is unavailable.", 503);
      case "revision_conflict":
      case "version_conflict":
      case "state_conflict":
        return errorResponse("Student 500 preparation changed.", 409);
      case "idempotency_conflict":
      case "integrity_conflict":
        return errorResponse("Student 500 preparation conflict.", 409);
      case "limit_exceeded":
        return errorResponse("Student 500 preparation limit reached.", 429);
      case "project_closed":
        return errorResponse("Project is closed.", 409);
      default:
        return errorResponse("Student 500 preparation failed.", 500);
    }
  }
  return errorResponse("Student 500 preparation failed.", 500);
}

async function readBoundedJson(
  request: Request
): Promise<{ value: unknown } | { response: Response }> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { response: errorResponse("Invalid Student 500 request.", 400) };
  }
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return { response: errorResponse("Invalid Student 500 request.", 400) };
  }
}

export function createStudent500DeepPreparationHandlers(
  deps: HandlerDependencies
) {
  async function invoke(
    action: (actorUserId: string) => Promise<Response>,
    options: { readonly mode?: "read" | "write" } = {}
  ): Promise<Response> {
    if (!deps.enabled()) {
      return errorResponse("Student 500 preparation not found.", 404);
    }
    const session = await deps.authenticate();
    if (!session) {
      return errorResponse("Authentication required.", 401);
    }
    if (session.type !== "regular") {
      return errorResponse("Student 500 preparation not found.", 404);
    }
    if (options.mode === "write" && !(deps.projectWritesEnabled?.() ?? true)) {
      return errorResponse(
        "Student 500 preparation changes are disabled right now.",
        503
      );
    }
    let schemaReady: boolean;
    try {
      schemaReady = await deps.schemaAvailable();
    } catch {
      schemaReady = false;
    }
    if (!schemaReady) {
      return errorResponse("Student 500 preparation is unavailable.", 503);
    }
    try {
      return await action(session.userId);
    } catch (error) {
      return mapError(error);
    }
  }

  function validPath(projectId: string, applicationId: string): boolean {
    return (
      projectId.length > 0 &&
      projectId.length <= 128 &&
      applicationId.length > 0 &&
      UUID.safeParse(applicationId).success
    );
  }

  return {
    /** The deep-preparation view: scenario, tasks, proposals and review state. */
    get(projectId: string, applicationId: string) {
      return invoke(async (actorUserId) => {
        if (!validPath(projectId, applicationId)) {
          return errorResponse("Invalid Student 500 request.", 400);
        }
        return jsonResponse(
          await deps.service.get({ actorUserId, applicationId, projectId })
        );
      });
    },

    act(request: Request, projectId: string, applicationId: string) {
      return invoke(
        async (actorUserId) => {
          if (!validPath(projectId, applicationId)) {
            return errorResponse("Invalid Student 500 request.", 400);
          }
          const body = await readBoundedJson(request);
          if ("response" in body) {
            return body.response;
          }
          const parsed = actionBody.safeParse(body.value);
          if (!parsed.success) {
            return errorResponse("Invalid Student 500 request.", 400);
          }
          const value = parsed.data;
          const scope = { actorUserId, applicationId, projectId };
          switch (value.action) {
            case "propose_gs_revision": {
              const result = await deps.service.proposeRevision(scope);
              return jsonResponse(
                { proposal: result.proposal, replayed: result.replayed },
                201
              );
            }
            case "accept_gs_revision": {
              const result = await deps.service.decideProposal({
                decision: "accept",
                proposalId: value.proposalId,
                scope,
              });
              return jsonResponse({
                draftId: result.draftId,
                proposal: result.proposal,
                replayed: result.replayed,
              });
            }
            case "reject_gs_revision": {
              const result = await deps.service.decideProposal({
                decision: "reject",
                proposalId: value.proposalId,
                scope,
              });
              return jsonResponse({
                draftId: null,
                proposal: result.proposal,
                replayed: result.replayed,
              });
            }
            case "request_editorial_review": {
              const result = await deps.service.requestEditorialReview({
                consent: {
                  consentCode: value.consentCode,
                  consentGranted: value.consentGranted,
                  disclosureScopes: value.disclosureScopes,
                  draftId: value.draftId,
                  // The exact content hash is bound from the current draft on the
                  // server; a browser never supplies an evidence hash.
                  draftContentSha256: null,
                  draftVersion: value.draftVersion,
                  factReferenceIds: value.factReferenceIds,
                },
                scope,
              });
              return jsonResponse(
                { replayed: result.replayed, review: result.review },
                201
              );
            }
            case "submit_editorial_feedback": {
              const result = await deps.service.submitEditorialFeedback({
                comments: value.comments.map((comment) => ({
                  body: comment.body,
                  proposedText: comment.proposedText ?? null,
                  sectionKey: comment.sectionKey ?? null,
                })),
                proposedEdits: value.proposedEdits,
                reviewId: value.reviewId,
                scope,
              });
              return jsonResponse({ review: result.review });
            }
            case "accept_editorial_review":
            case "reject_editorial_review": {
              const result = await deps.service.decideEditorialReview({
                decision:
                  value.action === "accept_editorial_review"
                    ? "accept"
                    : "reject",
                reviewId: value.reviewId,
                scope,
              });
              return jsonResponse({
                draftId: result.draftId,
                review: result.review,
              });
            }
            default:
              return errorResponse("Invalid Student 500 request.", 400);
          }
        },
        { mode: "write" }
      );
    },
  };
}

export type Student500DeepPreparationHandlers = ReturnType<
  typeof createStudent500DeepPreparationHandlers
>;
