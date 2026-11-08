import { projectStageChatHandlers } from "@/lib/projects/stage-chats-runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectStageChatHandlers.list(request, projectId);
}

/**
 * Phase 13 M9-A: find or create the requesting actor's own conversation for one
 * Project workflow step. The step vocabulary is a closed enum, so this endpoint
 * cannot invent a workflow stage, and it never binds an existing Chat.
 */
export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectStageChatHandlers.open(request, projectId);
}
