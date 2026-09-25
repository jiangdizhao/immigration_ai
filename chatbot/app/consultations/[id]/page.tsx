import { Suspense } from "react";
import { ConsultationClient } from "@/components/consultation-client";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireVerifiedConsultationCustomer } from "@/lib/consultations/page-access";

export default function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#f3f5f7]" />}>
      <ConsultationDetailPageContent params={params} />
    </Suspense>
  );
}

async function ConsultationDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireVerifiedConsultationCustomer();
  const { id } = await params;
  return (
    <div className="min-h-dvh bg-[#f3f5f7]">
      <SiteHeader />
      <ConsultationClient id={id} mode="detail" />
      <SiteFooter />
    </div>
  );
}
