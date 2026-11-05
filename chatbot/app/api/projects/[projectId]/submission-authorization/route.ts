import { submissionAuthorizationHandlers } from "@/lib/submission-authorization/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Phase 13 M8.2 submission authorization for one Project target.
 *
 * GET returns the current exact package identity, both service-mode availabilities,
 * the authorization history with live validity, the handoff state and every external
 * record with its provenance. POST performs one of five bounded actions. Nothing here
 * submits an application, verifies an external receipt or approves a professional.
 */
export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return submissionAuthorizationHandlers.get(request, projectId);
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return submissionAuthorizationHandlers.act(request, projectId);
}
