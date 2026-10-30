import { schoolApplicationHandlers } from "@/lib/school-applications/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; applicationId: string }>;
};

/** Archive is terminal: an archived application is never deleted or reopened. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, applicationId } = await context.params;
  return schoolApplicationHandlers.archive(request, projectId, applicationId);
}
