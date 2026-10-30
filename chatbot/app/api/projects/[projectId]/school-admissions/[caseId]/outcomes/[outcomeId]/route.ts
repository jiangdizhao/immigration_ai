import { schoolAdmissionsHandlers } from "@/lib/school-admissions/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; caseId: string; outcomeId: string }>;
};

/** Advances an Offer decision or a CoE evidence state (forward-only). */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, caseId, outcomeId } = await context.params;
  return schoolAdmissionsHandlers.transitionOutcome(
    request,
    projectId,
    caseId,
    outcomeId
  );
}
