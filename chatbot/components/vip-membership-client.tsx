"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type VipStatus = {
  role: "user" | "admin";
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

  const cancelCheckout = async () => {
    if (!purchase?.purchaseId && !purchase?.id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vip/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: purchase.purchaseId ?? purchase.id,
          providerPaymentId: purchase.providerPaymentId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to cancel checkout.");
      }
      setPurchase(data.purchase as Purchase);
    } catch (cancellationError) {
      setError(
        cancellationError instanceof Error
          ? cancellationError.message
          : "Unable to cancel checkout."
      );
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <p className="mt-8 text-sm text-slate-500">
        Loading membership status...
      </p>
    );
  }

  if (status.role === "admin") {
    return (
      <div className="mt-8 rounded-3xl border border-cyan-200 bg-cyan-50 p-5 text-sm leading-6 text-cyan-950">
        <p className="font-semibold">Administrator access</p>
        <p className="mt-1">
          Administrators may test Premium AI through a separate admin override.
          This does not create VIP membership or a payment record.
        </p>
      </div>
    );
  }

  if (status.activeVip) {
    return (
      <div className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950">
        <p className="font-semibold">Active VIP membership</p>
        <p className="mt-1">
          VIP access is active until {formatDate(status.vipExpiresAt)}.
        </p>
        <Link
          className="mt-4 inline-block font-semibold underline"
          href="/ai-workspace"
        >
          Open AI Workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <p className="font-semibold">
          {status.expiredVip ? "VIP expired" : "Free account"}
        </p>
        <p className="mt-1">
          Premium AI requires an active VIP membership. Default AI remains
          available.
        </p>
      </div>
      {purchase?.status === "pending" ? (
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
            <button
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
              disabled={busy}
              onClick={cancelCheckout}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : purchase ? (
        <p className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          Simulated payment status:{" "}
          <span className="font-semibold">{purchase.status}</span>
        </p>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-semibold text-slate-950">
              Premium AI membership
            </p>
            {status.product ? (
              <p className="font-semibold text-[#001736]">
                {formatAmount(
                  status.product.amountMinor,
                  status.product.currency
                )}
              </p>
            ) : null}
          </div>
          {status.product ? (
            <p className="mt-1 text-sm text-slate-600">
              Duration: {status.product.durationDays} days
            </p>
          ) : null}
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
            Local payment simulation
          </p>
          <button
            className="mt-5 rounded-full bg-[#001736] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy || !status.simulationEnabled}
            onClick={startCheckout}
            type="button"
          >
            Start simulated checkout
          </button>
          {status.simulationEnabled ? null : (
            <p className="mt-3 text-sm text-amber-700">
              Simulation is disabled in this environment.
            </p>
          )}
        </div>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
