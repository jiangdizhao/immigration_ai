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
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-[#315d86] bg-white px-3 py-2.5"
      data-policy-availability={state.availability}
    >
      <p className="text-xs font-semibold text-slate-900">
        {copy.availability[state.availability]}
      </p>
      <p className="text-xs leading-5 text-slate-600">
        {copy.availabilityDescription[state.availability]}
      </p>
    </aside>
  );
}
