import { schoolApplicationHandlers } from "@/lib/school-applications/runtime";

type RouteContext = {
  params: Promise<{
    projectId: string;
    applicationId: string;
    referenceRecordId: string;
  }>;
};

/** Revokes one binding. The row is retained as history, never deleted. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, applicationId, referenceRecordId } = await context.params;
  return schoolApplicationHandlers.revokeReference(
    request,
    projectId,
    applicationId,
    referenceRecordId
  );
}
