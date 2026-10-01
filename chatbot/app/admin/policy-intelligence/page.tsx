import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AdminPolicyIntelligence } from "@/components/admin-policy-intelligence";
import { adminPolicyIntelligenceService } from "@/lib/policy-intelligence/admin-service";
import { requireVerifiedConsultationStaffPage } from "@/lib/consultations/page-access";

export default function AdminPolicyIntelligencePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <AdminPolicyIntelligenceContent />
    </Suspense>
  );
}

async function AdminPolicyIntelligenceContent() {
  await requireVerifiedConsultationStaffPage(["admin"]);
  const items = await adminPolicyIntelligenceService.listItems();

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
          Archive items that should no longer appear publicly, or restore an
          archived item to its current verified publication when available.
        </p>
        <div className="mt-8">
          <AdminPolicyIntelligence initialItems={items} />
        </div>
      </main>
    </div>
  );
}
