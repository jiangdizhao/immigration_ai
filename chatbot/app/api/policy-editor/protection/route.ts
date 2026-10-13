import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import { handleReleasePublicationProtection } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

/**
 * Phase 12 Stage 3 R1 — explicit editor release of durable human-publication
 * protection. After this transition the item publishes automatically again, so
 * the caller must hold publication authority (verified, granted lawyer).
 */
export async function POST(request: Request) {
  return await handleReleasePublicationProtection({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}
