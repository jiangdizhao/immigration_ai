import { Suspense } from "react";
import { ConsultationClient } from "@/components/consultation-client";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireVerifiedConsultationCustomer } from "@/lib/consultations/page-access";

export default function NewConsultationPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#f3f5f7]" />}>
      <NewConsultationPageContent />
    </Suspense>
  );
}

async function NewConsultationPageContent() {
  await requireVerifiedConsultationCustomer();
  return (
    <div className="min-h-dvh bg-[#f3f5f7]">
      <SiteHeader />
      <ConsultationClient mode="new" />
      <SiteFooter />
    </div>
  );
}
