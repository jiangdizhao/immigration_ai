import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { LawyerWorkspaceQueueShell } from "@/components/lawyer-workspace/page-shell";
import { LawyerWorkspaceQueue } from "@/components/lawyer-workspace-queue";
import { SiteHeader } from "@/components/site-header";
import { StaffProjectReviewWorkspace } from "@/components/staff-project-review-workspace";
import { guestRegex } from "@/lib/constants";
import { DEFAULT_SITE_LOCALE } from "@/lib/site-locale";
import { getWorkspaceCopy } from "@/lib/workspace-copy";

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
        {/**
         * Phase 13 M9-B: the Project review workspace lives inside the existing lawyer
         * portal rather than a second portal. It shows only assignments this lawyer's own
         * M4-002 records authorize and never returns protected customer content.
         */}
        <div className="mt-8">
          <StaffProjectReviewWorkspace
            copy={getWorkspaceCopy(DEFAULT_SITE_LOCALE).staffWorkspace}
          />
        </div>
        <div className="mt-8">
          <LawyerWorkspaceQueue />
        </div>
      </main>
    </div>
  );
}
