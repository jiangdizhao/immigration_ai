import { guestRegex } from "@/lib/constants";
import {
  type EntitlementUser,
  isActiveVip,
  isPremiumAllowed,
} from "@/lib/vip/entitlement";

export type AssistantModeAccessUser = {
  type: "guest" | "regular";
  email?: string | null;
};

export function isGuestAssistantUser(user: AssistantModeAccessUser): boolean {
  return user.type === "guest" || guestRegex.test(user.email ?? "");
}

export function assistantModeAccessPolicy(params: {
  user: AssistantModeAccessUser;
  entitlement: EntitlementUser | null;
}) {
  const guest = isGuestAssistantUser(params.user);
  const entitlement = params.entitlement;
  const activeVip = entitlement ? isActiveVip(entitlement) : false;
  const staffOrVip = Boolean(
    entitlement &&
      (entitlement.role === "admin" ||
        entitlement.role === "lawyer" ||
        activeVip)
  );
  return {
    userType: guest ? ("guest" as const) : ("regular" as const),
    fastAllowed: true,
    slowAllowed: !guest && staffOrVip,
    premiumAllowed:
      !guest && entitlement ? isPremiumAllowed(entitlement) : false,
  };
}
