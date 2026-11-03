import { student500Handlers } from "@/lib/student-500/runtime";

type RouteContext = { params: Promise<{ projectId: string }> };

/** The actor's own Student 500 applications inside one authorized Project. */
export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return student500Handlers.list(request, projectId);
}

/** Creates one independent Student 500 preparation record for the actor. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  return student500Handlers.create(request, projectId);
}
