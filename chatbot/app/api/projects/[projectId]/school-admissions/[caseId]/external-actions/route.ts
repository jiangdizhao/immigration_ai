import { schoolAdmissionsHandlers } from "@/lib/school-admissions/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; caseId: string }>;
};

/** Self-Service only: records an action the customer performed elsewhere. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, caseId } = await context.params;
  return schoolAdmissionsHandlers.recordExternalAction(
    request,
    projectId,
    caseId
  );
}
