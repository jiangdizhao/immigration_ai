import { z } from "zod";
import type { createProjectHumanMessagingRepository } from "@/lib/db/project-human-messaging-repository";
import { ProjectHumanMessagingError } from "./errors";
import {
  isProjectHumanMessagingEnabled,
  PROJECT_HUMAN_MESSAGE_MAX_BYTES,
  PROJECT_HUMAN_MESSAGING_NOTICE,
  PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
  PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
  PROJECT_HUMAN_MESSAGING_PURPOSE,
  parseMessagePagination,
  parseThreadPagination,
} from "./policy";

const UUID = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
  );
const OperationId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
const Revision = z.number().int().positive().safe();
const createThreadSchema = z
  .object({
    accepted: z.literal(true),
    assignmentId: UUID,
    expectedProjectRevision: Revision,
    lawyerUserId: UUID,
    noticeVersion: z.literal(PROJECT_HUMAN_MESSAGING_NOTICE_VERSION),
    operationId: OperationId,
  })
  .strict();
const sendMessageSchema = z
  .object({
    operationId: OperationId,
    body: z
      .string()
      .min(1)
      .max(8192)
      .refine((value) => value.trim().length > 0),
  })
  .strict();
const withdrawConsentSchema = z
  .object({ operationId: OperationId, expectedProjectRevision: Revision })
  .strict();

type Repository = ReturnType<typeof createProjectHumanMessagingRepository>;
type Session = { userId: string; type: "guest" | "regular" };
type PreparedRequest =
  | { ok: true; session: Session }
  | { ok: false; response: Response };
type RateLimitAction =
  | "thread_create"
  | "thread_list"
  | "thread_detail"
  | "message_list"
  | "message_send"
  | "consent_withdraw";
type Dependencies = {
  authenticate: () => Promise<Session | null>;
  enabled?: () => boolean;
  schemaAvailable: () => Promise<boolean>;
  repository: Pick<
    Repository,
    | "createThread"
    | "listThreads"
    | "getThread"
    | "listMessages"
    | "sendMessage"
    | "withdrawConsent"
  >;
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
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > 12 * 1024)
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
      if (size > 12 * 1024) {
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

async function parseBody<T>(request: Request, schema: z.ZodType<T>) {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (parsed.success) {
      return { ok: true as const, value: parsed.data };
    }
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return {
        ok: false as const,
        response: jsonResponse(
          { error: "Human messaging request is too large." },
          413
        ),
      };
    }
  }
  return {
    ok: false as const,
    response: jsonResponse({ error: "Invalid human messaging request." }, 400),
  };
}

function mapRepositoryError(error: unknown) {
  if (error instanceof ProjectHumanMessagingError) {
    switch (error.code) {
      case "not_found":
        return jsonResponse({ error: "Thread not found." }, 404);
      case "invalid_request":
        return jsonResponse({ error: "Invalid human messaging request." }, 400);
      case "state_conflict":
      case "revision_conflict":
      case "idempotency_conflict":
        return jsonResponse(
          { error: "Thread state changed. Refresh and try again." },
          409
        );
      case "integrity_conflict":
        return jsonResponse(
          { error: "Human messaging service is unavailable." },
          503
        );
      default:
        return jsonResponse(
          { error: "Human messaging service is unavailable." },
          503
        );
    }
  }
  return jsonResponse(
    { error: "Human messaging service is unavailable." },
    503
  );
}

export function createProjectHumanMessagingHandlers(deps: Dependencies) {
  async function prepare(
    request: Request,
    action: RateLimitAction
  ): Promise<PreparedRequest> {
    const session = await deps.authenticate();
    if (!session) {
      return {
        ok: false,
        response: jsonResponse({ error: "Authentication required." }, 401),
      };
    }
    if (session.type !== "regular") {
      return {
        ok: false,
        response: jsonResponse({ error: "Thread not found." }, 404),
      };
    }
    if (!(deps.enabled ?? isProjectHumanMessagingEnabled)()) {
      return {
        ok: false,
        response: jsonResponse({ error: "Thread not found." }, 404),
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
            { error: "Too many messaging requests. Try again later." },
            429
          ),
        };
      }
    } catch {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Human messaging service is unavailable." },
          503
        ),
      };
    }
    try {
      if (!(await deps.schemaAvailable())) {
        return {
          ok: false,
          response: jsonResponse(
            { error: "Human messaging service is unavailable." },
            503
          ),
        };
      }
    } catch {
      return {
        ok: false,
        response: jsonResponse(
          { error: "Human messaging service is unavailable." },
          503
        ),
      };
    }
    return { ok: true, session };
  }

  return {
    async create(request: Request, projectId: string): Promise<Response> {
      const prepared = await prepare(request, "thread_create");
      if (!prepared.ok) {
        return prepared.response;
      }
      if (!UUID.safeParse(projectId).success) {
        return jsonResponse({ error: "Thread not found." }, 404);
      }
      const parsed = await parseBody(request, createThreadSchema);
      if (!parsed.ok) {
        return parsed.response;
      }
      try {
        const result = await deps.repository.createThread({
          actorUserId: prepared.session.userId,
          projectId,
          assignmentId: parsed.value.assignmentId,
          lawyerUserId: parsed.value.lawyerUserId,
          expectedProjectRevision: parsed.value.expectedProjectRevision,
          operationId: parsed.value.operationId,
        });
        return jsonResponse(
          {
            ...result,
            notice: PROJECT_HUMAN_MESSAGING_NOTICE,
            noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
            noticeSha256: PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
            purpose: PROJECT_HUMAN_MESSAGING_PURPOSE,
          },
          result.replayed ? 200 : 201
        );
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async list(request: Request, projectId: string): Promise<Response> {
      const prepared = await prepare(request, "thread_list");
      if (!prepared.ok) {
        return prepared.response;
      }
      if (!UUID.safeParse(projectId).success) {
        return jsonResponse({ error: "Thread not found." }, 404);
      }
      const query = new URL(request.url).searchParams;
      const pagination = parseThreadPagination({
        beforeCreatedAt: query.get("beforeCreatedAt"),
        beforeThreadId: query.get("beforeThreadId"),
        limit: query.get("limit"),
      });
      if (!pagination) {
        return jsonResponse({ error: "Invalid thread page request." }, 400);
      }
      try {
        const result = await deps.repository.listThreads({
          actorUserId: prepared.session.userId,
          projectId,
          ...pagination,
        });
        return jsonResponse({
          ...result,
          consentTerms: {
            purpose: PROJECT_HUMAN_MESSAGING_PURPOSE,
            notice: PROJECT_HUMAN_MESSAGING_NOTICE,
            noticeVersion: PROJECT_HUMAN_MESSAGING_NOTICE_VERSION,
            noticeSha256: PROJECT_HUMAN_MESSAGING_NOTICE_SHA256,
          },
        });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async detail(
      request: Request,
      projectId: string,
      threadId: string
    ): Promise<Response> {
      const prepared = await prepare(request, "thread_detail");
      if (!prepared.ok) {
        return prepared.response;
      }
      if (
        !(UUID.safeParse(projectId).success && UUID.safeParse(threadId).success)
      ) {
        return jsonResponse({ error: "Thread not found." }, 404);
      }
      try {
        const thread = await deps.repository.getThread({
          actorUserId: prepared.session.userId,
          projectId,
          threadId,
        });
        return jsonResponse({ thread });
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async messages(
      request: Request,
      projectId: string,
      threadId: string
    ): Promise<Response> {
      const prepared = await prepare(
        request,
        request.method === "POST" ? "message_send" : "message_list"
      );
      if (!prepared.ok) {
        return prepared.response;
      }
      if (
        !(UUID.safeParse(projectId).success && UUID.safeParse(threadId).success)
      ) {
        return jsonResponse({ error: "Thread not found." }, 404);
      }
      try {
        if (request.method === "GET") {
          const pagination = parseMessagePagination({
            beforeSequence: new URL(request.url).searchParams.get(
              "beforeSequence"
            ),
            limit: new URL(request.url).searchParams.get("limit"),
          });
          if (!pagination) {
            return jsonResponse(
              { error: "Invalid message page request." },
              400
            );
          }
          return jsonResponse({
            threadId,
            ...(await deps.repository.listMessages({
              actorUserId: prepared.session.userId,
              projectId,
              threadId,
              ...pagination,
            })),
          });
        }
        const parsed = await parseBody(request, sendMessageSchema);
        if (!parsed.ok) {
          return parsed.response;
        }
        if (
          new TextEncoder().encode(parsed.value.body).byteLength >
          PROJECT_HUMAN_MESSAGE_MAX_BYTES
        ) {
          return jsonResponse({ error: "Message is too large." }, 413);
        }
        const result = await deps.repository.sendMessage({
          actorUserId: prepared.session.userId,
          projectId,
          threadId,
          operationId: parsed.value.operationId,
          body: parsed.value.body,
        });
        return jsonResponse(result, result.replayed ? 200 : 201);
      } catch (error) {
        return mapRepositoryError(error);
      }
    },

    async withdraw(
      request: Request,
      projectId: string,
      threadId: string
    ): Promise<Response> {
      const prepared = await prepare(request, "consent_withdraw");
      if (!prepared.ok) {
        return prepared.response;
      }
      if (
        !(UUID.safeParse(projectId).success && UUID.safeParse(threadId).success)
      ) {
        return jsonResponse({ error: "Thread not found." }, 404);
      }
      const parsed = await parseBody(request, withdrawConsentSchema);
      if (!parsed.ok) {
        return parsed.response;
      }
      try {
        return jsonResponse(
          await deps.repository.withdrawConsent({
            actorUserId: prepared.session.userId,
            projectId,
            threadId,
            operationId: parsed.value.operationId,
            expectedProjectRevision: parsed.value.expectedProjectRevision,
          })
        );
      } catch (error) {
        return mapRepositoryError(error);
      }
    },
  };
}
