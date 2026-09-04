"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type VipStatus = {
  role: "user" | "lawyer" | "admin";
  membershipTier: "free" | "vip";
  vipExpiresAt: string | null;
  activeVip: boolean;
  premiumAllowed: boolean;
  expiredVip: boolean;
  simulationEnabled: boolean;
  product: {
    amountMinor: number;
    currency: string;
    durationDays: number;
  } | null;
  billingProvider: {
    provider: "stripe" | "simulation" | "unconfigured";
    ready: boolean;
  };
  activePlan: {
    amountMinor: number;
    currency: string;
    interval: string;
  } | null;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

type Purchase = {
  purchaseId?: string;
  id?: string;
  providerPaymentId: string;
  status: "pending" | "paid" | "failed" | "cancelled";
  amountMinor?: number;
  currency?: string;
  durationDays?: number;
};

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleDateString();
}

function formatAmount(amountMinor: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export function VipMembershipClient() {
  const [status, setStatus] = useState<VipStatus | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/vip/status");
    if (!response.ok) {
      throw new Error("Unable to load membership status.");
    }
    setStatus((await response.json()) as VipStatus);
  }, []);

  useEffect(() => {
    refreshStatus().catch((statusError) => {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to load membership status."
      );
    });

    // Browser redirect state is display-only. It NEVER activates VIP; the
    // status API reflects activation only after verified provider payment.
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setCheckoutNotice(
        "Payment submitted. Membership activates after secure payment confirmation."
      );
    } else if (params.get("checkout") === "cancelled") {
      setCheckoutNotice("Checkout was cancelled. You were not charged.");
    }
  }, [refreshStatus]);

  const startCheckout = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vip/checkout", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to start checkout.");
      }
      if (typeof data.url === "string") {
        // Stripe-hosted Checkout handles all payment-card data.
        window.location.assign(data.url);
        return;
      }
      setPurchase(data as Purchase);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to start checkout."
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmCheckout = async () => {
    if (!purchase?.purchaseId && !purchase?.id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vip/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: purchase.purchaseId ?? purchase.id,
          providerPaymentId: purchase.providerPaymentId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to confirm payment.");
      }
      setPurchase(data.purchase as Purchase);
      await refreshStatus();
    } catch (confirmationError) {
      setError(
        confirmationError instanceof Error
          ? confirmationError.message
          : "Unable to confirm payment."
      );
    } finally {
      setBusy(false);
    }
  };

  const cancelRenewal = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vip/subscription/cancel", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to cancel renewal.");
      }
      await refreshStatus();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Unable to cancel renewal."
      );
    } finally {
      setBusy(false);
    }
  };

  const manageBilling = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vip/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to open billing management.");
      }
      if (typeof data.url === "string") {
        window.location.assign(data.url);
      }
    } catch (portalError) {
      setError(
        portalError instanceof Error
          ? portalError.message
          : "Unable to open billing management."
      );
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <p className="mt-8 text-sm text-slate-600">Loading membership status…</p>
    );
  }

  if (status.premiumAllowed) {
    return (
      <div className="mt-8 space-y-4">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950">
          <p className="font-semibold">
            {status.role === "admin" && !status.activeVip
              ? "Administrator access"
              : "Active VIP"}
          </p>
          {status.activeVip ? (
            <>
              <p className="mt-1">
                Access through {formatDate(status.vipExpiresAt)}.
                {status.subscription?.cancelAtPeriodEnd
                  ? " Renewal is cancelled; membership stays active until the end of the paid period."
                  : " Renews automatically until cancelled."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  disabled={busy}
                  onClick={manageBilling}
                  type="button"
                >
                  Manage billing
                </button>
                {status.subscription &&
                !status.subscription.cancelAtPeriodEnd ? (
                  <button
                    className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    disabled={busy}
                    onClick={cancelRenewal}
                    type="button"
                  >
                    Cancel renewal
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-1">
              Premium AI is available with your administrator access.
            </p>
          )}
        </div>
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-800"
          href="/ai-workspace"
        >
          Open AI Workspace
        </Link>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  const isStripeReady =
    status.billingProvider.provider === "stripe" &&
    status.billingProvider.ready;

  return (
    <div className="mt-8 space-y-5">
      {checkoutNotice ? (
        <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-sm leading-6 text-cyan-950">
          {checkoutNotice}
        </div>
      ) : null}
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <p className="font-semibold">
          {status.expiredVip ? "VIP expired" : "Free account"}
        </p>
        <p className="mt-1">
          Premium AI requires an active VIP membership. Default AI remains
          available.
        </p>
      </div>
      {isStripeReady ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-semibold text-slate-950">VIP Membership</p>
            {status.activePlan ? (
              <p className="font-semibold text-[#001736]">
                {formatAmount(
                  status.activePlan.amountMinor,
                  status.activePlan.currency
                )}{" "}
                / month
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Renews automatically until cancelled.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Payments are handled securely by Stripe. Card details are never
            entered or stored on this website.
          </p>
          <button
            className="mt-5 rounded-full bg-[#001736] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={startCheckout}
            type="button"
          >
            Subscribe
          </button>
        </div>
      ) : status.simulationEnabled ? (
        purchase?.status === "pending" ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-semibold text-slate-950">
              Local payment simulation
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              This development checkout has no card fields and no real payment
              provider.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-[#001736] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy}
                onClick={confirmCheckout}
                type="button"
              >
                Simulate successful payment
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="font-semibold text-slate-950">
              Premium AI membership
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
              Local payment simulation
            </p>
            <button
              className="mt-5 rounded-full bg-[#001736] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={startCheckout}
              type="button"
            >
              Start simulated checkout
            </button>
          </div>
        )
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-slate-950">VIP Membership</p>
          <p className="mt-2 text-sm text-slate-600">
            VIP membership is not available for purchase in this environment
            yet.
          </p>
        </div>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
