"use client";

import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { useSiteLocale } from "@/components/site-locale-provider";
import { getConsultationStaffCopy } from "@/lib/consultations/staff-copy";

export function ConsultationStaffNavigation({
  actorRole,
  variant,
}: {
  actorRole: "admin" | "lawyer";
  variant: "card" | "inline";
}) {
  const { locale } = useSiteLocale();
  const copy = getConsultationStaffCopy(locale);
  const href =
    actorRole === "admin"
      ? "/admin-portal/consultations"
      : "/lawyer-portal/consultations";

  if (variant === "card") {
    return (
      <Link
        className="group rounded-3xl border border-amber-200 bg-amber-50/50 p-6 transition hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-50"
        href={href}
      >
        <CalendarClock className="size-7 text-amber-700" />
        <h2 className="mt-5 text-xl font-semibold">{copy.schedulingLabel}</h2>
        <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
          {copy.schedulingDescription}
        </p>
        <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-amber-900">
          {copy.schedulingLabel}
          <span aria-hidden="true">→</span>
        </span>
      </Link>
    );
  }

  return (
    <nav
      aria-label={copy.schedulingLabel}
      className="mt-5 flex flex-wrap items-center gap-2 text-sm"
    >
      <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-600">
        {copy.reviewLabel}
      </span>
      <span aria-hidden="true" className="text-slate-400">
        /
      </span>
      <Link
        className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
        href={href}
      >
        {copy.schedulingLabel}
      </Link>
      <span className="basis-full text-xs text-slate-500">
        {copy.schedulingDescription}
      </span>
    </nav>
  );
}
