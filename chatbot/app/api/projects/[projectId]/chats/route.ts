import { projectChatsHandlers } from "@/lib/projects/chats-runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectChatsHandlers.list(request, projectId);
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectChatsHandlers.create(request, projectId);
}
