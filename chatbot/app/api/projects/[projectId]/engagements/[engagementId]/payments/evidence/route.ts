import { servicePaymentHandlers } from "@/lib/service-payment/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; engagementId: string }>;
};

/** Authorized operator submits bounded external payment evidence. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, engagementId } = await context.params;
  return servicePaymentHandlers.submitEvidence(
    request,
    projectId,
    engagementId
  );
}
