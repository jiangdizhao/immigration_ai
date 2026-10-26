import { projectDocumentHandlers } from "@/lib/project-documents/runtime";

type RouteContext = { params: Promise<{ projectId: string; grantId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { projectId, grantId } = await context.params;
  return projectDocumentHandlers.revokeGrant(request, projectId, grantId);
}
