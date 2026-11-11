import { projectFactHandlers } from "@/lib/project-facts/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectFactHandlers.list(request, projectId);
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectFactHandlers.apply(request, projectId);
}
