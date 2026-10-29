import { serviceEngagementHandlers } from "@/lib/service-engagement/runtime";

type RouteContext = {
  params: Promise<{
    projectId: string;
    engagementId: string;
    evidenceId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId, engagementId, evidenceId } = await context.params;
  return serviceEngagementHandlers.verifySignature(
    request,
    projectId,
    engagementId,
    evidenceId
  );
}
