import { servicePaymentHandlers } from "@/lib/service-payment/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; engagementId: string }>;
};

/** Authorized operator records a dispute, refund, reversal, void or correction. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, engagementId } = await context.params;
  return servicePaymentHandlers.recordResolution(
    request,
    projectId,
    engagementId
  );
}
