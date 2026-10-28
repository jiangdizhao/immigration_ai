import { projectHumanMessagingHandlers } from "@/lib/project-human-messaging/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectHumanMessagingHandlers.list(request, projectId);
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectHumanMessagingHandlers.create(request, projectId);
}
