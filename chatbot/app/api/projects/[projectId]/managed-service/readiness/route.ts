import { managedHandoffHandlers } from "@/lib/managed-handoff/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

/** Read-only managed-handoff readiness assessment. Never submits anything. */
export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return managedHandoffHandlers.getReadiness(request, projectId);
}
