import { ArrowRight, ClipboardCheck, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function LawyerReviewLandingPage() {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-14 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
          Lawyer workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Review centre
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Handle customer requests for human clarification separately from the
          internal AI-quality audit trail.
        </p>
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          <Link
            className="group rounded-3xl border border-sky-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-400"
            href="/lawyer-review/vip-requests"
          >
            <UserRoundCheck className="size-8 text-sky-700" />
            <h2 className="mt-5 text-xl font-semibold">VIP lawyer requests</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Review customer-submitted snapshots and record a confirmation,
              correction, or request for more information.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-sky-800">
              Open request queue{" "}
              <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
          <Link
            className="group rounded-3xl border border-violet-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400"
            href="/lawyer-review/ai-quality"
          >
            <ClipboardCheck className="size-8 text-violet-700" />
            <h2 className="mt-5 text-xl font-semibold">AI-quality audit</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Continue the existing Phase-7 review workflow for traces,
              evaluations, and quality feedback.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-violet-800">
              Open AI-quality audit{" "}
              <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
