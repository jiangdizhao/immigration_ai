import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import {
  handleCreateManualDraft,
  handleSaveManualDraft,
} from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

export async function POST(request: Request) {
  return await handleCreateManualDraft({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}

export async function PATCH(request: Request) {
  return await handleSaveManualDraft({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    request,
  });
}
