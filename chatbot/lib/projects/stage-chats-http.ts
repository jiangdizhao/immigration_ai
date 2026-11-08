import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";
import type { ProjectConversationStageKey } from "@/lib/projects/stage-keys";
import { isProjectConversationStageKey } from "@/lib/projects/stage-keys";

/**
 * Phase 13 M9-A — HTTP surface for step-bound Project conversations.
 *
 * Deliberately minimal: this route can only *find or create* the requesting actor's
 * own step conversation. It cannot read messages, cannot bind someone else's Chat,
 * cannot migrate an existing standalone Chat and cannot create any other state. The
 * Chat it returns is a normal M1 Project Chat, so message history, read-only rules,
 * turn fencing and Project authority are all unchanged.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 1024;

type AuthenticatedSession = { userId: string; type: "guest" | "regular" };

type StageChatBindingView = {
  chatId: string;
  stageKey: ProjectConversationStageKey;
  createdAt: Date;
};

type Repository = {
  listStageChatBindings(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<StageChatBindingView[]>;
  findOrCreateStageChat(input: {
    actorUserId: string;
    projectId: string;
    stageKey: ProjectConversationStageKey;
  }): Promise<{
    chatId: string;
    stageKey: ProjectConversationStageKey;
    readOnly: boolean;
    replayed: boolean;
  }>;
};

export type StageChatDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  /** Fail closed until migration 0053 is applied by an approved migration gate. */
  stageSchemaAvailable: () => Promise<boolean>;
  writesEnabled: () => boolean;
  repository: Repository;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    headers: { "Cache-Control": "private, no-store" },
    status,
  });
}

function errorResponse(error: string, status: number) {
  return jsonResponse({ error }, status);
}

function mapError(error: unknown) {
  if (error instanceof ProjectFoundationError) {
    if (
      error.code === "invalid_request" ||
      error.code === "invalid_operation_id"
    ) {
      return errorResponse("Invalid step conversation request.", 400);
    }
    if (
      error.code === "project_not_found" ||
      error.code === "project_forbidden"
    ) {
      return errorResponse("Project not found.", 404);
    }
    if (
      error.code === "project_closed" ||
      error.code === "state_conflict" ||
      error.code === "revision_conflict" ||
      error.code === "idempotency_conflict"
    ) {
      return errorResponse("Project state changed.", 409);
    }
    if (error.code === "project_limit_reached") {
      return errorResponse("Project limit reached.", 429);
    }
  }
  return errorResponse("Project service is unavailable.", 503);
}

async function readStageKey(
  request: Request
): Promise<{ stageKey: ProjectConversationStageKey } | { response: Response }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    return {
      response: errorResponse("Invalid step conversation request.", 400),
    };
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)
  ) {
    return {
      response: errorResponse("Step conversation request is too large.", 413),
    };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return {
      response: errorResponse("Step conversation request is too large.", 413),
    };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {
      response: errorResponse("Invalid step conversation request.", 400),
    };
  }
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1
  ) {
    return {
      response: errorResponse("Invalid step conversation request.", 400),
    };
  }
  const stageKey = (body as { stageKey?: unknown }).stageKey;
  if (!isProjectConversationStageKey(stageKey)) {
    return {
      response: errorResponse("Invalid step conversation request.", 400),
    };
  }
  return { stageKey };
}

export function createStageChatHandlers(deps: StageChatDependencies) {
  /**
   * The step-binding schema is a *separate* additive capability. Until it is
   * applied, this route answers 503 and the workspace keeps ordinary Project Chats
   * and an honest "step conversations unavailable" state.
   */
  async function access(): Promise<
    { actorUserId: string } | { response: Response }
  > {
    const session = await deps.authenticate();
    if (!session?.userId) {
      return { response: errorResponse("Authentication required.", 401) };
    }
    let available = false;
    try {
      available = await deps.stageSchemaAvailable();
    } catch {
      available = false;
    }
    if (!available) {
      return {
        response: errorResponse("Step conversations are unavailable.", 503),
      };
    }
    return { actorUserId: session.userId };
  }

  return {
    /**
     * The actor's own step conversations in this Project. Unknown, closed or foreign
     * Projects answer 404, so Project existence is never confirmed to a non-member.
     */
    async list(_request: Request, projectId: string): Promise<Response> {
      try {
        const authorized = await access();
        if ("response" in authorized) {
          return authorized.response;
        }
        if (!UUID_PATTERN.test(projectId)) {
          return errorResponse("Invalid step conversation request.", 400);
        }
        const rows = await deps.repository.listStageChatBindings({
          actorUserId: authorized.actorUserId,
          projectId,
        });
        return jsonResponse({
          stageChats: rows.map((row) => ({
            chatId: row.chatId,
            createdAt: row.createdAt,
            stageKey: row.stageKey,
          })),
        });
      } catch (error) {
        return mapError(error);
      }
    },

    async open(request: Request, projectId: string): Promise<Response> {
      try {
        const authorized = await access();
        if ("response" in authorized) {
          return authorized.response;
        }
        if (!UUID_PATTERN.test(projectId)) {
          return errorResponse("Invalid step conversation request.", 400);
        }
        if (!deps.writesEnabled()) {
          return errorResponse(
            "Step conversations are read-only right now.",
            503
          );
        }
        const parsed = await readStageKey(request);
        if ("response" in parsed) {
          return parsed.response;
        }
        const result = await deps.repository.findOrCreateStageChat({
          actorUserId: authorized.actorUserId,
          projectId,
          stageKey: parsed.stageKey,
        });
        return jsonResponse(
          {
            chatId: result.chatId,
            origin: "project",
            projectId,
            readOnly: result.readOnly,
            replayed: result.replayed,
            stageKey: result.stageKey,
          },
          result.replayed ? 200 : 201
        );
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
