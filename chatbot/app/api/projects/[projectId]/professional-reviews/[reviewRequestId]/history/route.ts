import { professionalReviewHandlers } from "@/lib/professional-review/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; reviewRequestId: string }>;
};

/** Append-only review history for audit. */
export async function GET(request: Request, context: RouteContext) {
  const { projectId, reviewRequestId } = await context.params;
  return professionalReviewHandlers.getReviewHistory(
    request,
    projectId,
    reviewRequestId
  );
}
