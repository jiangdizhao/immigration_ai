import { schoolAdmissionsHandlers } from "@/lib/school-admissions/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; caseId: string }>;
};

/** Records a customer-reported or documented-but-unverified Offer/CoE. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, caseId } = await context.params;
  return schoolAdmissionsHandlers.recordOutcome(request, projectId, caseId);
}
