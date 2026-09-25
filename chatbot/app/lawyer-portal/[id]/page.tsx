import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { LawyerWorkspaceDetailShell } from "@/components/lawyer-workspace/page-shell";
import { LawyerWorkspaceDetail } from "@/components/lawyer-workspace-detail";
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
        <LawyerWorkspaceDetailShell />
        <LawyerWorkspaceDetail id={(await params).id} />
      </main>
    </div>
  );
}
