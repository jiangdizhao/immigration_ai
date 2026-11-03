import { z } from "zod";
import {
  STUDENT_500_AGE_BANDS,
  STUDENT_500_APPLICATION_PLACES,
  STUDENT_500_COE_STATUSES,
  STUDENT_500_DEPENDANT_BANDS,
  STUDENT_500_ENTRY_ROUTES,
  STUDENT_500_EVIDENCE_STATUSES,
  STUDENT_500_HISTORY_DECLARATIONS,
  STUDENT_500_HISTORY_FLAGS,
  STUDENT_500_MAX_ID,
  Student500Error,
} from "./contracts";
import type { Student500Service } from "./service";

/**
 * Phase 13 M6.1 HTTP surface.
 *
 * Every handler derives the actor from the authenticated session and the Project
 * from the route. Nothing in the body can supply, override or widen identity,
 * ownership, Project association, applicant identity, CoE verification, legal
 * verification or approval status: the strict schemas reject extra keys.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_BODY_BYTES = 8 * 1024;
const UUID = z.string().regex(UUID_PATTERN);
const OperationId = z.string().min(1).max(128).regex(OPERATION_ID_PATTERN);
const ExpectedRevision = z.number().int().positive().safe();

const contextSchema = z
  .object({
    applicantAgeBand: z.enum(STUDENT_500_AGE_BANDS).optional(),
    applicationPlace: z.enum(STUDENT_500_APPLICATION_PLACES).optional(),
    asOfDate: z.string().regex(ISO_DATE).nullish(),
    coeStatus: z.enum(STUDENT_500_COE_STATUSES).optional(),
    currentVisaSubclass: z.string().max(STUDENT_500_MAX_ID).nullish(),
    dependants: z.enum(STUDENT_500_DEPENDANT_BANDS).optional(),
    englishEvidence: z.enum(STUDENT_500_EVIDENCE_STATUSES).optional(),
    entryRoute: z.enum(STUDENT_500_ENTRY_ROUTES).nullish(),
    financialEvidence: z.enum(STUDENT_500_EVIDENCE_STATUSES).optional(),
    historyDeclaration: z.enum(STUDENT_500_HISTORY_DECLARATIONS).optional(),
    historyFlags: z
      .array(
        z
          .object({
            flag: z.enum(STUDENT_500_HISTORY_FLAGS),
            reportedOn: z.string().regex(ISO_DATE).nullish(),
          })
          .strict()
      )
      .max(8)
      .optional(),
    oshcEvidence: z.enum(STUDENT_500_EVIDENCE_STATUSES).optional(),
    schoolApplicationId: UUID.nullish(),
  })
  .strict();

const createBody = z
  .object({ context: contextSchema.optional(), operationId: OperationId })
  .strict();
const updateBody = z
  .object({
    context: contextSchema.optional(),
    expectedRevision: ExpectedRevision,
    operationId: OperationId,
  })
  .strict();
const transitionBody = z
  .object({ expectedRevision: ExpectedRevision, operationId: OperationId })
  .strict();

type AuthenticatedSession = { userId: string; type: "guest" | "regular" };

type HandlerDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  /** Explicit M6.1 capability; OFF in production-like environments by default. */
  enabled: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  /** Project-wide emergency disable (`PHASE13_PROJECT_CHAT_ENABLED`). */
  projectWritesEnabled?: () => boolean;
  service: Pick<
    Student500Service,
    "list" | "get" | "create" | "update" | "archive"
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
  if (error instanceof Student500Error) {
    switch (error.code) {
      case "invalid_request":
        return errorResponse("Invalid Student 500 request.", 400);
      case "actor_not_eligible":
      case "project_not_found":
      case "project_forbidden":
      case "application_not_found":
      case "reference_invalid":
        // Existence-hiding: unauthorized and absent are indistinguishable.
        return errorResponse("Student 500 application not found.", 404);
      case "project_closed":
      case "application_archived":
      case "revision_conflict":
      case "idempotency_conflict":
      case "state_conflict":
      case "reference_unavailable":
        return errorResponse(
          "Student 500 application state changed. Refresh and try again.",
          409
        );
      case "limit_exceeded":
        return errorResponse(
          "This Project already has the maximum number of Student 500 applications.",
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

export function createStudent500Handlers(deps: HandlerDependencies) {
  async function invoke(
    action: (actorUserId: string) => Promise<Response>,
    options: { readonly mode?: "read" | "write" } = {}
  ): Promise<Response> {
    // A disabled capability is indistinguishable from an absent route.
    if (!deps.enabled()) {
      return errorResponse("Student 500 application not found.", 404);
    }
    const session = await deps.authenticate();
    if (!session) {
      return errorResponse("Authentication required.", 401);
    }
    if (session.type !== "regular") {
      // Guest identities cannot hold persistent applicant preparation data.
      return errorResponse("Student 500 application not found.", 404);
    }
    if (options.mode === "write" && !(deps.projectWritesEnabled?.() ?? true)) {
      return errorResponse(
        "Student 500 application changes are disabled right now.",
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
      // Partial or missing schema fails closed instead of degrading.
      return errorResponse(
        "Student 500 applications are unavailable right now.",
        503
      );
    }
    try {
      return await action(session.userId);
    } catch (error) {
      return mapError(error);
    }
  }

  function validProjectId(projectId: string): boolean {
    return UUID_PATTERN.test(projectId);
  }

  function validApplicationPath(projectId: string, applicationId: string) {
    return validProjectId(projectId) && UUID_PATTERN.test(applicationId);
  }

  async function parsedBody<T>(
    request: Request,
    schema: z.ZodType<T>
  ): Promise<{ value: T } | { response: Response }> {
    const body = await readBoundedJson(request);
    if ("response" in body) {
      return body;
    }
    const parsed = schema.safeParse(body.value);
    if (!parsed.success) {
      return {
        response: errorResponse("Invalid Student 500 request.", 400),
      };
    }
    return { value: parsed.data };
  }

  function mutate(action: (actorUserId: string) => Promise<Response>) {
    return invoke(action, { mode: "write" });
  }

  return {
    list(_request: Request, projectId: string) {
      return invoke(async (actorUserId) => {
        if (!validProjectId(projectId)) {
          return errorResponse("Invalid Student 500 request.", 400);
        }
        return jsonResponse({
          applications: await deps.service.list({ actorUserId, projectId }),
        });
      });
    },

    get(_request: Request, projectId: string, applicationId: string) {
      return invoke(async (actorUserId) => {
        if (!validApplicationPath(projectId, applicationId)) {
          return errorResponse("Invalid Student 500 request.", 400);
        }
        return jsonResponse({
          application: await deps.service.get({
            actorUserId,
            applicationId,
            projectId,
          }),
        });
      });
    },

    create(request: Request, projectId: string) {
      return mutate(async (actorUserId) => {
        if (!validProjectId(projectId)) {
          return errorResponse("Invalid Student 500 request.", 400);
        }
        const body = await parsedBody(request, createBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.create({
          actorUserId,
          context: body.value.context,
          operationId: body.value.operationId,
          projectId,
        });
        return jsonResponse(
          { application: result.application, replayed: result.replayed },
          201
        );
      });
    },

    update(request: Request, projectId: string, applicationId: string) {
      return mutate(async (actorUserId) => {
        if (!validApplicationPath(projectId, applicationId)) {
          return errorResponse("Invalid Student 500 request.", 400);
        }
        const body = await parsedBody(request, updateBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.update({
          actorUserId,
          applicationId,
          context: body.value.context,
          expectedRevision: body.value.expectedRevision,
          operationId: body.value.operationId,
          projectId,
        });
        return jsonResponse({
          application: result.application,
          replayed: result.replayed,
        });
      });
    },

    archive(request: Request, projectId: string, applicationId: string) {
      return mutate(async (actorUserId) => {
        if (!validApplicationPath(projectId, applicationId)) {
          return errorResponse("Invalid Student 500 request.", 400);
        }
        const body = await parsedBody(request, transitionBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.archive({
          actorUserId,
          applicationId,
          expectedRevision: body.value.expectedRevision,
          operationId: body.value.operationId,
          projectId,
        });
        return jsonResponse({
          application: result.application,
          replayed: result.replayed,
        });
      });
    },
  };
}

export type Student500Handlers = ReturnType<typeof createStudent500Handlers>;
