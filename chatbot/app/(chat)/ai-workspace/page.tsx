import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { PremiumAnswerModeWorkspace } from "@/components/premium-answer-mode-workspace";
import { SiteHeader } from "@/components/site-header";
import { projectFoundationRepository } from "@/lib/db/project-foundation";
import type { PolicyLaunchRequestState } from "@/lib/policy-intelligence/conversation-policy-binding";
import {
  POLICY_SLUG_PATTERN,
  type PolicyWorkspaceReference,
  workspaceGuestRedirectUrl,
} from "@/lib/policy-intelligence-product";
import { getPolicyWorkspaceReference } from "@/lib/policy-intelligence-server";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import { schoolApplicationsEnabled } from "@/lib/school-applications/contracts";
import { canShowProjectWorkspace } from "@/lib/workspace/project-entry";

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

  const session = await auth();
  if (!session?.user) {
    const redirectUrl = workspaceGuestRedirectUrl(
      requestedSlug,
      launch ?? null,
      validChatId
    );
    redirect(
      `/api/auth/guest?${new URLSearchParams({ redirectUrl }).toString()}`
    );
  }

  let registeredCustomer = false;
  const projectChatWritesAvailable = projectChatWritesEnabled();
  if (session.user.type === "regular" && projectChatWritesAvailable) {
    try {
      registeredCustomer =
        await projectFoundationRepository.isRegisteredCustomer(session.user.id);
    } catch {
      registeredCustomer = false;
    }
  }
  const projectWorkspaceEnabled = canShowProjectWorkspace({
    writesEnabled: projectChatWritesAvailable,
    regularSession: session.user.type === "regular",
    registeredCustomer,
  });
  /**
   * Phase 13 M5.1 is a separate, default-OFF capability. It additionally requires
   * the Project workspace shell, because the surface lives inside it. The API
   * re-checks the capability and the schema on every request.
   */
  const schoolApplicationsAvailable =
    projectWorkspaceEnabled && schoolApplicationsEnabled();

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
          projectWorkspaceEnabled={projectWorkspaceEnabled}
          requestedPolicySlug={requestedSlug}
          schoolApplicationsEnabled={schoolApplicationsAvailable}
        />
      </main>
    </div>
  );
}
