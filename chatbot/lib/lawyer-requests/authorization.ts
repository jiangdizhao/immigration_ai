import { isPremiumAllowed } from "@/lib/vip/entitlement";

export function canCreateLawyerClarificationRequest(
  entitlement: Parameters<typeof isPremiumAllowed>[0],
  now = new Date()
) {
  return isPremiumAllowed(entitlement, now);
}

export function requestSourceForRole(role: "user" | "admin") {
  return role === "admin" ? "admin_test" : "vip_customer";
}
