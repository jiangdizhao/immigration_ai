import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import { handleForcePublishOverride } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

export async function POST(request: Request) {
  return await handleForcePublishOverride({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}
