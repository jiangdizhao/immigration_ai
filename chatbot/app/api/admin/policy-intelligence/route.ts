import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import { handleAdminPolicyIntelligenceGet } from "@/lib/policy-intelligence/admin-api";
import { adminPolicyIntelligenceService } from "@/lib/policy-intelligence/admin-service";
import { handleAdminPolicyItemAction } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

async function requirePolicyAdmin() {
  const admin = await requireAdminUser();
  return admin instanceof Response ? admin : { userId: admin.id };
}

export async function GET() {
  return await handleAdminPolicyIntelligenceGet({
    requireAdmin: requirePolicyAdmin,
    service: adminPolicyIntelligenceService,
  });
}

/**
 * Phase 12 Stage 3: archive/restore runs through the audited editorial service,
 * so every action writes a durable Policy Intelligence editorial event (actor,
 * timestamp, old/new status) instead of a silent status flip.
 *
 * D-070: a verified Admin (the firm's principal lawyer) holds inherent
 * publication authority, so this route serves the Admin Policy Intelligence
 * page while the editorial service still re-verifies the database identity.
 * Other accounts need a verified lawyer identity plus an active Policy Editor
 * grant; everyone else receives 403.
 *
 * The Admin page posts `{ itemId, action }`; the shared handler validates that
 * strict shape once and forwards only the archive/restore payload (D-073
 * owner-host correction — the routing field previously leaked into the strict
 * handler schema and every Admin request failed with `validation_failed`).
 */
export async function PATCH(request: Request) {
  return await handleAdminPolicyItemAction({
    resolveActor: requirePolicyAdmin,
    service: policyEditorialService,
    request,
  });
}
