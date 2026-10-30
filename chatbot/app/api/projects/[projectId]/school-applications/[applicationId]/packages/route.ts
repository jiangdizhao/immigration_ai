import { schoolApplicationHandlers } from "@/lib/school-applications/runtime";

type RouteContext = {
  params: Promise<{ projectId: string; applicationId: string }>;
};

/** Immutable preparation package metadata (and the current snapshot) for one application. */
export async function GET(request: Request, context: RouteContext) {
  const { projectId, applicationId } = await context.params;
  return schoolApplicationHandlers.listPackages(
    request,
    projectId,
    applicationId
  );
}

/** Builds the next immutable package version or reuses the current exact one. */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, applicationId } = await context.params;
  return schoolApplicationHandlers.buildPackage(
    request,
    projectId,
    applicationId
  );
}
