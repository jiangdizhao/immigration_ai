import { Suspense } from "react";
import { ConsultationStaffDetail } from "@/components/consultation-staff-workspace";
import { SiteHeader } from "@/components/site-header";
import { requireVerifiedConsultationStaffPage } from "@/lib/consultations/page-access";

export default function LawyerConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <LawyerConsultationDetailContent params={params} />
    </Suspense>
  );
}

async function LawyerConsultationDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireVerifiedConsultationStaffPage(["lawyer"]);
  const { id } = await params;
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-12 lg:px-8">
        <ConsultationStaffDetail actorRole="lawyer" id={id} />
      </main>
    </div>
  );
}
