import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import {
  handleAdminPolicyIntelligenceGet,
  handleAdminPolicyIntelligenceUpdate,
} from "@/lib/policy-intelligence/admin-api";
import { adminPolicyIntelligenceService } from "@/lib/policy-intelligence/admin-service";

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

export async function PATCH(request: Request) {
  return await handleAdminPolicyIntelligenceUpdate({
    requireAdmin: requirePolicyAdmin,
    service: adminPolicyIntelligenceService,
    request,
  });
}
