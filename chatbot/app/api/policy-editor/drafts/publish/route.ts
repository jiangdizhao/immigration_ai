import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import { handlePublishManualDraft } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

export async function POST(request: Request) {
  return await handlePublishManualDraft({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}
