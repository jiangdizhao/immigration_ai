import { professionalReviewHandlers } from "@/lib/professional-review/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

/** An authorized reviewer requests professional review of one immutable target. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return professionalReviewHandlers.createReviewRequest(request, projectId);
}
