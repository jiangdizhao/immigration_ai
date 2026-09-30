import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { PremiumAnswerModeWorkspace } from "@/components/premium-answer-mode-workspace";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { workspaceGuestRedirectUrl } from "@/lib/policy-intelligence-product";
import { getPolicyWorkspaceReference } from "@/lib/policy-intelligence-server";

export default async function AIWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ policy?: string }>;
}) {
  const { policy } = await searchParams;
  if (!(await auth())?.user) {
    const redirectUrl = workspaceGuestRedirectUrl(policy ?? null);
    redirect(
      `/api/auth/guest?${new URLSearchParams({ redirectUrl }).toString()}`
    );
  }

  const policyReference = policy
    ? await getPolicyWorkspaceReference(policy)
    : null;

  return (
    <div className="min-h-dvh bg-[#f3f5f7] text-slate-900">
      <SiteHeader />
      <div className="min-h-[calc(100dvh-8rem)] pb-8">
        <PremiumAnswerModeWorkspace policyReference={policyReference} />
      </div>
      <SiteFooter />
    </div>
  );
}
