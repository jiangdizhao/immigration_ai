import { servicePaymentHandlers } from "@/lib/service-payment/runtime";

type RouteContext = {
  params: Promise<{
    projectId: string;
    engagementId: string;
    evidenceId: string;
  }>;
};

/** Independent finance verifier accepts or rejects pending evidence. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, engagementId, evidenceId } = await context.params;
  return servicePaymentHandlers.verifyEvidence(
    request,
    projectId,
    engagementId,
    evidenceId
  );
}
