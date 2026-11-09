import { reviewHandlers } from "@/lib/review/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Phase 13 M9-B exact-version review surface for one Project.
 *
 * GET returns the actor's own authorized review read model (artifact/package identities
 * plus the three independent review dimensions). POST asks the existing M4-006 workflow
 * for professional review of one exact version; while that workflow is fail-closed the
 * response is the workflow's own refusal, never a fabricated request.
 */
export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return reviewHandlers.getProjectReview(request, projectId);
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return reviewHandlers.requestProjectReview(request, projectId);
}
