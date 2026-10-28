import { projectHumanMessagingHandlers } from "@/lib/project-human-messaging/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; threadId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const { projectId, threadId } = await context.params;
  return projectHumanMessagingHandlers.withdraw(request, projectId, threadId);
}
