import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { PremiumAnswerModeWorkspace } from "@/components/premium-answer-mode-workspace";
import { SiteHeader } from "@/components/site-header";
import { projectFoundationSchemaStatus } from "@/lib/db/project-foundation-schema-availability";
import type { PolicyLaunchRequestState } from "@/lib/policy-intelligence/conversation-policy-binding";
import {
  POLICY_SLUG_PATTERN,
  type PolicyWorkspaceReference,
  workspaceGuestRedirectUrl,
} from "@/lib/policy-intelligence-product";
import { getPolicyWorkspaceReference } from "@/lib/policy-intelligence-server";
import { projectChatWritesEnabled } from "@/lib/projects/chat-policy";
import {
  type ProjectFoundationSchemaState,
  resolvePersonalProjectCapability,
  resolveSchoolPreparationAvailability,
} from "@/lib/projects/personal-project-capability";
import { schoolAdmissionsEnabled } from "@/lib/school-admissions/contracts";
import { schoolApplicationsEnabled } from "@/lib/school-applications/contracts";

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

  /**
   * Phase 13 P1: personal Project availability is decided from the
   * server-authenticated session, the Project write capability and the additive
   * schema probe only. It never depends on VIP entitlement, a registered-customer
   * lookup or a client-supplied role. A failed probe is reported as an honest
   * unavailable state instead of silently hiding the whole Project surface.
   */
  let schemaStatus: ProjectFoundationSchemaState = "unknown";
  try {
    schemaStatus = await projectFoundationSchemaStatus();
  } catch {
    schemaStatus = "unknown";
  }
  const personalProject = resolvePersonalProjectCapability({
    role: session.user.role,
    schemaStatus,
    sessionType: session.user.type,
    userId: session.user.id,
    writesEnabled: projectChatWritesEnabled(),
  });

  /**
   * M5.1/M5.2 preparation is a separate capability layered on the Project
   * workspace. It stays registered-account private by the accepted M5 authority
   * contract, so guests and staff see a truthful restricted notice rather than a
   * silently missing panel. The API re-checks capability, schema and authority on
   * every request.
   */
  const schoolApplicationsFeature = schoolApplicationsEnabled();
  const schoolAdmissionsFeature = schoolAdmissionsEnabled();
  const schoolPreparation = resolveSchoolPreparationAvailability({
    admissionsEnabled: schoolAdmissionsFeature,
    applicationsEnabled: schoolApplicationsFeature,
    project: personalProject,
  });

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
          projectAvailability={personalProject.availability}
          requestedPolicySlug={requestedSlug}
          schoolAdmissionsEnabled={schoolPreparation.admissionsEnabled}
          schoolApplicationsEnabled={schoolPreparation.applicationsEnabled}
          schoolPreparationRestricted={schoolPreparation.restricted}
          temporaryGuestProject={personalProject.temporaryGuestProject}
        />
      </main>
    </div>
  );
}
