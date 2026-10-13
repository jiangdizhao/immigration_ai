import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import { handleEditorialWorkspaceGet } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

export async function GET(request: Request) {
  return await handleEditorialWorkspaceGet({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}
