import { z } from "zod";
import type { createProjectStaffAssignmentRepository } from "@/lib/db/project-staff-assignment-repository";
import { ProjectStaffAssignmentError } from "./errors";
import {
  PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION,
  type ProjectStaffAssignmentAction,
  projectStaffAssignmentsEnabled,
} from "./policy";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID = z.string().regex(UUID_PATTERN);
const OperationId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
const Revision = z.number().int().positive().safe();
const MAX_BODY_BYTES = 8 * 1024;

const proposeSchema = z
  .object({
    projectId: UUID,
    staffUserId: UUID,
    operationId: OperationId,
  })
  .strict();
const ownerActionSchema = z
  .object({
    action: z.enum(["approve", "decline", "revoke"]),
    operationId: OperationId,
    expectedProjectRevision: Revision,
    proposalSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .optional(),
    noticeVersion: z.string().min(1).max(128).optional(),
  })
  .strict();
const lawyerActionSchema = z
  .object({
    projectId: UUID,
    action: z.enum(["accept", "decline", "resign"]),
    operationId: OperationId,
    expectedProjectRevision: Revision,
  })
  .strict();
const adminActionSchema = z
  .object({
    projectId: UUID,
    action: z.enum(["withdraw", "revoke"]),
    operationId: OperationId,
  })
  .strict();

type ParsedBody<T> = { ok: true; value: T } | { ok: false; response: Response };

type Repository = Pick<
  ReturnType<typeof createProjectStaffAssignmentRepository>,
  | "propose"
  | "listAdminAssignments"
  | "listOwnerAssignments"
  | "listLawyerInvitations"
  | "getStaffShell"
  | "transition"
>;
type Session = { userId: string; type: "guest" | "regular" };
type RateLimitAction =
  | "admin_propose"
  | "admin_list"
  | "admin_transition"
  | "owner_list"
  | "owner_transition"
  | "lawyer_inbox"
  | "lawyer_transition"
  | "staff_shell";

type Dependencies = {
  authenticate: () => Promise<Session | null>;
  enabled?: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  repository: Repository;
  rateLimit: (input: {
    actorUserId: string;
    ipAddress: string | null;
    action: RateLimitAction;
  }) => Promise<boolean>;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function emptyResponse(status: number) {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",", 1)[0]?.trim();
  const value = first || request.headers.get("x-real-ip")?.trim();
  return value && value.length <= 128 ? value : null;
}

class BodyTooLargeError extends Error {}

async function readJson(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/iu.test(
      request.headers.get("content-type") ?? ""
    )
  ) {
    throw new SyntaxError("invalid content type");
  }
  const length = request.headers.get("content-length");
  if (
    length !== null &&
    (!/^\d+$/u.test(length) || Number(length) > MAX_BODY_BYTES)
  ) {
    throw new BodyTooLargeError();
  }
  if (!request.body) {
    throw new SyntaxError("missing body");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function parsedBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<ParsedBody<T>> {
  try {
    const parsed = schema.safeParse(await readJson(request));
    return parsed.success
      ? { ok: true, value: parsed.data }
      : {
          ok: false,
          response: jsonResponse(
            { error: "Invalid staff assignment request." },
            400
          ),
        };
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Staff assignment request is too large." },
          413
        ),
      };
    }
    return {
      ok: false,
      response: jsonResponse(
        { error: "Invalid staff assignment request." },
        400
      ),
    };
  }
}

function mapOwnerOrLawyerError(error: unknown) {
  if (error instanceof ProjectStaffAssignmentError) {
    switch (error.code) {
      case "not_found":
      case "forbidden":
        return jsonResponse({ error: "Staff assignment not found." }, 404);
      case "invalid_request":
        return jsonResponse(
          { error: "Invalid staff assignment request." },
          400
        );
      case "state_conflict":
      case "revision_conflict":
      case "idempotency_conflict":
        return jsonResponse(
          { error: "Staff assignment state changed. Refresh and try again." },
          409
        );
      default:
        return jsonResponse(
          { error: "Staff assignment service unavailable." },
          503
        );
    }
  }
  return jsonResponse({ error: "Staff assignment service unavailable." }, 503);
}

function mapAdminIdempotencyConflict(error: unknown): Response | null {
  if (
    error instanceof ProjectStaffAssignmentError &&
    error.code === "idempotency_conflict"
  ) {
    return jsonResponse(
      { error: "This operation ID was used with a different request." },
      409
    );
  }
  return null;
}

function actionFor(
  actor: "owner" | "lawyer" | "admin",
  action: string
): ProjectStaffAssignmentAction {
  if (actor === "owner") {
    if (action === "approve") {
      return "owner_approve";
    }
    if (action === "decline") {
      return "owner_decline";
    }
    return "owner_revoke";
  }
  if (actor === "lawyer") {
    if (action === "accept") {
      return "lawyer_accept";
    }
    if (action === "decline") {
      return "lawyer_decline";
    }
    return "lawyer_resign";
  }
  return action === "withdraw" ? "admin_withdraw" : "admin_revoke";
}

export function createProjectStaffAssignmentHandlers(deps: Dependencies) {
  async function access(
    request: Request,
    action: RateLimitAction
  ): Promise<
    { ok: true; actorUserId: string } | { ok: false; response: Response }
  > {
    if (!(deps.enabled ?? projectStaffAssignmentsEnabled)()) {
      return { ok: false, response: emptyResponse(404) };
    }
    const session = await deps.authenticate();
    if (!session?.userId || session.type !== "regular") {
      return {
        ok: false,
        response: jsonResponse({ error: "Authentication required." }, 401),
      };
    }
    let ready = false;
    try {
      ready = await deps.schemaAvailable();
    } catch {
      ready = false;
    }
    if (!ready) {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Staff assignment service unavailable." },
          503
        ),
      };
    }
    try {
      if (
        !(await deps.rateLimit({
          actorUserId: session.userId,
          ipAddress: clientIp(request),
          action,
        }))
      ) {
        return {
          ok: false,
          response: jsonResponse(
            { error: "Too many staff assignment requests." },
            429
          ),
        };
      }
    } catch {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Staff assignment service unavailable." },
          503
        ),
      };
    }
    return { ok: true, actorUserId: session.userId };
  }

  async function invoke(
    request: Request,
    limit: RateLimitAction,
    callback: (actorUserId: string) => Promise<Response>
  ): Promise<Response> {
    const authorized = await access(request, limit);
    if (!authorized.ok) {
      return authorized.response;
    }
    try {
      return await callback(authorized.actorUserId);
    } catch (error) {
      return mapOwnerOrLawyerError(error);
    }
  }

  return {
    adminPropose(request: Request) {
      return invoke(request, "admin_propose", async (actorUserId) => {
        const body = await parsedBody(request, proposeSchema);
        if (!body.ok) {
          return body.response;
        }
        try {
          await deps.repository.propose({ actorUserId, ...body.value });
        } catch (error) {
          const conflict = mapAdminIdempotencyConflict(error);
          if (conflict) {
            return conflict;
          }
          // Unknown, foreign, closed, ineligible, duplicate, and inaccessible
          // inputs share the same accepted response and disclose no Project data.
          if (!(error instanceof ProjectStaffAssignmentError)) {
            throw error;
          }
        }
        return emptyResponse(202);
      });
    },

    adminList(request: Request, projectId: string | null) {
      return invoke(request, "admin_list", async (actorUserId) => {
        if (!projectId || !UUID_PATTERN.test(projectId)) {
          return jsonResponse(
            { error: "Invalid staff assignment request." },
            400
          );
        }
        try {
          const assignments = await deps.repository.listAdminAssignments({
            actorUserId,
            projectId,
          });
          return jsonResponse({ assignments });
        } catch (error) {
          if (
            error instanceof ProjectStaffAssignmentError &&
            error.code === "forbidden"
          ) {
            return jsonResponse(
              { error: "Administrator access required." },
              403
            );
          }
          throw error;
        }
      });
    },

    adminTransition(request: Request, assignmentId: string) {
      return invoke(request, "admin_transition", async (actorUserId) => {
        if (!UUID_PATTERN.test(assignmentId)) {
          return emptyResponse(202);
        }
        const body = await parsedBody(request, adminActionSchema);
        if (!body.ok) {
          return body.response;
        }
        try {
          await deps.repository.transition({
            actorUserId,
            projectId: body.value.projectId,
            assignmentId,
            action: actionFor("admin", body.value.action),
            operationId: body.value.operationId,
          });
        } catch (error) {
          const conflict = mapAdminIdempotencyConflict(error);
          if (conflict) {
            return conflict;
          }
          if (!(error instanceof ProjectStaffAssignmentError)) {
            throw error;
          }
        }
        return emptyResponse(202);
      });
    },

    ownerList(request: Request, projectId: string) {
      return invoke(request, "owner_list", async (actorUserId) => {
        if (!UUID_PATTERN.test(projectId)) {
          return jsonResponse({ error: "Staff assignment not found." }, 404);
        }
        return jsonResponse({
          assignments: await deps.repository.listOwnerAssignments({
            actorUserId,
            projectId,
          }),
        });
      });
    },

    ownerTransition(request: Request, projectId: string, assignmentId: string) {
      return invoke(request, "owner_transition", async (actorUserId) => {
        if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(assignmentId)) {
          return jsonResponse({ error: "Staff assignment not found." }, 404);
        }
        const body = await parsedBody(request, ownerActionSchema);
        if (!body.ok) {
          return body.response;
        }
        if (
          body.value.action === "approve" &&
          (body.value.proposalSha256 === undefined ||
            body.value.noticeVersion !==
              PROJECT_STAFF_ASSIGNMENT_NOTICE_VERSION)
        ) {
          return jsonResponse(
            { error: "Invalid staff assignment request." },
            400
          );
        }
        const result = await deps.repository.transition({
          actorUserId,
          projectId,
          assignmentId,
          action: actionFor("owner", body.value.action),
          expectedProjectRevision: body.value.expectedProjectRevision,
          proposalSha256: body.value.proposalSha256,
          noticeVersion: body.value.noticeVersion,
          operationId: body.value.operationId,
        });
        return jsonResponse({ assignment: result.assignment });
      });
    },

    lawyerInbox(request: Request) {
      return invoke(request, "lawyer_inbox", async (actorUserId) =>
        jsonResponse({
          invitations: await deps.repository.listLawyerInvitations({
            actorUserId,
          }),
        })
      );
    },

    lawyerTransition(request: Request, assignmentId: string) {
      return invoke(request, "lawyer_transition", async (actorUserId) => {
        if (!UUID_PATTERN.test(assignmentId)) {
          return jsonResponse({ error: "Staff assignment not found." }, 404);
        }
        const body = await parsedBody(request, lawyerActionSchema);
        if (!body.ok) {
          return body.response;
        }
        const result = await deps.repository.transition({
          actorUserId,
          projectId: body.value.projectId,
          assignmentId,
          action: actionFor("lawyer", body.value.action),
          expectedProjectRevision: body.value.expectedProjectRevision,
          operationId: body.value.operationId,
        });
        return jsonResponse({ assignment: result.assignment });
      });
    },

    staffShell(request: Request, projectId: string) {
      return invoke(request, "staff_shell", async (actorUserId) => {
        if (!UUID_PATTERN.test(projectId)) {
          return jsonResponse({ error: "Staff assignment not found." }, 404);
        }
        return jsonResponse({
          shell: await deps.repository.getStaffShell({
            actorUserId,
            projectId,
          }),
        });
      });
    },
  };
}
