import { schoolAdmissionsHandlers } from "@/lib/school-admissions/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

/** The actor's own school admissions cases inside one authorized Project. */
export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return schoolAdmissionsHandlers.list(request, projectId);
}

/** Creates one admission case (bound application or genuine existing outcome). */
export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return schoolAdmissionsHandlers.create(request, projectId);
}
