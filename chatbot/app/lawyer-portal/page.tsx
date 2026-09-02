import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { LawyerPortalQueue } from "@/components/lawyer-portal-queue";
import { SiteHeader } from "@/components/site-header";
import { guestRegex } from "@/lib/constants";

export default function LawyerPortalPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <LawyerPortalContent />
    </Suspense>
  );
}

async function LawyerPortalContent() {
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
          Customer workspace
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Staff service
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Lawyer portal
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Review only the customer requests assigned to you.
        </p>
        <div className="mt-8">
          <LawyerPortalQueue />
        </div>
      </main>
    </div>
  );
}
