import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { projectChatWritesEnabled } from "./chat-policy";
import { createProjectChatsHandlers } from "./chats-http";

function requestIp(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

const handlers = createProjectChatsHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { userId: session.user.id, type: session.user.type };
  },
  isRegisteredCustomer: projectFoundationRepository.isRegisteredCustomer,
  schemaAvailable: projectFoundationSchemaAvailable,
  writesEnabled: projectChatWritesEnabled,
  repository: projectFoundationRepository,
});

async function rateLimited(request: Request, actorUserId: string) {
  try {
    await checkIpRateLimit(actorUserId, {
      maxRequests: 30,
      ttlSeconds: 60 * 60,
      keyPrefix: "phase13-m1-3-project-chat-actor",
    });
    const ip = requestIp(request);
    if (ip && ip.length <= 128) {
      await checkIpRateLimit(ip, {
        maxRequests: 60,
        ttlSeconds: 60 * 60,
        keyPrefix: "phase13-m1-3-project-chat-ip",
      });
    }
    return true;
  } catch {
    return false;
  }
}

export const projectChatsHandlers = {
  async create(request: Request, projectId: string) {
    const session = await auth();
    if (!session?.user?.id || session.user.type !== "regular") {
      return handlers.create(request, projectId);
    }
    if (!(await rateLimited(request, session.user.id))) {
      return Response.json(
        { error: "Too many project requests. Try again later." },
        { status: 429, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    return handlers.create(request, projectId);
  },
  async list(request: Request, projectId: string) {
    const session = await auth();
    if (
      session?.user?.id &&
      session.user.type === "regular" &&
      !(await rateLimited(request, session.user.id))
    ) {
      return Response.json(
        { error: "Too many project requests. Try again later." },
        { status: 429, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    return handlers.list(request, projectId);
  },
};
