import { projectDocumentHandlers } from "@/lib/project-documents/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectDocumentHandlers.importChatDocument(request, projectId);
}
