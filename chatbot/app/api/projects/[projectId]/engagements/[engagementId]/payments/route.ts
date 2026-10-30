import { servicePaymentHandlers } from "@/lib/service-payment/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; engagementId: string }>;
};

/** Customer-safe (or operator) effective payment status. */
export async function GET(request: Request, context: RouteContext) {
  const { projectId, engagementId } = await context.params;
  return servicePaymentHandlers.getPaymentStatus(
    request,
    projectId,
    engagementId
  );
}
