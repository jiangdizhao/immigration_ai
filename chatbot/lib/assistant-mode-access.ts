import { guestRegex } from "@/lib/constants";

export type AssistantModeAccessUser = {
  type: "guest" | "regular";
  email?: string | null;
};

export function isGuestAssistantUser(user: AssistantModeAccessUser): boolean {
  return user.type === "guest" || guestRegex.test(user.email ?? "");
}

export function assistantModeAccessPolicy(params: {
  user: AssistantModeAccessUser;
  premiumAllowed: boolean;
}) {
  const guest = isGuestAssistantUser(params.user);
  return {
    userType: guest ? ("guest" as const) : ("regular" as const),
    fastAllowed: true,
    slowAllowed: !guest,
    premiumAllowed: !guest && params.premiumAllowed,
  };
}
