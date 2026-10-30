import { schoolApplicationHandlers } from "@/lib/school-applications/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; applicationId: string }>;
};

/**
 * Binds an authorized M2 fact/requirement/document identity to this application.
 * The binding grants no AI-use, staff-disclosure or document-read permission.
 */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, applicationId } = await context.params;
  return schoolApplicationHandlers.bindReference(
    request,
    projectId,
    applicationId
  );
}
