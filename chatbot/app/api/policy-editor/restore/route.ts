import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import { handleRestorePolicyItem } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

export async function POST(request: Request) {
  return await handleRestorePolicyItem({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}
