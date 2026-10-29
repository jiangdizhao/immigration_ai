import { serviceEngagementHandlers } from "@/lib/service-engagement/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return serviceEngagementHandlers.listEngagements(request, projectId);
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return serviceEngagementHandlers.createEngagement(request, projectId);
}
