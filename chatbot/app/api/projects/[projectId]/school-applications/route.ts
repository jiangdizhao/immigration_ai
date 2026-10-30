import { schoolApplicationHandlers } from "@/lib/school-applications/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

/** The actor's own school applications inside one authorized Project. */
export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return schoolApplicationHandlers.list(request, projectId);
}

/** Creates one independent school application for the authenticated creator. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return schoolApplicationHandlers.create(request, projectId);
}
