import "server-only";

import { auth } from "@/app/(auth)/auth";
import { projectFoundationSchemaAvailable } from "@/lib/db/project-foundation-schema-availability";
import { projectStageChatSchemaAvailable } from "@/lib/db/project-stage-chat-schema-availability";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { projectChatWritesEnabled } from "./chat-policy";
import {
  findOrCreateStageChat,
  listStageChatBindings,
} from "./stage-chat-repository";
import { createStageChatHandlers } from "./stage-chats-http";

/**
 * Phase 13 M9-A step-conversation runtime wiring.
 *
 * Two independent gates must both pass, and neither can be inferred from client
 * input: the accepted M1 Project foundation schema, and the additive M9-A binding
 * schema (migration 0053). While the binding migration is unapplied the route
 * answers 503 rather than pretending a step conversation exists.
 */
const handlers = createStageChatHandlers({
  async authenticate() {
    const session = await auth();
    if (!session?.user?.id) {
      return null;
    }
    return { type: session.user.type, userId: session.user.id };
  },
  async stageSchemaAvailable() {
    if (!(await projectFoundationSchemaAvailable())) {
      return false;
    }
    return projectStageChatSchemaAvailable();
  },
  repository: { findOrCreateStageChat, listStageChatBindings },
  writesEnabled: projectChatWritesEnabled,
});

async function rateLimited(actorUserId: string) {
  try {
    await checkIpRateLimit(actorUserId, {
      keyPrefix: "phase13-m9-a-step-conversation-actor",
      maxRequests: 60,
      ttlSeconds: 60 * 60,
    });
    return true;
  } catch {
    return false;
  }
}

async function guarded(
  request: Request,
  projectId: string,
  action: (request: Request, projectId: string) => Promise<Response>
) {
  const session = await auth();
  if (session?.user?.id && !(await rateLimited(session.user.id))) {
    return Response.json(
      { error: "Too many project requests. Try again later." },
      { status: 429, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  return action(request, projectId);
}

export const projectStageChatHandlers = {
  list(request: Request, projectId: string) {
    return guarded(request, projectId, handlers.list);
  },
  open(request: Request, projectId: string) {
    return guarded(request, projectId, handlers.open);
  },
};
