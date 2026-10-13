import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import { handleEditorialItemGet } from "@/lib/policy-intelligence/editorial-api";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await context.params;
  return await handleEditorialItemGet({
    resolveActor: editorialActorResolver,
    service: policyEditorialService,
    itemId,
  });
}
