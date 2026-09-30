"use client";

import type { PolicyProductAvailability } from "@/lib/policy-intelligence-product";
import { getPolicyProductCopy } from "@/lib/policy-intelligence-product-copy";
import { useSiteLocale } from "./site-locale-provider";

export function PolicyIntelligenceAvailabilityNotice({
  state,
}: {
  state: { availability: PolicyProductAvailability };
}) {
  const { locale } = useSiteLocale();
  const copy = getPolicyProductCopy(locale);
  return (
    <aside
      className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"
      data-policy-availability={state.availability}
    >
      <p className="font-semibold text-slate-900">
        {copy.availability[state.availability]}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {copy.availabilityDescription[state.availability]}
      </p>
    </aside>
  );
}
