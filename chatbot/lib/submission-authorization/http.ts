import { z } from "zod";
import {
  EXTERNAL_EVIDENCE_PROVENANCES,
  EXTERNAL_OUTCOME_CODES,
  EXTERNAL_RECORD_KINDS,
  EXTERNAL_SUBMISSION_CHANNELS,
  SubmissionAuthorizationError,
} from "./contracts";
import type { SubmissionAuthorizationService } from "./service";

/**
 * Phase 13 M8.2 HTTP surface.
 *
 * Same posture as the accepted M5.1/M6.x/M7/M8.1 handlers: the actor comes from the
 * authenticated session, the Project comes from the route, and every body schema is
 * strict. A payload can never supply an actor, a role, a digest the server did not
 * compute, a package identity the server did not verify, a verification verdict or a
 * provenance upgrade.
 *
 * Five bounded actions exist and nothing else:
 *
 *   - `authorize_self_service`
 *   - `authorize_managed_service`
 *   - `request_handoff`
 *   - `respond_to_handoff` (accept / decline / cancel)
 *   - `record_external_record`
 */

const MAX_BODY_BYTES = 16 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

const targetFields = {
  operationId: z.string().regex(OPERATION_ID),
  targetId: z.string().regex(UUID),
  targetKind: z.enum([
    "managed_school_application",
    "student_500_visa_application",
  ]),
};

const authorizeBody = z
  .object({
    acknowledgedDisclosures: z.array(z.string().min(1).max(64)).min(1).max(16),
    action: z.enum(["authorize_self_service", "authorize_managed_service"]),
    ...targetFields,
    packageVersionId: z.string().regex(UUID),
  })
  .strict();

const requestHandoffBody = z
  .object({
    action: z.literal("request_handoff"),
    ...targetFields,
    packageVersionId: z.string().regex(UUID),
    recipientUserId: z.string().regex(UUID).nullish(),
  })
  .strict();

const respondBody = z
  .object({
    action: z.literal("respond_to_handoff"),
    decision: z.enum(["accept", "decline", "cancel"]),
    expectedRevision: z.number().int().positive().safe(),
    handoffId: z.string().regex(UUID),
    operationId: z.string().regex(OPERATION_ID),
    reasonCode: z.string().min(1).max(64).nullish(),
    targetId: z.string().regex(UUID),
    targetKind: z.enum([
      "managed_school_application",
      "student_500_visa_application",
    ]),
  })
  .strict();

const recordExternalBody = z
  .object({
    action: z.literal("record_external_record"),
    ...targetFields,
    channel: z.enum(EXTERNAL_SUBMISSION_CHANNELS).nullish(),
    handoffId: z.string().regex(UUID).nullish(),
    kind: z.enum(EXTERNAL_RECORD_KINDS),
    occurredAt: z.string().min(1).max(40).nullish(),
    outcomeCode: z.enum(EXTERNAL_OUTCOME_CODES).nullish(),
    packageVersionId: z.string().regex(UUID),
    provenance: z.enum(EXTERNAL_EVIDENCE_PROVENANCES),
    reference: z.string().min(1).max(128).nullish(),
  })
  .strict();

const actionBody = z.discriminatedUnion("action", [
  authorizeBody,
  requestHandoffBody,
  respondBody,
  recordExternalBody,
]);

type AuthenticatedSession = { userId: string; type: "guest" | "regular" };

type HandlerDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  enabled: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  projectWritesEnabled?: () => boolean;
  service: Pick<
    SubmissionAuthorizationService,
    | "authorizeManagedService"
    | "authorizeSelfService"
    | "get"
    | "recordExternalRecord"
    | "requestHandoff"
    | "transitionHandoff"
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

/**
 * Status mapping is intentionally blunt about hidden resources: an ineligible actor,
 * a foreign Project and a missing target are all `404`, so existence never leaks.
 */
function mapError(error: unknown): Response {
  if (!(error instanceof SubmissionAuthorizationError)) {
    return errorResponse("Submission authorization failed.", 500);
  }
  switch (error.code) {
    case "invalid_request":
      return errorResponse("Invalid submission authorization request.", 400);
    case "disclosure_not_acknowledged":
      return errorResponse("Required disclosures must be acknowledged.", 400);
    case "evidence_provenance_invalid":
      return errorResponse(
        "External evidence provenance is not acceptable.",
        400
      );
    case "actor_not_eligible":
    case "actor_not_staff":
    case "project_not_found":
    case "project_forbidden":
    case "target_not_found":
    case "authorization_not_found":
    case "handoff_not_found":
      return errorResponse("Submission authorization not found.", 404);
    case "handoff_actor_not_authorized":
      return errorResponse("This action is not permitted.", 403);
    case "package_not_found":
    case "package_not_current":
    case "package_integrity_unverified":
    case "confirmation_missing":
    case "confirmation_not_current":
    case "confirmation_not_finalized":
    case "confirmation_policy_unknown":
      return errorResponse("The submission package changed.", 409);
    case "authorization_not_current":
    case "handoff_not_current":
    case "handoff_state_conflict":
    case "revision_conflict":
      return errorResponse("Submission authorization changed.", 409);
    case "professional_authority_denied":
    case "professional_authority_unavailable":
    case "professional_credential_unverified":
    case "professional_credential_unavailable":
    case "professional_review_missing":
    case "readiness_not_ready":
      return errorResponse("Managed service is not available.", 403);
    case "readiness_unknown":
    case "source_unavailable":
    case "evidence_verifier_unavailable":
      return errorResponse("Submission authorization is unavailable.", 503);
    case "project_closed":
      return errorResponse("Project is closed.", 409);
    case "idempotency_conflict":
    case "integrity_conflict":
      return errorResponse("Submission authorization conflict.", 409);
    case "limit_exceeded":
      return errorResponse("Submission authorization limit reached.", 429);
    default:
      return errorResponse("Submission authorization failed.", 500);
  }
}

async function readBoundedJson(
  request: Request
): Promise<{ value: unknown } | { response: Response }> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return {
      response: errorResponse("Invalid submission authorization request.", 400),
    };
  }
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return {
      response: errorResponse("Invalid submission authorization request.", 400),
    };
  }
}

export function createSubmissionAuthorizationHandlers(
  deps: HandlerDependencies
) {
  async function invoke(
    action: (actorUserId: string) => Promise<Response>,
    options: { readonly mode?: "read" | "write" } = {}
  ): Promise<Response> {
    if (!deps.enabled()) {
      return errorResponse("Submission authorization is not available.", 404);
    }
    const session = await deps.authenticate();
    if (!session) {
      return errorResponse("Authentication required.", 401);
    }
    if (session.type !== "regular") {
      return errorResponse("Submission authorization not found.", 404);
    }
    if (options.mode === "write" && !(deps.projectWritesEnabled?.() ?? true)) {
      return errorResponse(
        "Submission authorization changes are disabled right now.",
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
      return errorResponse("Submission authorization is unavailable.", 503);
    }
    try {
      return await action(session.userId);
    } catch (error) {
      return mapError(error);
    }
  }

  return {
    /** Read the authorization workspace for one Project target. */
    get(request: Request, projectId: string) {
      return invoke(async (actorUserId) => {
        if (typeof projectId !== "string" || projectId.length === 0) {
          return errorResponse(
            "Invalid submission authorization request.",
            400
          );
        }
        const url = new URL(request.url);
        const targetKind = url.searchParams.get("targetKind");
        const targetId = url.searchParams.get("targetId") ?? "";
        if (
          (targetKind !== "managed_school_application" &&
            targetKind !== "student_500_visa_application") ||
          !UUID.test(targetId)
        ) {
          return errorResponse(
            "Invalid submission authorization request.",
            400
          );
        }
        return jsonResponse(
          await deps.service.get({
            actorUserId,
            projectId,
            targetId,
            targetKind,
          })
        );
      });
    },

    act(request: Request, projectId: string) {
      return invoke(
        async (actorUserId) => {
          if (typeof projectId !== "string" || projectId.length === 0) {
            return errorResponse(
              "Invalid submission authorization request.",
              400
            );
          }
          const body = await readBoundedJson(request);
          if ("response" in body) {
            return body.response;
          }
          const parsed = actionBody.safeParse(body.value);
          if (!parsed.success) {
            return errorResponse(
              "Invalid submission authorization request.",
              400
            );
          }
          const input = parsed.data;
          switch (input.action) {
            case "authorize_self_service":
            case "authorize_managed_service": {
              const shared = {
                acknowledgedDisclosures: input.acknowledgedDisclosures,
                actorUserId,
                operationId: input.operationId,
                packageVersionId: input.packageVersionId,
                projectId,
                targetId: input.targetId,
                targetKind: input.targetKind,
              };
              const result =
                input.action === "authorize_self_service"
                  ? await deps.service.authorizeSelfService(shared)
                  : await deps.service.authorizeManagedService(shared);
              return jsonResponse(result, result.replayed ? 200 : 201);
            }
            case "request_handoff": {
              const result = await deps.service.requestHandoff({
                actorUserId,
                operationId: input.operationId,
                packageVersionId: input.packageVersionId,
                projectId,
                recipientUserId: input.recipientUserId ?? null,
                targetId: input.targetId,
                targetKind: input.targetKind,
              });
              return jsonResponse(result, result.replayed ? 200 : 201);
            }
            case "respond_to_handoff": {
              const result = await deps.service.transitionHandoff({
                action: input.decision,
                actorUserId,
                expectedRevision: input.expectedRevision,
                handoffId: input.handoffId,
                operationId: input.operationId,
                projectId,
                reasonCode: input.reasonCode ?? null,
                targetId: input.targetId,
                targetKind: input.targetKind,
              });
              return jsonResponse(result, result.replayed ? 200 : 201);
            }
            case "record_external_record": {
              const result = await deps.service.recordExternalRecord({
                actorUserId,
                channel: input.channel ?? null,
                handoffId: input.handoffId ?? null,
                kind: input.kind,
                occurredAt: input.occurredAt ?? null,
                operationId: input.operationId,
                outcomeCode: input.outcomeCode ?? null,
                packageVersionId: input.packageVersionId,
                projectId,
                provenance: input.provenance,
                reference: input.reference ?? null,
                targetId: input.targetId,
                targetKind: input.targetKind,
              });
              return jsonResponse(result, result.replayed ? 200 : 201);
            }
            default:
              return errorResponse(
                "Invalid submission authorization request.",
                400
              );
          }
        },
        { mode: "write" }
      );
    },
  };
}
