import { z } from "zod";

// Injectable, framework-free handlers for the admin VIP monthly pricing API.
// Authorization, price reads/writes, and request parsing are separated so the
// authorization and validation behavior can be unit-tested without NextAuth,
// the database, or the network.

export type VipPlanPriceView = {
  id: string;
  amountMinor: number;
  currency: string;
  billingInterval: string;
  providerSyncStatus: string;
  createdAt: Date | string;
};

export type VipPlanPriceRecord = VipPlanPriceView & {
  createdByUserId: string | null;
  provider: string | null;
  providerProductId: string | null;
  providerPriceId: string | null;
  active: boolean;
  retiredAt: Date | null;
};

export type AdminPriceService = {
  getActiveVipMonthlyPrice(): Promise<VipPlanPriceRecord | null>;
  setActiveVipMonthlyPrice(input: {
    amountMinor: number;
    adminUserId: string | null;
  }): Promise<VipPlanPriceRecord | null>;
};

export type AdminAuthenticator = () => Promise<
  { userId: string | null } | Response
>;

const setPriceSchema = z
  .object({
    amountMinor: z.number().int(),
  })
  .strict();

function toPublicPrice(price: VipPlanPriceRecord): VipPlanPriceView {
  return {
    id: price.id,
    amountMinor: price.amountMinor,
    currency: price.currency,
    billingInterval: price.billingInterval,
    providerSyncStatus: price.providerSyncStatus,
    createdAt: price.createdAt,
  };
}

export async function handleAdminVipBillingPriceGet({
  requireAdmin,
  service,
}: {
  requireAdmin: AdminAuthenticator;
  service: Pick<AdminPriceService, "getActiveVipMonthlyPrice">;
}): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  const price = await service.getActiveVipMonthlyPrice();
  return Response.json({ price: price ? toPublicPrice(price) : null });
}

export async function handleAdminVipBillingPriceSet({
  requireAdmin,
  service,
  request,
}: {
  requireAdmin: AdminAuthenticator;
  service: Pick<AdminPriceService, "setActiveVipMonthlyPrice">;
  request: Request;
}): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid monthly price request." },
      { status: 400 }
    );
  }

  const parsed = setPriceSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid monthly price request." },
      { status: 400 }
    );
  }

  const { amountMinor } = parsed.data;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return Response.json(
      { error: "Monthly price must be a positive integer amount in cents." },
      { status: 400 }
    );
  }

  try {
    const price = await service.setActiveVipMonthlyPrice({
      amountMinor,
      adminUserId: admin.userId,
    });
    return Response.json({ price: price ? toPublicPrice(price) : null });
  } catch (error) {
    console.error("Unable to set the VIP monthly price:", error);
    return Response.json(
      { error: "Unable to update the VIP monthly price." },
      { status: 500 }
    );
  }
}
