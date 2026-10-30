import { schoolAdmissionsHandlers } from "@/lib/school-admissions/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; caseId: string }>;
};

/** Records a claimed school-application exception (never auto-verified). */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, caseId } = await context.params;
  return schoolAdmissionsHandlers.claimException(request, projectId, caseId);
}
