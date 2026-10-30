import { servicePaymentHandlers } from "@/lib/service-payment/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; engagementId: string }>;
};

/** Authorized operator records the contractual payment condition. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, engagementId } = await context.params;
  return servicePaymentHandlers.recordCondition(
    request,
    projectId,
    engagementId
  );
}
