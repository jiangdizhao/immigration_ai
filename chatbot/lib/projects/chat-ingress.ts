import "server-only";

import { projectFoundationRepository } from "@/lib/db/project-foundation";
import { projectFoundationSchemaStatus } from "@/lib/db/project-foundation-schema-availability";
import {
  projectChatIdentifierRequiresScopedIngress,
  projectChatWritesEnabled,
} from "./chat-policy";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * A persisted Project association is the only Project-origin signal. Checking
 * both request identifiers prevents `id` from downgrading a Project Chat to an
 * unscoped/standalone model request when `frontendChatId` is omitted.
 */
export async function guardProjectChatIngress(input: {
  id?: string | null;
  frontendChatId?: string | null;
}): Promise<Response | null> {
  const identifiers = [...new Set([input.id, input.frontendChatId])].filter(
    (value): value is string => Boolean(value && UUID_PATTERN.test(value))
  );
  if (identifiers.length === 0) {
    return null;
  }

  let schemaStatus: Awaited<ReturnType<typeof projectFoundationSchemaStatus>>;
  try {
    schemaStatus = await projectFoundationSchemaStatus();
  } catch {
    return jsonError("Project service is unavailable.", 503);
  }
  if (schemaStatus === "partial") {
    return jsonError("Project service is unavailable.", 503);
  }
  if (schemaStatus === "absent") {
    return projectChatWritesEnabled()
      ? jsonError("Project service is unavailable.", 503)
      : null;
  }

  let projectChatIds: string[];
  try {
    const origins = await Promise.all(
      identifiers.map((chatId) =>
        projectFoundationRepository.getProjectChatOrigin(chatId)
      )
    );
    projectChatIds = identifiers.filter((_, index) => Boolean(origins[index]));
  } catch {
    return jsonError("Project service is unavailable.", 503);
  }

  if (
    projectChatIdentifierRequiresScopedIngress({
      projectChatIds,
      frontendChatId: input.frontendChatId,
    })
  ) {
    return jsonError("Conversation not found.", 404);
  }
  if (projectChatIds.length && !projectChatWritesEnabled()) {
    return jsonError("Project chats are read-only right now.", 503);
  }
  return null;
}
