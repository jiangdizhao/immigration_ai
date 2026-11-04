import { student500DeepPreparationHandlers } from "@/lib/student-500/preparation/m7-runtime";

type RouteContext = {
  params: Promise<{ applicationId: string; projectId: string }>;
};

/**
 * Phase 13 M7 deep-preparation view: complex-case tasks, follow-up questions, GS
 * revision proposals and consent-bound editorial review state.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { applicationId, projectId } = await context.params;
  return student500DeepPreparationHandlers.get(projectId, applicationId);
}

/**
 * One bounded M7 action. Submission, approval and sign-off have no route here: M8
 * owns those and M7 must not expose them.
 */
export async function POST(request: Request, context: RouteContext) {
  const { applicationId, projectId } = await context.params;
  return student500DeepPreparationHandlers.act(
    request,
    projectId,
    applicationId
  );
}
