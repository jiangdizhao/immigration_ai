import { ArrowRight, BriefcaseBusiness, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { SiteHeader } from "@/components/site-header";
import { guestRegex } from "@/lib/constants";

export default async function AdminPortalPage() {
  const session = await auth();

  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    redirect("/login");
  }

  if (session.user.role !== "admin") {
    redirect("/ai-workspace");
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Administration
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Admin portal
          </h1>
          <p className="mt-3 text-slate-600">
            Choose the environment you want to enter with your administrator
            access.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <Link
              className="group rounded-3xl border border-slate-200 bg-slate-50 p-6 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50"
              href="/ai-workspace"
            >
              <BriefcaseBusiness className="size-7 text-cyan-700" />
              <h2 className="mt-5 text-xl font-semibold">Customer Website</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
                Use the normal customer AI workspace for functional testing.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-cyan-800">
                Enter customer website
                <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
            <Link
              className="group rounded-3xl border border-slate-200 bg-slate-50 p-6 transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50"
              href="/lawyer-review"
            >
              <ClipboardCheck className="size-7 text-violet-700" />
              <h2 className="mt-5 text-xl font-semibold">Lawyer Audit</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
                Review AI conversations, traces, and lawyer feedback.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-violet-800">
                Enter lawyer audit
                <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
