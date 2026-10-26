import { projectDocumentHandlers } from "@/lib/project-documents/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectDocumentHandlers.list(request, projectId);
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectDocumentHandlers.upload(request, projectId);
}
