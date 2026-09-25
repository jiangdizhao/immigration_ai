import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { LawyerWorkspaceQueue } from "@/components/lawyer-workspace-queue";
import { SiteHeader } from "@/components/site-header";
import { guestRegex } from "@/lib/constants";
import { getLawyerWorkspacePageCopy } from "@/lib/lawyer-workspace/page-copy";
import { getSiteLocaleFromCookie } from "@/lib/site-locale";

export default function LawyerPortalPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <LawyerPortalContent />
    </Suspense>
  );
}

async function LawyerPortalContent() {
  const cookieStore = await cookies();
  const copy = getLawyerWorkspacePageCopy(
    getSiteLocaleFromCookie(
      cookieStore
        .getAll()
        .map((item) => `${item.name}=${item.value}`)
        .join("; ")
    )
  );
  const session = await auth();

  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    redirect("/login");
  }
  if (session.user.role !== "lawyer") {
    redirect(session.user.role === "admin" ? "/admin-portal" : "/ai-workspace");
  }
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12 lg:px-8">
        <Link
          className="text-sm font-semibold text-sky-800 underline"
          href="/ai-workspace"
        >
          {copy.customerWorkspace}
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Staff service
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {copy.workspaceTitle}
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          {copy.workspaceSubtitle}
        </p>
        <div className="mt-8">
          <LawyerWorkspaceQueue />
        </div>
      </main>
    </div>
  );
}
