import { professionalReviewHandlers } from "@/lib/professional-review/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; reviewRequestId: string }>;
};

/** An authorized reviewer records start/changes/approval/rejection/invalidation. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, reviewRequestId } = await context.params;
  return professionalReviewHandlers.recordDecision(
    request,
    projectId,
    reviewRequestId
  );
}
