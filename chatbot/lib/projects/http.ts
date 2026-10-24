import { z } from "zod";
import type { createProjectFoundationRepository } from "@/lib/db/project-foundation";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_BODY_BYTES = 8 * 1024;
const UUID = z.string().regex(UUID_PATTERN);
const OperationId = z.string().min(1).max(128).regex(OPERATION_ID_PATTERN);
const ExpectedRevision = z.number().int().positive().safe();

const createProjectBody = z.object({ operationId: OperationId }).strict();
const closeProjectBody = z
  .object({ operationId: OperationId, expectedRevision: ExpectedRevision })
  .strict();
const inviteMemberBody = z
  .object({
    operationId: OperationId,
    expectedRevision: ExpectedRevision,
    targetUserId: UUID,
  })
  .strict();
const membershipTransitionBody = z
  .object({ operationId: OperationId, expectedRevision: ExpectedRevision })
  .strict();

type Repository = Pick<
  ReturnType<typeof createProjectFoundationRepository>,
  | "isRegisteredCustomer"
  | "listProjects"
  | "createProject"
  | "getProjectForActor"
  | "closeProject"
  | "listProjectMembers"
  | "inviteProjectMember"
  | "listPendingInvitations"
  | "acceptProjectMembership"
  | "revokeProjectMembership"
>;
type AuthenticatedSession = { userId: string; type: "guest" | "regular" };
type RateLimitAction = "invite" | "invitation_inbox";

type HttpDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  isRegisteredCustomer: Repository["isRegisteredCustomer"];
  schemaAvailable: () => Promise<boolean>;
  repository: Repository;
  rateLimit?: (input: {
    actorUserId: string;
    ipAddress: string | null;
    action: RateLimitAction;
  }) => Promise<boolean>;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function mapError(error: unknown): Response {
  if (error instanceof ProjectFoundationError) {
    switch (error.code) {
      case "invalid_operation_id":
      case "invalid_request":
        return errorResponse("Invalid project request.", 400);
      case "project_not_found":
      case "project_forbidden":
        return errorResponse("Project or membership not found.", 404);
      case "project_closed":
      case "revision_conflict":
      case "state_conflict":
      case "idempotency_conflict":
        return errorResponse(
          "Project state changed. Refresh and try again.",
          409
        );
      case "outcome_unavailable":
        return errorResponse("Project service is unavailable.", 503);
      case "integrity_conflict":
        return errorResponse("Unable to process the project request.", 500);
      default:
        return errorResponse("Unable to process the project request.", 500);
    }
  }
  return errorResponse("Unable to process the project request.", 500);
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new ProjectFoundationError("invalid_request");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) {
      throw new ProjectFoundationError("invalid_request");
    }
    if (Number(contentLength) > MAX_BODY_BYTES) {
      throw new RequestBodyTooLargeError();
    }
  }
  if (!request.body) {
    throw new ProjectFoundationError("invalid_request");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ProjectFoundationError("invalid_request");
  }
}

class RequestBodyTooLargeError extends Error {}

async function parsedBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<{ value: T } | { response: Response }> {
  try {
    const raw = await readBoundedJson(request);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { response: errorResponse("Invalid project request.", 400) };
    }
    return { value: parsed.data };
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return { response: errorResponse("Project request is too large.", 413) };
    }
    return { response: errorResponse("Invalid project request.", 400) };
  }
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",", 1)[0]?.trim();
  const value = firstForwarded || request.headers.get("x-real-ip")?.trim();
  return value && value.length <= 128 ? value : null;
}

export function createProjectFoundationHandlers(deps: HttpDependencies) {
  async function customer(
    request: Request,
    action?: RateLimitAction
  ): Promise<{ actorUserId: string } | { response: Response }> {
    const session = await deps.authenticate();
    if (!session?.userId || session.type !== "regular") {
      return { response: errorResponse("Authentication required.", 401) };
    }
    if (!(await deps.isRegisteredCustomer(session.userId))) {
      return {
        response: errorResponse("Customer account access required.", 403),
      };
    }
    let schemaReady = false;
    try {
      schemaReady = await deps.schemaAvailable();
    } catch {
      schemaReady = false;
    }
    if (!schemaReady) {
      return {
        response: errorResponse("Project service is unavailable.", 503),
      };
    }
    if (action && deps.rateLimit) {
      const allowed = await deps.rateLimit({
        actorUserId: session.userId,
        ipAddress: clientIp(request),
        action,
      });
      if (!allowed) {
        return {
          response: errorResponse(
            "Too many project requests. Try again later.",
            429
          ),
        };
      }
    }
    return { actorUserId: session.userId };
  }

  async function invoke(
    request: Request,
    action: RateLimitAction | undefined,
    callback: (actorUserId: string) => Promise<Response>
  ): Promise<Response> {
    try {
      const access = await customer(request, action);
      if ("response" in access) {
        return access.response;
      }
      return await callback(access.actorUserId);
    } catch (error) {
      return mapError(error);
    }
  }

  return {
    listProjects(request: Request) {
      return invoke(request, undefined, async (actorUserId) =>
        jsonResponse({
          projects: await deps.repository.listProjects(actorUserId),
        })
      );
    },

    createProject(request: Request) {
      return invoke(request, undefined, async (actorUserId) => {
        const body = await parsedBody(request, createProjectBody);
        if ("response" in body) {
          return body.response;
        }
        const outcome = await deps.repository.createProject({
          actorUserId,
          operationId: body.value.operationId,
        });
        const { id, status, revision, createdAt, updatedAt, closedAt } =
          outcome.project;
        return jsonResponse(
          { project: { id, status, revision, createdAt, updatedAt, closedAt } },
          201
        );
      });
    },

    getProject(request: Request, projectId: string) {
      return invoke(request, undefined, async (actorUserId) => {
        if (!UUID_PATTERN.test(projectId)) {
          return errorResponse("Invalid project request.", 400);
        }
        const project = await deps.repository.getProjectForActor({
          actorUserId,
          projectId,
        });
        return jsonResponse({ project });
      });
    },

    closeProject(request: Request, projectId: string) {
      return invoke(request, undefined, async (actorUserId) => {
        if (!UUID_PATTERN.test(projectId)) {
          return errorResponse("Invalid project request.", 400);
        }
        const body = await parsedBody(request, closeProjectBody);
        if ("response" in body) {
          return body.response;
        }
        await deps.repository.closeProject({
          actorUserId,
          projectId,
          ...body.value,
        });
        return emptyResponse(204);
      });
    },

    listMembers(request: Request, projectId: string) {
      return invoke(request, undefined, async (actorUserId) => {
        if (!UUID_PATTERN.test(projectId)) {
          return errorResponse("Invalid project request.", 400);
        }
        const members = await deps.repository.listProjectMembers({
          actorUserId,
          projectId,
        });
        return jsonResponse({ members });
      });
    },

    inviteMember(request: Request, projectId: string) {
      return invoke(request, "invite", async (actorUserId) => {
        if (!UUID_PATTERN.test(projectId)) {
          return errorResponse("Invalid project request.", 400);
        }
        const body = await parsedBody(request, inviteMemberBody);
        if ("response" in body) {
          return body.response;
        }
        await deps.repository.inviteProjectMember({
          actorUserId,
          projectId,
          ...body.value,
        });
        return emptyResponse(202);
      });
    },

    invitationInbox(request: Request) {
      return invoke(request, "invitation_inbox", async (actorUserId) =>
        jsonResponse({
          invitations:
            await deps.repository.listPendingInvitations(actorUserId),
        })
      );
    },

    acceptMember(request: Request, projectId: string, membershipId: string) {
      return invoke(request, undefined, async (actorUserId) => {
        if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(membershipId)) {
          return errorResponse("Invalid project request.", 400);
        }
        const body = await parsedBody(request, membershipTransitionBody);
        if ("response" in body) {
          return body.response;
        }
        await deps.repository.acceptProjectMembership({
          actorUserId,
          projectId,
          membershipId,
          ...body.value,
        });
        return emptyResponse(204);
      });
    },

    revokeMember(request: Request, projectId: string, membershipId: string) {
      return invoke(request, undefined, async (actorUserId) => {
        if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(membershipId)) {
          return errorResponse("Invalid project request.", 400);
        }
        const body = await parsedBody(request, membershipTransitionBody);
        if ("response" in body) {
          return body.response;
        }
        await deps.repository.revokeProjectMembership({
          actorUserId,
          projectId,
          membershipId,
          ...body.value,
        });
        return emptyResponse(204);
      });
    },
  };
}
