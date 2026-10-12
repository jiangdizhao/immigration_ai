import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { PremiumAnswerModeWorkspace } from "@/components/premium-answer-mode-workspace";
import { SiteHeader } from "@/components/site-header";
import type { PolicyLaunchRequestState } from "@/lib/policy-intelligence/conversation-policy-binding";
import {
  POLICY_SLUG_PATTERN,
  type PolicyWorkspaceReference,
  workspaceGuestRedirectUrl,
} from "@/lib/policy-intelligence-product";
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
  // A `policy` parameter without the launch intent is not a policy entry, but a
  // well-formed slug is still carried through so a reload of a policy
  // conversation keeps its topic parameter.
  const requestedSlug =
    policy && POLICY_SLUG_PATTERN.test(policy) ? policy : null;
  const policyLaunchRequested = Boolean(
    requestedSlug && isPolicyEntry && launch === "policy" && !validChatId
  );

  if (!(await auth())?.user) {
    const redirectUrl = workspaceGuestRedirectUrl(
      requestedSlug,
      launch ?? null,
      validChatId
    );
    redirect(
      `/api/auth/guest?${new URLSearchParams({ redirectUrl }).toString()}`
    );
  }

  /**
   * Phase 12 Stage 2: a policy launch either resolves the published topic or
   * reports an explicit, recoverable launch state. It must never silently
   * downgrade into an unrelated historical conversation or an apparently
   * successful generic blank chat.
   */
  let policyReference: PolicyWorkspaceReference | null = null;
  let policyLaunchState: PolicyLaunchRequestState = "resolved";
  if (requestedSlug && isPolicyEntry) {
    policyReference = await getPolicyWorkspaceReference(requestedSlug);
    if (!policyReference) {
      policyLaunchState = "unavailable";
    }
  }

  return (
    <div className="min-h-dvh bg-[#f3f5f7] text-slate-900 xl:flex xl:h-dvh xl:flex-col xl:overflow-hidden">
      <SiteHeader />
      <main className="min-h-[calc(100dvh-72px)] xl:min-h-0 xl:flex-1 xl:overflow-hidden">
        <PremiumAnswerModeWorkspace
          initialChatId={validChatId}
          policyLaunch={policyLaunchRequested}
          policyLaunchState={policyLaunchState}
          policyReference={policyReference}
          requestedPolicySlug={requestedSlug}
        />
      </main>
    </div>
  );
}
