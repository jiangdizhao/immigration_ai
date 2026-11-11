import { projectDocumentHandlers } from "@/lib/project-documents/runtime";

type RouteContext = { params: Promise<{ projectId: string; assetId: string }> };

/**
 * Phase 14-B R1-03: explicit evidence extraction for one stored, clean exact version.
 * This is the reachable processing action that completes the
 * Document → Evidence → proposed Project Facts path. It stays fail-closed: while the
 * documents runtime has no trusted application the handler answers 503 before reading
 * anything.
 */
export async function POST(request: Request, context: RouteContext) {
  const { projectId, assetId } = await context.params;
  return projectDocumentHandlers.extractEvidence(request, projectId, assetId);
}
