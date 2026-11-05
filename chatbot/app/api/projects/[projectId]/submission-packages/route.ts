import { submissionPackageHandlers } from "@/lib/submission-packages/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Phase 13 M8.1 submission packages for one Project.
 *
 * GET lists the immutable versions of one target with live freshness and the
 * confirmation history. POST freezes one exact version or records one explicit
 * customer confirmation. Professional sign-off, submission authorization and
 * external receipts have no route here: they belong to M8.2.
 */
export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return submissionPackageHandlers.get(request, projectId);
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return submissionPackageHandlers.act(request, projectId);
}
