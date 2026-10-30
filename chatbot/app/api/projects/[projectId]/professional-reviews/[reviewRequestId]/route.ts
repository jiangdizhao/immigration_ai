import { professionalReviewHandlers } from "@/lib/professional-review/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; reviewRequestId: string }>;
};

/** Privacy-safe review status (no package content, no reviewer free text). */
export async function GET(request: Request, context: RouteContext) {
  const { projectId, reviewRequestId } = await context.params;
  return professionalReviewHandlers.getReview(
    request,
    projectId,
    reviewRequestId
  );
}
