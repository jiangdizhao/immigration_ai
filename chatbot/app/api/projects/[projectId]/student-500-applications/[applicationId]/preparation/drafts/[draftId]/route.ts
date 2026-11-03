import { student500PreparationHandlers } from "@/lib/student-500/preparation/runtime";

type RouteContext = {
  params: Promise<{
    applicationId: string;
    draftId: string;
    projectId: string;
  }>;
};

/** Reopens one immutable, authorized provisional GS draft version. */
export async function GET(request: Request, context: RouteContext) {
  const { applicationId, draftId, projectId } = await context.params;
  return student500PreparationHandlers.getDraft(
    request,
    projectId,
    applicationId,
    draftId
  );
}
