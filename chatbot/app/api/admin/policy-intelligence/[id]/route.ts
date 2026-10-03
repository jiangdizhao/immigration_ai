import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import { handleAdminPolicyIntelligenceDetailGet } from "@/lib/policy-intelligence/admin-api";
import { adminPolicyIntelligenceService } from "@/lib/policy-intelligence/admin-service";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function requirePolicyAdmin() {
  const admin = await requireAdminUser();
  return admin instanceof Response ? admin : { userId: admin.id };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return await handleAdminPolicyIntelligenceDetailGet({
    requireAdmin: requirePolicyAdmin,
    service: adminPolicyIntelligenceService,
    itemId: id,
  });
}
