import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { PremiumAnswerModeWorkspace } from "@/components/premium-answer-mode-workspace";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default async function AIWorkspacePage() {
  if (!(await auth())?.user) {
    redirect("/api/auth/guest?redirectUrl=/ai-workspace");
  }

  return (
    <div className="min-h-dvh bg-[#f8f9fa] text-slate-900">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden bg-[#001736] px-5 py-14 text-white lg:px-8">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "url('/images/sovereign-nexus/ai-orbital-bg.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,23,54,0.98),rgba(0,43,91,0.82),rgba(29,0,82,0.66))]" />
          <div className="relative mx-auto max-w-7xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
              AI legal workspace
            </p>
            <h1 className="mt-4 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              A full-screen migration intake desk with chat, facts, sources, and
              lawyer handoff.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200">
              This page is the product core. It reuses the existing backend
              bridges for Fast, Legal Check, and Premium, while giving the
              assistant enough space to behave like a serious legal-service
              interface.
            </p>
          </div>
        </section>

        <PremiumAnswerModeWorkspace />
      </main>
      <SiteFooter />
    </div>
  );
}
