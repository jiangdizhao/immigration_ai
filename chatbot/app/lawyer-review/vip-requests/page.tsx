import { SiteHeader } from "@/components/site-header";
import { VipRequestQueue } from "@/components/vip-request-queue";

export default function VipRequestsPage() {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Human review
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          VIP lawyer requests
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Review the customer-owned snapshot and record a human disposition.
          This queue is separate from the Phase-7 AI-quality audit.
        </p>
        <div className="mt-8">
          <VipRequestQueue />
        </div>
      </main>
    </div>
  );
}
