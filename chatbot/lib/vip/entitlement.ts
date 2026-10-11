export type VipMembershipTier = "free" | "vip";
export type VipUserRole = "user" | "lawyer" | "admin";

export type EntitlementUser = {
  role: VipUserRole;
  membershipTier: VipMembershipTier;
  vipExpiresAt: Date | string | null;
};

export type PrepaidVipPurchaseEntitlement = {
  provider: string;
  currency: string;
  status: string;
  vipExpiresAt: Date | null;
};

/**
 * Phase 12 Stage 1 R3 typing correction: the retained entitlement is always a
 * concrete membership tier plus either a real `Date` expiry or `null`. It used
 * to be declared as `Pick<EntitlementUser, "membershipTier" | "vipExpiresAt">`,
 * which widened `vipExpiresAt` to `Date | string | null` even though the
 * function never returns a string, and that widened type did not match the
 * database timestamp column. The declaration below matches the guaranteed
 * runtime values exactly; no runtime behaviour changed.
 */
export type RetainedPrepaidVipEntitlement = {
  membershipTier: VipMembershipTier;
  vipExpiresAt: Date | null;
};

function expirationDate(value: Date | string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isActiveVip(
  user: Pick<EntitlementUser, "membershipTier" | "vipExpiresAt">,
  now = new Date()
): boolean {
  const expiresAt = expirationDate(user.vipExpiresAt);
  return user.membershipTier === "vip" && Boolean(expiresAt && expiresAt > now);
}

export function isPremiumAllowed(user: EntitlementUser, now = new Date()) {
  return user.role === "admin" || isActiveVip(user, now);
}

export function calculateVipWindow(
  currentExpiry: Date | null,
  now: Date,
  durationDays: number
) {
  const vipStartsAt =
    currentExpiry && currentExpiry > now ? currentExpiry : now;
  const vipExpiresAt = new Date(
    vipStartsAt.getTime() + durationDays * 24 * 60 * 60 * 1000
  );
  return { vipStartsAt, vipExpiresAt };
}

/**
 * Project entitlement after recurring-subscription deletion using only the
 * currently supported trusted Stripe CNY prepaid purchase records. The user
 * expiry field is intentionally not an input because it may contain only the
 * deleted recurring subscription's paid-through date.
 */
export function getRetainedPrepaidVipEntitlement(
  purchases: readonly PrepaidVipPurchaseEntitlement[],
  now = new Date()
): RetainedPrepaidVipEntitlement {
  let latestExpiry: Date | null = null;

  for (const purchase of purchases) {
    const expiresAt = purchase.vipExpiresAt;
    if (
      purchase.provider !== "stripe" ||
      purchase.currency !== "CNY" ||
      purchase.status !== "paid" ||
      !expiresAt ||
      expiresAt <= now
    ) {
      continue;
    }

    if (!latestExpiry || expiresAt > latestExpiry) {
      latestExpiry = expiresAt;
    }
  }

  return latestExpiry
    ? { membershipTier: "vip", vipExpiresAt: latestExpiry }
    : { membershipTier: "free", vipExpiresAt: null };
}

export function entitlementState(user: EntitlementUser, now = new Date()) {
  const activeVip = isActiveVip(user, now);
  return {
    activeVip,
    premiumAllowed: user.role === "admin" || activeVip,
    expiredVip:
      user.membershipTier === "vip" &&
      !activeVip &&
      user.membershipTier === "vip" &&
      !activeVip,
  };
}

export function premiumDeniedResponse() {
  return Response.json(
    {
      error: "Premium AI requires an active VIP membership.",
      upgradePath: "/vip",
    },
    { status: 403 }
  );
}
