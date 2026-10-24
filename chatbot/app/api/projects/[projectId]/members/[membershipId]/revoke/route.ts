import { projectFoundationHandlers } from "@/lib/projects/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; membershipId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { projectId, membershipId } = await context.params;
  return projectFoundationHandlers.revokeMember(
    request,
    projectId,
    membershipId
  );
}
