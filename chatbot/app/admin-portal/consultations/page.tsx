import { Suspense } from "react";
import { ConsultationStaffQueue } from "@/components/consultation-staff-workspace";
import { SiteHeader } from "@/components/site-header";
import { requireVerifiedConsultationStaffPage } from "@/lib/consultations/page-access";

export default function AdminConsultationQueuePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <AdminConsultationQueueContent />
    </Suspense>
  );
}

async function AdminConsultationQueueContent() {
  await requireVerifiedConsultationStaffPage(["admin"]);
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12 lg:px-8">
        <ConsultationStaffQueue actorRole="admin" />
      </main>
    </div>
  );
}
