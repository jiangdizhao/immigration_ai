import { z } from "zod";
import {
  SCHOOL_APPLICATION_MAX_ID,
  SCHOOL_APPLICATION_MAX_LABEL,
  SCHOOL_APPLICATION_MAX_TEXT,
  SCHOOL_APPLICATION_REFERENCE_KINDS,
  SchoolApplicationError,
} from "./contracts";
import type { SchoolApplicationService } from "./service";

/**
 * Phase 13 M5.1 HTTP surface.
 *
 * Every handler derives the actor from the authenticated session and the Project
 * from the route. Nothing in the body can supply, override or widen identity,
 * ownership, Project association or status: the strict schemas reject extra keys.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_BODY_BYTES = 8 * 1024;
const UUID = z.string().regex(UUID_PATTERN);
const OperationId = z.string().min(1).max(128).regex(OPERATION_ID_PATTERN);
const ExpectedRevision = z.number().int().positive().safe();
const TargetText = z.string().min(1).max(SCHOOL_APPLICATION_MAX_TEXT);
const CatalogId = z.string().min(1).max(SCHOOL_APPLICATION_MAX_ID);

const targetFields = {
  courseId: CatalogId.nullish(),
  courseTitle: TargetText,
  deliveryId: CatalogId.nullish(),
  institutionId: CatalogId.nullish(),
  institutionName: TargetText,
  intakeId: CatalogId.nullish(),
  intakeLabel: z.string().max(SCHOOL_APPLICATION_MAX_LABEL).nullish(),
};

const createBody = z
  .object({ operationId: OperationId, ...targetFields })
  .strict();
const updateBody = z
  .object({
    expectedRevision: ExpectedRevision,
    operationId: OperationId,
    ...targetFields,
  })
  .strict();
const transitionBody = z
  .object({ expectedRevision: ExpectedRevision, operationId: OperationId })
  .strict();
const bindReferenceBody = z
  .object({
    expectedRevision: ExpectedRevision,
    kind: z.enum(SCHOOL_APPLICATION_REFERENCE_KINDS),
    operationId: OperationId,
    referenceId: UUID,
  })
  .strict();

type AuthenticatedSession = { userId: string; type: "guest" | "regular" };

type HandlerDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  /** Explicit M5.1 capability; defaults OFF in production. */
  enabled: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  service: Pick<
    SchoolApplicationService,
    | "list"
    | "get"
    | "create"
    | "update"
    | "archive"
    | "bindReference"
    | "revokeReference"
    | "buildPackage"
    | "listPackages"
  >;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function mapError(error: unknown): Response {
  if (error instanceof SchoolApplicationError) {
    switch (error.code) {
      case "invalid_request":
        return errorResponse("Invalid school application request.", 400);
      case "actor_not_eligible":
      case "project_not_found":
      case "project_forbidden":
      case "application_not_found":
      case "reference_invalid":
        // Existence-hiding: unauthorized and absent are indistinguishable.
        return errorResponse("School application not found.", 404);
      case "project_closed":
      case "application_archived":
      case "revision_conflict":
      case "idempotency_conflict":
      case "state_conflict":
      case "package_conflict":
      case "reference_unavailable":
        return errorResponse(
          "School application state changed. Refresh and try again.",
          409
        );
      case "limit_exceeded":
        return errorResponse(
          "This Project already has the maximum number of school applications.",
          409
        );
      default:
        return errorResponse(
          "Unable to process the school application request.",
          500
        );
    }
  }
  return errorResponse(
    "Unable to process the school application request.",
    500
  );
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
    return {
      response: errorResponse("Invalid school application request.", 400),
    };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return { response: errorResponse("Request body is too large.", 413) };
  }
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return {
      response: errorResponse("Invalid school application request.", 400),
    };
  }
}

export function createSchoolApplicationHandlers(deps: HandlerDependencies) {
  async function invoke(
    action: (actorUserId: string) => Promise<Response>
  ): Promise<Response> {
    // A disabled capability is indistinguishable from an absent route.
    if (!deps.enabled()) {
      return errorResponse("School application not found.", 404);
    }
    const session = await deps.authenticate();
    if (!session) {
      return errorResponse("Authentication required.", 401);
    }
    if (session.type !== "regular") {
      return errorResponse("School application not found.", 404);
    }
    let schemaReady: boolean;
    try {
      schemaReady = await deps.schemaAvailable();
    } catch {
      schemaReady = false;
    }
    if (!schemaReady) {
      // Partial or missing schema fails closed instead of degrading.
      return errorResponse("School application service is unavailable.", 503);
    }
    try {
      return await action(session.userId);
    } catch (error) {
      return mapError(error);
    }
  }

  async function parsedBody<T extends z.ZodTypeAny>(
    request: Request,
    schema: T
  ): Promise<{ readonly value: z.infer<T> } | { readonly response: Response }> {
    const body = await readBoundedJson(request);
    if ("response" in body) {
      return body;
    }
    const parsed = schema.safeParse(body.value);
    if (!parsed.success) {
      return {
        response: errorResponse("Invalid school application request.", 400),
      };
    }
    return { value: parsed.data };
  }

  function validProjectId(projectId: string): boolean {
    return UUID_PATTERN.test(projectId);
  }

  function validApplicationPath(projectId: string, applicationId: string) {
    return validProjectId(projectId) && UUID_PATTERN.test(applicationId);
  }

  return {
    list(_request: Request, projectId: string) {
      return invoke(async (actorUserId) => {
        if (!validProjectId(projectId)) {
          return errorResponse("Invalid school application request.", 400);
        }
        return jsonResponse({
          applications: await deps.service.list({ actorUserId, projectId }),
        });
      });
    },

    get(_request: Request, projectId: string, applicationId: string) {
      return invoke(async (actorUserId) => {
        if (!validApplicationPath(projectId, applicationId)) {
          return errorResponse("Invalid school application request.", 400);
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

    create(_request: Request, projectId: string) {
      return invoke(async (actorUserId) => {
        if (!validProjectId(projectId)) {
          return errorResponse("Invalid school application request.", 400);
        }
        const body = await parsedBody(_request, createBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.create({
          actorUserId,
          projectId,
          ...body.value,
        });
        return jsonResponse(
          { application: result.application, replayed: result.replayed },
          201
        );
      });
    },

    update(_request: Request, projectId: string, applicationId: string) {
      return invoke(async (actorUserId) => {
        if (!validApplicationPath(projectId, applicationId)) {
          return errorResponse("Invalid school application request.", 400);
        }
        const body = await parsedBody(_request, updateBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.update({
          actorUserId,
          applicationId,
          projectId,
          ...body.value,
        });
        return jsonResponse({
          application: result.application,
          replayed: result.replayed,
        });
      });
    },

    archive(_request: Request, projectId: string, applicationId: string) {
      return invoke(async (actorUserId) => {
        if (!validApplicationPath(projectId, applicationId)) {
          return errorResponse("Invalid school application request.", 400);
        }
        const body = await parsedBody(_request, transitionBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.archive({
          actorUserId,
          applicationId,
          projectId,
          ...body.value,
        });
        return jsonResponse({
          application: result.application,
          replayed: result.replayed,
        });
      });
    },

    bindReference(_request: Request, projectId: string, applicationId: string) {
      return invoke(async (actorUserId) => {
        if (!validApplicationPath(projectId, applicationId)) {
          return errorResponse("Invalid school application request.", 400);
        }
        const body = await parsedBody(_request, bindReferenceBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.bindReference({
          actorUserId,
          applicationId,
          projectId,
          ...body.value,
        });
        return jsonResponse({
          application: result.application,
          replayed: result.replayed,
        });
      });
    },

    revokeReference(
      _request: Request,
      projectId: string,
      applicationId: string,
      referenceRecordId: string
    ) {
      return invoke(async (actorUserId) => {
        if (
          !(
            validApplicationPath(projectId, applicationId) &&
            UUID_PATTERN.test(referenceRecordId)
          )
        ) {
          return errorResponse("Invalid school application request.", 400);
        }
        const body = await parsedBody(_request, transitionBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.revokeReference({
          actorUserId,
          applicationId,
          projectId,
          referenceRecordId,
          ...body.value,
        });
        return jsonResponse({
          application: result.application,
          replayed: result.replayed,
        });
      });
    },

    buildPackage(_request: Request, projectId: string, applicationId: string) {
      return invoke(async (actorUserId) => {
        if (!validApplicationPath(projectId, applicationId)) {
          return errorResponse("Invalid school application request.", 400);
        }
        const body = await parsedBody(_request, transitionBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.buildPackage({
          actorUserId,
          applicationId,
          projectId,
          ...body.value,
        });
        return jsonResponse({
          application: result.application,
          package: result.package,
          replayed: result.replayed,
          reusedCurrentPackage: result.reusedCurrentPackage,
        });
      });
    },

    listPackages(_request: Request, projectId: string, applicationId: string) {
      return invoke(async (actorUserId) => {
        if (!validApplicationPath(projectId, applicationId)) {
          return errorResponse("Invalid school application request.", 400);
        }
        return jsonResponse(
          await deps.service.listPackages({
            actorUserId,
            applicationId,
            projectId,
          })
        );
      });
    },
  };
}

export type SchoolApplicationHandlers = ReturnType<
  typeof createSchoolApplicationHandlers
>;
