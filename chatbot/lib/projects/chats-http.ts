import { z } from "zod";
import type { PaginationCursor } from "@/lib/conversations/pagination";
import {
  decodeCursor,
  encodeCursor,
  normalizePageSize,
  PaginationCursorError,
} from "@/lib/conversations/pagination";
import type { createProjectFoundationRepository } from "@/lib/db/project-foundation";
import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createBodySchema = z
  .object({
    operationId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

type Repository = Pick<
  ReturnType<typeof createProjectFoundationRepository>,
  "createProjectChat" | "listOwnedProjectChats"
>;

type AuthenticatedSession = { userId: string; type: "guest" | "regular" };

type Dependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  isRegisteredCustomer: (userId: string) => Promise<boolean>;
  schemaAvailable: () => Promise<boolean>;
  writesEnabled: () => boolean;
  repository: Repository;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
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
      return errorResponse("Invalid project chat request.", 400);
    }
    if (
      error.code === "project_not_found" ||
      error.code === "project_forbidden"
    ) {
      return errorResponse("Project chat not found.", 404);
    }
    if (
      error.code === "project_closed" ||
      error.code === "revision_conflict" ||
      error.code === "state_conflict" ||
      error.code === "idempotency_conflict"
    ) {
      return errorResponse("Project chat state changed.", 409);
    }
    if (error.code === "outcome_unavailable") {
      return errorResponse("Project service is unavailable.", 503);
    }
  }
  return errorResponse("Project service is unavailable.", 503);
}

function cursorFor(row: { chatId: string; createdAt: Date }): PaginationCursor {
  return { timestamp: row.createdAt.getTime(), id: row.chatId };
}

async function boundedJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > 4096)
  ) {
    throw new RangeError("request_body_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 4096) {
    throw new RangeError("request_body_too_large");
  }
  return JSON.parse(text);
}

export function createProjectChatsHandlers(deps: Dependencies) {
  async function access(): Promise<
    { actorUserId: string } | { response: Response }
  > {
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
    return { actorUserId: session.userId };
  }

  return {
    async create(request: Request, projectId: string): Promise<Response> {
      try {
        const authorized = await access();
        if ("response" in authorized) {
          return authorized.response;
        }
        if (!UUID_PATTERN.test(projectId)) {
          return errorResponse("Invalid project chat request.", 400);
        }
        const contentType = request.headers.get("content-type") ?? "";
        if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
          return errorResponse("Invalid project chat request.", 400);
        }
        let requestBody: unknown;
        try {
          requestBody = await boundedJson(request);
        } catch (error) {
          return errorResponse(
            error instanceof RangeError
              ? "Project chat request is too large."
              : "Invalid project chat request.",
            error instanceof RangeError ? 413 : 400
          );
        }
        const parsed = createBodySchema.safeParse(requestBody);
        if (!parsed.success) {
          return errorResponse("Invalid project chat request.", 400);
        }
        if (!deps.writesEnabled()) {
          return errorResponse("Project chats are read-only right now.", 503);
        }
        const result = await deps.repository.createProjectChat({
          actorUserId: authorized.actorUserId,
          projectId,
          operationId: parsed.data.operationId,
          title: parsed.data.title,
        });
        return jsonResponse(
          {
            chatId: result.chatId,
            projectId: result.project.id,
            origin: "project",
            readOnly: false,
            replayed: result.replayed,
          },
          result.replayed ? 200 : 201
        );
      } catch (error) {
        return mapError(error);
      }
    },

    async list(request: Request, projectId: string): Promise<Response> {
      try {
        const authorized = await access();
        if ("response" in authorized) {
          return authorized.response;
        }
        if (!UUID_PATTERN.test(projectId)) {
          return errorResponse("Invalid project chat request.", 400);
        }
        const url = new URL(request.url);
        const limit = normalizePageSize(
          "conversation",
          url.searchParams.has("limit")
            ? Number(url.searchParams.get("limit"))
            : null
        );
        let cursor: PaginationCursor | null;
        try {
          cursor = decodeCursor("conversation", url.searchParams.get("cursor"));
        } catch (error) {
          if (error instanceof PaginationCursorError) {
            return errorResponse("Invalid cursor.", 400);
          }
          throw error;
        }
        const page = await deps.repository.listOwnedProjectChats({
          actorUserId: authorized.actorUserId,
          projectId,
          limit,
          cursor,
        });
        const last = page.conversations.at(-1);
        return jsonResponse({
          conversations: page.conversations.map((row) => ({
            chatId: row.chatId,
            projectId: row.projectId,
            title: row.title ?? row.chatTitle ?? "Project conversation",
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            origin: row.origin,
            readOnly: row.readOnly,
          })),
          hasMore: page.hasMore,
          nextCursor:
            page.hasMore && last
              ? encodeCursor("conversation", cursorFor(last))
              : null,
        });
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
