import { student500PreparationHandlers } from "@/lib/student-500/preparation/runtime";

type RouteContext = {
  params: Promise<{ applicationId: string; projectId: string }>;
};

/** The authorized preparation view for one Student 500 application. */
export async function GET(request: Request, context: RouteContext) {
  const { applicationId, projectId } = await context.params;
  return student500PreparationHandlers.get(request, projectId, applicationId);
}

/**
 * One bounded preparation action (select/unselect fact, set school context, create
 * or save a GS draft version, create a preparation snapshot).
 */
export async function POST(request: Request, context: RouteContext) {
  const { applicationId, projectId } = await context.params;
  return student500PreparationHandlers.act(request, projectId, applicationId);
}
