import { projectHumanMessagingHandlers } from "@/lib/project-human-messaging/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; threadId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId, threadId } = await context.params;
  return projectHumanMessagingHandlers.messages(request, projectId, threadId);
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId, threadId } = await context.params;
  return projectHumanMessagingHandlers.messages(request, projectId, threadId);
}
