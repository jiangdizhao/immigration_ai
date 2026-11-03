import { student500Handlers } from "@/lib/student-500/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; applicationId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId, applicationId } = await context.params;
  return student500Handlers.archive(request, projectId, applicationId);
}
