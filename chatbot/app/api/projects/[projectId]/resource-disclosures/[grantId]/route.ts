import { serviceEngagementHandlers } from "@/lib/service-engagement/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; grantId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId, grantId } = await context.params;
  return serviceEngagementHandlers.disclosureDetail(
    request,
    projectId,
    grantId
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectId, grantId } = await context.params;
  return serviceEngagementHandlers.revokeDisclosure(
    request,
    projectId,
    grantId
  );
}
