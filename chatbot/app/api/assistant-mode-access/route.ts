import { auth } from "@/app/(auth)/auth";
import {
  assistantModeAccessPolicy,
  isGuestAssistantUser,
} from "@/lib/assistant-mode-access";
import { getUserEntitlementById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { isPremiumAllowed } from "@/lib/vip/entitlement";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const guest = isGuestAssistantUser(session.user);
  const entitlement = guest
    ? null
    : await getUserEntitlementById(session.user.id);
  if (!guest && !entitlement) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  return Response.json(
    assistantModeAccessPolicy({
      user: session.user,
      premiumAllowed: entitlement ? isPremiumAllowed(entitlement) : false,
    })
  );
}
