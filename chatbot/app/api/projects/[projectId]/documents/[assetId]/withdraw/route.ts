import { projectDocumentHandlers } from "@/lib/project-documents/runtime";

type RouteContext = { params: Promise<{ projectId: string; assetId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { projectId, assetId } = await context.params;
  return projectDocumentHandlers.withdraw(request, projectId, assetId);
}
