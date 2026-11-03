import { z } from "zod";
import {
  STUDENT_500_GS_MAX_SECTION_TEXT,
  STUDENT_500_GS_MAX_SECTIONS,
  STUDENT_500_SCHOOL_CONTEXT_KINDS,
  Student500PreparationError,
} from "./contracts";
import type { Student500PreparationService } from "./service";

/**
 * Phase 13 M6.2 HTTP surface.
 *
 * Every handler derives the actor from the authenticated session and the Project
 * from the route. Strict schemas reject extra keys, so a payload can never supply
 * identity, ownership, verification, provenance, professional approval or an
 * AI-use grant: the server derives all of those from M2/M5.2/M6.1 state.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_BODY_BYTES = 16 * 1024;
const UUID = z.string().regex(UUID_PATTERN);
const OperationId = z.string().min(1).max(128).regex(OPERATION_ID_PATTERN);
const ExpectedRevision = z.number().int().positive().safe();

const selectFactBody = z
  .object({
    action: z.literal("select_fact"),
    factAssertionId: UUID,
    factVersion: z.number().int().positive().safe(),
    operationId: OperationId,
  })
  .strict();

const unselectFactBody = z
  .object({
    action: z.literal("unselect_fact"),
    factReferenceId: UUID,
    operationId: OperationId,
  })
  .strict();

const schoolContextBody = z
  .object({
    action: z.literal("set_school_context"),
    admissionCaseId: UUID.nullish(),
    expectedRevision: ExpectedRevision.nullish(),
    kind: z.enum(STUDENT_500_SCHOOL_CONTEXT_KINDS),
    operationId: OperationId,
    schoolApplicationId: UUID.nullish(),
  })
  .strict();

const createDraftBody = z
  .object({ action: z.literal("create_gs_draft"), operationId: OperationId })
  .strict();

const saveDraftBody = z
  .object({
    action: z.literal("save_gs_draft"),
    baseDraftId: UUID,
    edits: z
      .array(
        z
          .object({
            sectionKey: z.string().min(1).max(64),
            text: z.string().min(1).max(STUDENT_500_GS_MAX_SECTION_TEXT),
          })
          .strict()
      )
      .min(1)
      .max(STUDENT_500_GS_MAX_SECTIONS),
    operationId: OperationId,
  })
  .strict();

const snapshotBody = z
  .object({
    action: z.literal("create_preparation_snapshot"),
    operationId: OperationId,
  })
  .strict();

const actionBody = z.discriminatedUnion("action", [
  selectFactBody,
  unselectFactBody,
  schoolContextBody,
  createDraftBody,
  saveDraftBody,
  snapshotBody,
]);

type AuthenticatedSession = { userId: string; type: "guest" | "regular" };

type HandlerDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  enabled: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  projectWritesEnabled?: () => boolean;
  service: Pick<
    Student500PreparationService,
    | "get"
    | "getDraft"
    | "getSnapshot"
    | "selectFact"
    | "unselectFact"
    | "setSchoolContext"
    | "createDraft"
    | "saveDraft"
    | "createSnapshot"
  >;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "private, no-store" },
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
        return errorResponse("Invalid Student 500 preparation request.", 400);
      case "actor_not_eligible":
      case "project_not_found":
      case "project_forbidden":
      case "application_not_found":
      case "draft_not_found":
      case "snapshot_not_found":
        // Existence-hiding: unauthorized and absent are indistinguishable.
        return errorResponse("Student 500 preparation not found.", 404);
      case "project_closed":
      case "application_archived":
      case "revision_conflict":
      case "version_conflict":
      case "idempotency_conflict":
      case "state_conflict":
        return errorResponse(
          "Student 500 preparation state changed. Refresh and try again.",
          409
        );
      case "fact_not_available":
      case "school_context_unavailable":
        return errorResponse(
          "That reference is not currently available for this preparation.",
          409
        );
      case "school_context_invalid":
        return errorResponse(
          "Invalid school context for this preparation.",
          400
        );
      case "limit_exceeded":
        return errorResponse(
          "This Student 500 preparation has reached a preparation limit.",
          409
        );
      default:
        return errorResponse("Unable to process the Student 500 request.", 500);
    }
  }
  return errorResponse("Unable to process the Student 500 request.", 500);
}

async function readBoundedJson(
  request: Request
): Promise<{ readonly value: unknown } | { readonly response: Response }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { response: errorResponse("Expected a JSON request body.", 415) };
  }
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { response: errorResponse("Request body is too large.", 413) };
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { response: errorResponse("Invalid Student 500 request.", 400) };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return { response: errorResponse("Request body is too large.", 413) };
  }
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return { response: errorResponse("Invalid Student 500 request.", 400) };
  }
}

export function createStudent500PreparationHandlers(deps: HandlerDependencies) {
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
      return errorResponse(
        "Student 500 preparation is unavailable right now.",
        503
      );
    }
    try {
      return await action(session.userId);
    } catch (error) {
      return mapError(error);
    }
  }

  const validPath = (projectId: string, applicationId: string) =>
    UUID_PATTERN.test(projectId) && UUID_PATTERN.test(applicationId);

  return {
    get(_request: Request, projectId: string, applicationId: string) {
      return invoke(async (actorUserId) => {
        if (!validPath(projectId, applicationId)) {
          return errorResponse("Invalid Student 500 request.", 400);
        }
        return jsonResponse({
          preparation: await deps.service.get({
            actorUserId,
            applicationId,
            projectId,
          }),
        });
      });
    },

    getDraft(
      _request: Request,
      projectId: string,
      applicationId: string,
      draftId: string
    ) {
      return invoke(async (actorUserId) => {
        if (
          !validPath(projectId, applicationId) ||
          !UUID_PATTERN.test(draftId)
        ) {
          return errorResponse("Invalid Student 500 request.", 400);
        }
        return jsonResponse({
          draft: await deps.service.getDraft({
            actorUserId,
            applicationId,
            draftId,
            projectId,
          }),
        });
      });
    },

    getSnapshot(
      _request: Request,
      projectId: string,
      applicationId: string,
      snapshotId: string
    ) {
      return invoke(async (actorUserId) => {
        if (
          !validPath(projectId, applicationId) ||
          !UUID_PATTERN.test(snapshotId)
        ) {
          return errorResponse("Invalid Student 500 request.", 400);
        }
        return jsonResponse({
          snapshot: await deps.service.getSnapshot({
            actorUserId,
            applicationId,
            projectId,
            snapshotId,
          }),
        });
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
            case "select_fact": {
              const result = await deps.service.selectFact({
                ...scope,
                factAssertionId: value.factAssertionId,
                factVersion: value.factVersion,
                operationId: value.operationId,
              });
              return jsonResponse(
                { reference: result.reference, replayed: result.replayed },
                201
              );
            }
            case "unselect_fact": {
              const result = await deps.service.unselectFact({
                ...scope,
                factReferenceId: value.factReferenceId,
                operationId: value.operationId,
              });
              return jsonResponse({
                reference: result.reference,
                replayed: result.replayed,
              });
            }
            case "set_school_context": {
              const result = await deps.service.setSchoolContext({
                ...scope,
                admissionCaseId: value.admissionCaseId ?? null,
                expectedRevision: value.expectedRevision ?? null,
                kind: value.kind,
                operationId: value.operationId,
                schoolApplicationId: value.schoolApplicationId ?? null,
              });
              return jsonResponse({
                replayed: result.replayed,
                schoolContext: result.schoolContext,
              });
            }
            case "create_gs_draft": {
              const result = await deps.service.createDraft({
                ...scope,
                operationId: value.operationId,
              });
              return jsonResponse(
                { draft: result.draft, replayed: result.replayed },
                201
              );
            }
            case "save_gs_draft": {
              const result = await deps.service.saveDraft({
                ...scope,
                baseDraftId: value.baseDraftId,
                edits: value.edits,
                operationId: value.operationId,
              });
              return jsonResponse(
                { draft: result.draft, replayed: result.replayed },
                201
              );
            }
            case "create_preparation_snapshot": {
              const result = await deps.service.createSnapshot({
                ...scope,
                operationId: value.operationId,
              });
              return jsonResponse(
                { replayed: result.replayed, snapshot: result.snapshot },
                201
              );
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
