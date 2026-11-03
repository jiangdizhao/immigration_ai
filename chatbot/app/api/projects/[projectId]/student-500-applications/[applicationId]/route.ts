import { student500Handlers } from "@/lib/student-500/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; applicationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId, applicationId } = await context.params;
  return student500Handlers.get(request, projectId, applicationId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId, applicationId } = await context.params;
  return student500Handlers.update(request, projectId, applicationId);
}
