import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { PremiumAnswerModeWorkspace } from "@/components/premium-answer-mode-workspace";
import { SiteHeader } from "@/components/site-header";
import { workspaceGuestRedirectUrl } from "@/lib/policy-intelligence-product";
import { getPolicyWorkspaceReference } from "@/lib/policy-intelligence-server";

export default async function AIWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ policy?: string; launch?: string; chatId?: string }>;
}) {
  const { policy, launch, chatId } = await searchParams;
  const validChatId =
    chatId && /^[0-9a-f-]{36}$/iu.test(chatId) ? chatId : null;
  const isPolicyEntry = launch === "policy" || Boolean(validChatId);
  if (policy && !isPolicyEntry) {
    redirect(
      validChatId ? `/ai-workspace?chatId=${validChatId}` : "/ai-workspace"
    );
  }
  if (!(await auth())?.user) {
    const redirectUrl = workspaceGuestRedirectUrl(
      policy ?? null,
      launch ?? null,
      validChatId
    );
    redirect(
      `/api/auth/guest?${new URLSearchParams({ redirectUrl }).toString()}`
    );
  }

  const policyReference =
    policy && isPolicyEntry ? await getPolicyWorkspaceReference(policy) : null;
  if (policy && isPolicyEntry && !policyReference) {
    redirect(
      validChatId ? `/ai-workspace?chatId=${validChatId}` : "/ai-workspace"
    );
  }
  const policyLaunch = Boolean(
    policyReference && launch === "policy" && !validChatId
  );

  return (
    <div className="min-h-dvh bg-[#f3f5f7] text-slate-900 xl:flex xl:h-dvh xl:flex-col xl:overflow-hidden">
      <SiteHeader />
      <main className="min-h-[calc(100dvh-72px)] xl:min-h-0 xl:flex-1 xl:overflow-hidden">
        <PremiumAnswerModeWorkspace
          initialChatId={validChatId}
          policyLaunch={policyLaunch}
          policyReference={policyReference}
        />
      </main>
    </div>
  );
}
