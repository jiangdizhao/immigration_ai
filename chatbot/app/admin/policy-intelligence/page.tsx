import { Suspense } from "react";
import { AdminPolicyCompatibility } from "@/components/admin-policy-compatibility";
import { AdminPolicyEditors } from "@/components/admin-policy-editors";
import { AdminPolicyIntelligence } from "@/components/admin-policy-intelligence";
import { AdminPolicySyncRuns } from "@/components/admin-policy-sync-runs";
import { SiteHeader } from "@/components/site-header";
import { requireVerifiedConsultationStaffPage } from "@/lib/consultations/page-access";
import { adminPolicyIntelligenceService } from "@/lib/policy-intelligence/admin-service";
import { policyEditorialService } from "@/lib/policy-intelligence/editorial-runtime";

export default function AdminPolicyIntelligencePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <AdminPolicyIntelligenceContent />
    </Suspense>
  );
}

async function AdminPolicyIntelligenceContent() {
  await requireVerifiedConsultationStaffPage(["admin"]);
  const [items, sourceSyncRuns, grants, compatibilityEntries] =
    await Promise.all([
      adminPolicyIntelligenceService.listItems(),
      adminPolicyIntelligenceService.listSourceSyncRuns(),
      policyEditorialService.listPolicyEditorGrants(),
      adminPolicyIntelligenceService.listCompatibilityEntries(),
    ]);

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Administration
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Policy Intelligence
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          The Admin account is the firm&apos;s principal lawyer and holds full
          Policy Intelligence editorial authority: publishing, overriding,
          archiving, restoring and official-URL submission are permitted here
          and in the Policy Editor workspace. Other staff gain the same
          editorial capabilities through an explicit Policy Editor grant (a
          verified lawyer with an active grant); ordinary users never do. Every
          capability change, publication, override, archive and restore is
          audited.
        </p>
        <div className="mt-8">
          <AdminPolicyEditors initialGrants={grants} />
          <div className="mt-8">
            <AdminPolicyIntelligence initialItems={items} />
          </div>
          <div className="mt-8">
            <AdminPolicyCompatibility entries={compatibilityEntries} />
          </div>
          <div className="mt-8">
            <AdminPolicySyncRuns runs={sourceSyncRuns} />
          </div>
        </div>
      </main>
    </div>
  );
}
