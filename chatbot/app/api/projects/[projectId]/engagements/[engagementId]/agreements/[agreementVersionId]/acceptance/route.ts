import { serviceEngagementHandlers } from "@/lib/service-engagement/runtime";

type RouteContext = {
  params: Promise<{
    projectId: string;
    engagementId: string;
    agreementVersionId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId, engagementId, agreementVersionId } = await context.params;
  return serviceEngagementHandlers.acceptAgreement(
    request,
    projectId,
    engagementId,
    agreementVersionId
  );
}
