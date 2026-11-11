import { projectFoundationHandlers } from "@/lib/projects/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectFoundationHandlers.getProject(request, projectId);
}

/**
 * Phase 14: rename an existing Project (owner-only). The handler enforces server-side
 * actor identity, ownership, the write capability, `expectedRevision` CAS and the
 * shared name normalization; it returns the authoritative updated Project.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectFoundationHandlers.renameProject(request, projectId);
}
