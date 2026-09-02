import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { LawyerPortalDetail } from "@/components/lawyer-portal-detail";
import { SiteHeader } from "@/components/site-header";
import { guestRegex } from "@/lib/constants";

export default function LawyerPortalRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <LawyerPortalRequestContent params={params} />
    </Suspense>
  );
}

async function LawyerPortalRequestContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      <main className="mx-auto max-w-4xl px-5 py-12 lg:px-8">
        <Link
          className="text-sm font-semibold text-sky-800 underline"
          href="/lawyer-portal"
        >
          Back to lawyer portal
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          Assigned request
        </h1>
        <LawyerPortalDetail id={(await params).id} />
      </main>
    </div>
  );
}
