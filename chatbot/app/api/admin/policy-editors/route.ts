import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import {
  handlePolicyEditorGrantsGet,
  handlePolicyEditorGrantUpdate,
} from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

/**
 * Administrator-only management of the explicit Policy Editor capability.
 * The route-level admin check is defense in depth; the service independently
 * verifies the actor's stored role before granting, revoking or listing, and
 * only verified lawyer accounts may be granted publication authority.
 */
async function requireAdminActor() {
  const admin = await requireAdminUser();
  return admin instanceof Response ? admin : { userId: admin.id };
}

export async function GET() {
  return await handlePolicyEditorGrantsGet({
    resolveActor: requireAdminActor,
    service: policyEditorialService,
  });
}

export async function PATCH(request: Request) {
  return await handlePolicyEditorGrantUpdate({
    resolveActor: requireAdminActor,
    service: policyEditorialService,
    request,
  });
}
