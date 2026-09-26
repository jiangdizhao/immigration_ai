import { Suspense } from "react";
import { ConsultationStaffDetail } from "@/components/consultation-staff-workspace";
import { SiteHeader } from "@/components/site-header";
import { requireVerifiedConsultationStaffPage } from "@/lib/consultations/page-access";

export default function AdminConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <AdminConsultationDetailContent params={params} />
    </Suspense>
  );
}

async function AdminConsultationDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireVerifiedConsultationStaffPage(["admin"]);
  const { id } = await params;
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-12 lg:px-8">
        <ConsultationStaffDetail actorRole="admin" id={id} />
      </main>
    </div>
  );
}
