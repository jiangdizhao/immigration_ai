// biome-ignore-all lint/suspicious/useAwait: HTTP handlers are asynchronous by contract.
import { z } from "zod";
import {
  SCHOOL_ADMISSIONS_EXTERNAL_ACTION_KINDS,
  SCHOOL_ADMISSIONS_MAX_EXCEPTION_TEXT,
  SCHOOL_ADMISSIONS_MAX_LABEL,
  SCHOOL_ADMISSIONS_MAX_NOTE,
  SCHOOL_ADMISSIONS_MAX_TEXT,
  SCHOOL_ADMISSIONS_OFFER_ACTIONS,
  SCHOOL_ADMISSIONS_ORIGIN_KINDS,
  SCHOOL_ADMISSIONS_OUTCOME_PROVENANCES,
  SCHOOL_ADMISSIONS_SERVICE_MODES,
  SchoolAdmissionsError,
} from "./contracts";
import type { SchoolAdmissionsService } from "./service";

/**
 * Phase 13 M5.2 HTTP surface.
 *
 * Actor and Project identity come from the authenticated session and the route;
 * every body is strict, so no caller can inject an owner, a case id, a project,
 * a status or an authority field. A disabled capability is indistinguishable from
 * an absent route, and a missing schema fails closed with 503.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_BODY_BYTES = 8 * 1024;

const Uuid = z.string().regex(UUID_PATTERN);
const OperationId = z.string().min(1).max(128).regex(OPERATION_ID_PATTERN);
const ExpectedRevision = z.number().int().positive().safe();
const DateString = z.string().regex(DATE_PATTERN);

const createBody = z
  .object({
    applicationId: Uuid.nullish(),
    courseTitle: z.string().min(1).max(SCHOOL_ADMISSIONS_MAX_TEXT).nullish(),
    institutionName: z
      .string()
      .min(1)
      .max(SCHOOL_ADMISSIONS_MAX_TEXT)
      .nullish(),
    intakeLabel: z.string().max(SCHOOL_ADMISSIONS_MAX_LABEL).nullish(),
    operationId: OperationId,
    originKind: z.enum(SCHOOL_ADMISSIONS_ORIGIN_KINDS),
    serviceMode: z.enum(SCHOOL_ADMISSIONS_SERVICE_MODES).optional(),
  })
  .strict();

const serviceModeBody = z
  .object({
    expectedRevision: ExpectedRevision,
    operationId: OperationId,
    serviceMode: z.enum(SCHOOL_ADMISSIONS_SERVICE_MODES),
  })
  .strict();

const prepareBody = z
  .object({
    expectedRevision: ExpectedRevision,
    locale: z.enum(["zh-CN", "en"]).optional(),
    operationId: OperationId,
  })
  .strict();

const confirmBody = z
  .object({
    expectedRevision: ExpectedRevision,
    operationId: OperationId,
    preparationId: Uuid,
  })
  .strict();

const outcomeBody = z
  .object({
    evidenceReferenceId: Uuid.nullish(),
    expiresOn: DateString.nullish(),
    expectedRevision: ExpectedRevision,
    kind: z.enum(["offer", "coe"]),
    operationId: OperationId,
    provenance: z.enum(SCHOOL_ADMISSIONS_OUTCOME_PROVENANCES),
    receivedOn: DateString.nullish(),
    state: z.enum(["received", "claimed", "obtained"]).optional(),
    validFrom: DateString.nullish(),
    validTo: DateString.nullish(),
  })
  .strict();

const transitionBody = z
  .object({
    action: z.enum(SCHOOL_ADMISSIONS_OFFER_ACTIONS).optional(),
    decisionOn: DateString.nullish(),
    expectedRevision: ExpectedRevision,
    kind: z.enum(["offer", "coe"]),
    operationId: OperationId,
    state: z.enum(["claimed", "obtained", "superseded"]).optional(),
  })
  .strict();

const externalActionBody = z
  .object({
    acknowledged: z.literal(true),
    actionKind: z.enum(SCHOOL_ADMISSIONS_EXTERNAL_ACTION_KINDS),
    expectedRevision: ExpectedRevision,
    note: z.string().max(SCHOOL_ADMISSIONS_MAX_NOTE).nullish(),
    operationId: OperationId,
    performedOn: DateString,
  })
  .strict();

const exceptionBody = z
  .object({
    description: z.string().min(1).max(SCHOOL_ADMISSIONS_MAX_EXCEPTION_TEXT),
    expectedRevision: ExpectedRevision,
    operationId: OperationId,
  })
  .strict();

const verifyExceptionBody = z
  .object({
    exceptionId: Uuid,
    expectedRevision: ExpectedRevision,
    operationId: OperationId,
  })
  .strict();

const readinessBody = z
  .object({ expectedRevision: ExpectedRevision, operationId: OperationId })
  .strict();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
    status,
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function mapError(error: unknown): Response {
  if (error instanceof SchoolAdmissionsError) {
    switch (error.code) {
      case "invalid_request":
      case "evidence_invalid":
        return errorResponse("Invalid school admissions request.", 400);
      case "actor_not_eligible":
      case "project_forbidden":
      case "case_not_found":
      case "application_not_found":
      case "outcome_not_found":
      case "exception_not_found":
        // Existence-hiding: unauthorized and absent are indistinguishable.
        return errorResponse("School admissions case not found.", 404);
      case "project_closed":
      case "case_archived":
      case "application_archived":
      case "revision_conflict":
      case "idempotency_conflict":
      case "state_conflict":
      case "limit_exceeded":
      case "evidence_unavailable":
        return errorResponse(
          "School admissions state changed. Refresh and try again.",
          409
        );
      case "authority_unavailable":
        // The requested verification/authority genuinely does not exist.
        return errorResponse(
          "This action requires an authority that is not available.",
          422
        );
      case "feature_disabled":
        return errorResponse("School admissions case not found.", 404);
      default:
        return errorResponse(
          "Unable to process the school admissions request.",
          500
        );
    }
  }
  return errorResponse("Unable to process the school admissions request.", 500);
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
      response: errorResponse("Invalid school admissions request.", 400),
    };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return { response: errorResponse("Request body is too large.", 413) };
  }
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return {
      response: errorResponse("Invalid school admissions request.", 400),
    };
  }
}

export type SchoolAdmissionsHandlerDependencies = {
  readonly authenticate: () => Promise<{
    readonly type: string;
    readonly userId: string;
  } | null>;
  readonly enabled: () => boolean;
  readonly schemaAvailable: () => Promise<boolean>;
  readonly service: SchoolAdmissionsService;
};

export function createSchoolAdmissionsHandlers(
  deps: SchoolAdmissionsHandlerDependencies
) {
  async function invoke(
    action: (actorUserId: string) => Promise<Response>
  ): Promise<Response> {
    if (!deps.enabled()) {
      return errorResponse("School admissions case not found.", 404);
    }
    const session = await deps.authenticate();
    if (!session) {
      return errorResponse("Authentication required.", 401);
    }
    if (session.type !== "regular") {
      // Staff and service accounts never receive customer admission data.
      return errorResponse("School admissions case not found.", 404);
    }
    let schemaReady: boolean;
    try {
      schemaReady = await deps.schemaAvailable();
    } catch {
      schemaReady = false;
    }
    if (!schemaReady) {
      return errorResponse("School admissions service is unavailable.", 503);
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
        response: errorResponse("Invalid school admissions request.", 400),
      };
    }
    return { value: parsed.data as z.infer<T> };
  }

  function validUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
  }

  return {
    async list(_request: Request, projectId: string): Promise<Response> {
      if (!validUuid(projectId)) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const result = await deps.service.list({ actorUserId, projectId });
        return jsonResponse({
          applications: result.applications,
          cases: result.cases,
          documents: result.documents,
          documentsUnavailable: result.documentsUnavailable,
        });
      });
    },

    async get(
      _request: Request,
      projectId: string,
      caseId: string
    ): Promise<Response> {
      if (!(validUuid(projectId) && validUuid(caseId))) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const result = await deps.service.get({
          actorUserId,
          caseId,
          projectId,
        });
        return jsonResponse({ case: result.case });
      });
    },

    async create(request: Request, projectId: string): Promise<Response> {
      if (!validUuid(projectId)) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, createBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.createCase({
          actorUserId,
          applicationId: body.value.applicationId ?? null,
          courseTitle: body.value.courseTitle ?? null,
          institutionName: body.value.institutionName ?? null,
          intakeLabel: body.value.intakeLabel ?? null,
          operationId: body.value.operationId,
          originKind: body.value.originKind,
          projectId,
          serviceMode: body.value.serviceMode,
        });
        return jsonResponse(
          { case: result.case, replayed: result.replayed },
          result.replayed ? 200 : 201
        );
      });
    },

    async setServiceMode(
      request: Request,
      projectId: string,
      caseId: string
    ): Promise<Response> {
      if (!(validUuid(projectId) && validUuid(caseId))) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, serviceModeBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.setServiceMode({
          actorUserId,
          caseId,
          expectedRevision: body.value.expectedRevision,
          operationId: body.value.operationId,
          projectId,
          serviceMode: body.value.serviceMode,
        });
        return jsonResponse({ case: result.case, replayed: result.replayed });
      });
    },

    async prepare(
      request: Request,
      projectId: string,
      caseId: string
    ): Promise<Response> {
      if (!(validUuid(projectId) && validUuid(caseId))) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, prepareBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.prepare({
          actorUserId,
          caseId,
          expectedRevision: body.value.expectedRevision,
          locale: body.value.locale,
          operationId: body.value.operationId,
          projectId,
        });
        return jsonResponse({
          case: result.case,
          preparationVersion: result.preparationVersion,
          replayed: result.replayed,
        });
      });
    },

    async confirmPreparation(
      request: Request,
      projectId: string,
      caseId: string
    ): Promise<Response> {
      if (!(validUuid(projectId) && validUuid(caseId))) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, confirmBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.confirmPreparation({
          actorUserId,
          caseId,
          expectedRevision: body.value.expectedRevision,
          operationId: body.value.operationId,
          preparationId: body.value.preparationId,
          projectId,
        });
        return jsonResponse({ case: result.case, replayed: result.replayed });
      });
    },

    async recordOutcome(
      request: Request,
      projectId: string,
      caseId: string
    ): Promise<Response> {
      if (!(validUuid(projectId) && validUuid(caseId))) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, outcomeBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.recordOutcome({
          actorUserId,
          caseId,
          evidenceReferenceId: body.value.evidenceReferenceId ?? null,
          expiresOn: body.value.expiresOn ?? null,
          expectedRevision: body.value.expectedRevision,
          kind: body.value.kind,
          operationId: body.value.operationId,
          projectId,
          provenance: body.value.provenance,
          receivedOn: body.value.receivedOn ?? null,
          state: body.value.state,
          validFrom: body.value.validFrom ?? null,
          validTo: body.value.validTo ?? null,
        });
        return jsonResponse(
          {
            case: result.case,
            outcomeId: result.outcomeId,
            replayed: result.replayed,
          },
          result.replayed ? 200 : 201
        );
      });
    },

    async transitionOutcome(
      request: Request,
      projectId: string,
      caseId: string,
      outcomeId: string
    ): Promise<Response> {
      if (
        !(validUuid(projectId) && validUuid(caseId) && validUuid(outcomeId))
      ) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, transitionBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.transitionOutcome({
          actorUserId,
          action: body.value.action,
          caseId,
          decisionOn: body.value.decisionOn ?? null,
          expectedRevision: body.value.expectedRevision,
          kind: body.value.kind,
          operationId: body.value.operationId,
          outcomeId,
          projectId,
          state: body.value.state,
        });
        return jsonResponse({
          case: result.case,
          outcomeId: result.outcomeId,
          replayed: result.replayed,
        });
      });
    },

    async recordExternalAction(
      request: Request,
      projectId: string,
      caseId: string
    ): Promise<Response> {
      if (!(validUuid(projectId) && validUuid(caseId))) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, externalActionBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.recordExternalAction({
          acknowledged: true,
          actionKind: body.value.actionKind,
          actorUserId,
          caseId,
          expectedRevision: body.value.expectedRevision,
          note: body.value.note ?? null,
          operationId: body.value.operationId,
          performedOn: body.value.performedOn,
          projectId,
        });
        return jsonResponse(
          {
            actionId: result.actionId,
            case: result.case,
            replayed: result.replayed,
          },
          result.replayed ? 200 : 201
        );
      });
    },

    async claimException(
      request: Request,
      projectId: string,
      caseId: string
    ): Promise<Response> {
      if (!(validUuid(projectId) && validUuid(caseId))) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, exceptionBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.claimException({
          actorUserId,
          caseId,
          description: body.value.description,
          expectedRevision: body.value.expectedRevision,
          operationId: body.value.operationId,
          projectId,
        });
        return jsonResponse(
          {
            case: result.case,
            exceptionId: result.exceptionId,
            replayed: result.replayed,
          },
          result.replayed ? 200 : 201
        );
      });
    },

    async verifyException(
      request: Request,
      projectId: string,
      caseId: string
    ): Promise<Response> {
      if (!(validUuid(projectId) && validUuid(caseId))) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, verifyExceptionBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.requestExceptionVerification({
          actorUserId,
          caseId,
          exceptionId: body.value.exceptionId,
          expectedRevision: body.value.expectedRevision,
          operationId: body.value.operationId,
          projectId,
        });
        return jsonResponse({
          case: result.case,
          exceptionId: result.exceptionId,
          replayed: result.replayed,
        });
      });
    },

    async evaluateReadiness(
      request: Request,
      projectId: string,
      caseId: string
    ): Promise<Response> {
      if (!(validUuid(projectId) && validUuid(caseId))) {
        return errorResponse("School admissions case not found.", 404);
      }
      return invoke(async (actorUserId) => {
        const body = await parsedBody(request, readinessBody);
        if ("response" in body) {
          return body.response;
        }
        const result = await deps.service.evaluateManagedReadiness({
          actorUserId,
          caseId,
          expectedRevision: body.value.expectedRevision,
          operationId: body.value.operationId,
          projectId,
        });
        return jsonResponse({ case: result.case, replayed: result.replayed });
      });
    },
  };
}

export type SchoolAdmissionsHandlers = ReturnType<
  typeof createSchoolAdmissionsHandlers
>;
