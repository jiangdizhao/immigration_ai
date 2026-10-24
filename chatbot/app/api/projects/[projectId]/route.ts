import { projectFoundationHandlers } from "@/lib/projects/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectFoundationHandlers.getProject(request, projectId);
}
