import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { LawyerWorkspaceQueueShell } from "@/components/lawyer-workspace/page-shell";
import { LawyerWorkspaceQueue } from "@/components/lawyer-workspace-queue";
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
        <LawyerWorkspaceQueueShell />
        <div className="mt-8">
          <LawyerWorkspaceQueue />
        </div>
      </main>
    </div>
  );
}
