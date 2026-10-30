import { schoolAdmissionsHandlers } from "@/lib/school-admissions/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; caseId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId, caseId } = await context.params;
  return schoolAdmissionsHandlers.confirmPreparation(
    request,
    projectId,
    caseId
  );
}
