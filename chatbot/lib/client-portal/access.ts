export type PortalIdentity = {
  type: "guest" | "regular";
  role: "user" | "lawyer" | "admin";
  email?: string | null;
};

export type ClientPortalAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "unauthenticated" | "guest" | "lawyer" | "admin";
    };

export function authorizeClientPortalIdentity(
  identity: PortalIdentity | null
): ClientPortalAccessDecision {
  if (!identity) {
    return { allowed: false, reason: "unauthenticated" };
  }
  if (identity.type !== "regular") {
    return { allowed: false, reason: "guest" };
  }
  if (identity.role === "lawyer") {
    return { allowed: false, reason: "lawyer" };
  }
  if (identity.role === "admin") {
    return { allowed: false, reason: "admin" };
  }
  return { allowed: true };
}

export function clientPortalRedirectForRole(role: string) {
  if (role === "lawyer") {
    return "/lawyer-portal";
  }
  if (role === "admin") {
    return "/admin-portal";
  }
  return null;
}
