import { student500PreparationHandlers } from "@/lib/student-500/preparation/runtime";

type RouteContext = {
  params: Promise<{
    applicationId: string;
    projectId: string;
    snapshotId: string;
  }>;
};

/** Reopens one immutable, authorized preparation summary version. */
export async function GET(request: Request, context: RouteContext) {
  const { applicationId, projectId, snapshotId } = await context.params;
  return student500PreparationHandlers.getSnapshot(
    request,
    projectId,
    applicationId,
    snapshotId
  );
}
