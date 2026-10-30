import { schoolAdmissionsHandlers } from "@/lib/school-admissions/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; caseId: string }>;
};

/** Evaluates Managed-Service readiness through the deny-only M4 gate. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, caseId } = await context.params;
  return schoolAdmissionsHandlers.evaluateReadiness(request, projectId, caseId);
}
