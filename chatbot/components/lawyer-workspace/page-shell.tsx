"use client";

import Link from "next/link";
import { useSiteLocale } from "@/components/site-locale-provider";
import { getLawyerWorkspacePageCopy } from "@/lib/lawyer-workspace/page-copy";

export function LawyerWorkspaceQueueShell() {
  const { locale } = useSiteLocale();
  const copy = getLawyerWorkspacePageCopy(locale);
  return (
    <>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
        {copy.staffService}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {copy.workspaceTitle}
      </h1>
      <p className="mt-3 max-w-2xl text-slate-600">{copy.workspaceSubtitle}</p>
    </>
  );
}

export function LawyerWorkspaceDetailShell() {
  const { locale } = useSiteLocale();
  const copy = getLawyerWorkspacePageCopy(locale);
  return (
    <>
      <Link
        className="text-sm font-semibold text-sky-800 underline"
        href="/lawyer-portal"
      >
        {copy.backToWorkspace}
      </Link>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">
        {copy.assignedRequest}
      </h1>
    </>
  );
}
