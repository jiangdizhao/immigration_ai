import { staffWorkspaceHandlers } from "@/lib/staff-workspace/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Phase 13 M9-B Staff review detail for one Project.
 *
 * The minimal Project shell is returned only for a current active assignment. Protected
 * review material stays behind the M4-004 disclosure gate, which currently denies, so the
 * response carries the gate reason and no review items.
 */
export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return staffWorkspaceHandlers.getProjectDetail(request, projectId);
}
