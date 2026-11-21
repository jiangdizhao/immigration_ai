import { projectStateResponse } from "@/lib/workspace/project-state-server";

type RouteContext = { params: Promise<{ projectId: string }> };

/** Phase 15 M1 versioned, read-only Project State contract. */
export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return projectStateResponse(projectId);
}
