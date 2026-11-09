import { staffWorkspaceHandlers } from "@/lib/staff-workspace/runtime";

/**
 * Phase 13 M9-B Staff/Lawyer queue.
 *
 * Only an authenticated `lawyer` account reaches the loader, and the loader itself only
 * reports assignments this actor's own M4-002 records authorize. Categories that cannot be
 * read are labelled, never shown as empty.
 */
export async function GET(request: Request) {
  return await staffWorkspaceHandlers.getQueue(request);
}
