import { schoolAdmissionsHandlers } from "@/lib/school-admissions/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; caseId: string }>;
};

/** Selects Self-Service or Managed Service for one case. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, caseId } = await context.params;
  return schoolAdmissionsHandlers.setServiceMode(request, projectId, caseId);
}
