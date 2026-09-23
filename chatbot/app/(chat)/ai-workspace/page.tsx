import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { PremiumAnswerModeWorkspace } from "@/components/premium-answer-mode-workspace";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default async function AIWorkspacePage() {
  if (!(await auth())?.user) {
    redirect("/api/auth/guest?redirectUrl=/ai-workspace");
  }

  return (
    <div className="min-h-dvh bg-[#f3f5f7] text-slate-900">
      <SiteHeader />
      <main className="min-h-[calc(100dvh-8rem)] pb-8">
        <PremiumAnswerModeWorkspace />
      </main>
      <SiteFooter />
    </div>
  );
}
