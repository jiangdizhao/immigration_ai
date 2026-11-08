import { workspaceSummaryResponse } from "@/lib/workspace/workspace-summary-server";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Phase 13 M9-A: the bounded overview projection for one Project.
 *
 * Read-only. It composes the accepted M5.1/M6.1 services and the real M2 document
 * gate for the *requesting actor*, so a tampered client cannot describe another
 * Project and a blocked capability is reported as blocked rather than empty.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return workspaceSummaryResponse(projectId);
}
