import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import { handleDraftHistoryGet } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

/**
 * Phase 12 Stage 3 R2 — lossless history of human draft saves for one revision.
 * Publication authority is enforced by the service (verified lawyer + grant).
 */
export async function GET(request: Request) {
  return await handleDraftHistoryGet({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}
