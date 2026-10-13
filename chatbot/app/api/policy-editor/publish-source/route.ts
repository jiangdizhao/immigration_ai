import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import { handlePublishOfficialSource } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

/**
 * Phase 12 Stage 3 — Publish Official Source. A verified lawyer with an active
 * Policy Editor grant publishes the item's persisted official snapshot without
 * AI analysis. The service re-verifies the database identity and authority.
 */
export async function POST(request: Request) {
  return await handlePublishOfficialSource({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}
