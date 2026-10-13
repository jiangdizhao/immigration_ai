import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import { handleArchivePolicyItem } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

export async function POST(request: Request) {
  return await handleArchivePolicyItem({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}
