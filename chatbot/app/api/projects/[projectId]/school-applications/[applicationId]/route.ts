import { schoolApplicationHandlers } from "@/lib/school-applications/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; applicationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId, applicationId } = await context.params;
  return schoolApplicationHandlers.get(request, projectId, applicationId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId, applicationId } = await context.params;
  return schoolApplicationHandlers.update(request, projectId, applicationId);
}
