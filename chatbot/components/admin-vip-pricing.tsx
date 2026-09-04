"use client";

import { useCallback, useEffect, useState } from "react";

import {
  formatMinorAmountAsAud,
  parsePriceInputToMinorUnits,
} from "@/lib/vip/billing/money";

type VipPlanPriceView = {
  id: string;
  amountMinor: number;
  currency: string;
  billingInterval: string;
  providerSyncStatus: string;
  createdAt: string;
};

export function AdminVipPricing() {
  const [price, setPrice] = useState<VipPlanPriceView | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/vip-billing/price");
    const data = (await response.json()) as {
      price?: VipPlanPriceView | null;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load the current price.");
    }
    setPrice(data.price ?? null);
  }, []);

  useEffect(() => {
    load().catch((error) =>
      setNotice(
        error instanceof Error ? error.message : "Unable to load the price."
      )
    );
  }, [load]);

  async function savePrice() {
    setNotice(null);

    const amountMinor = parsePriceInputToMinorUnits(amountInput);
    if (amountMinor === null) {
      setNotice(
        "Enter a positive dollar amount with at most two decimal places."
      );
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/vip-billing/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor }),
      });
      const data = (await response.json()) as {
        price?: VipPlanPriceView | null;
        error?: string;
      };
      if (!response.ok) {
        setNotice(data.error ?? "Unable to update the price.");
        return;
      }
      setPrice(data.price ?? null);
      setAmountInput("");
      setNotice("Monthly price saved.");
    } catch {
      setNotice("Unable to update the price.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">VIP monthly pricing</h2>
      <p className="mt-2 text-sm text-slate-600">
        Current price:{" "}
        <span className="font-semibold text-slate-900">
          {price
            ? `${formatMinorAmountAsAud(price.amountMinor)} / month`
            : "not set yet"}
        </span>
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-700" htmlFor="vip-monthly-price">
          New monthly price
        </label>
        <input
          className="w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm"
          id="vip-monthly-price"
          inputMode="decimal"
          onChange={(event) => setAmountInput(event.target.value)}
          placeholder="99.00"
          type="text"
          value={amountInput}
        />
        <button
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={saving}
          onClick={() => savePrice()}
          type="button"
        >
          {saving ? "Saving..." : "Save price"}
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Price changes apply to new subscriptions. Existing subscriptions are not
        automatically repriced.
      </p>
      {notice ? <p className="mt-3 text-sm text-slate-700">{notice}</p> : null}
    </section>
  );
}
