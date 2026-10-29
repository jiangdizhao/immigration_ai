import { serviceEngagementHandlers } from "@/lib/service-engagement/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; engagementId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId, engagementId } = await context.params;
  return serviceEngagementHandlers.submitSignature(
    request,
    projectId,
    engagementId
  );
}
