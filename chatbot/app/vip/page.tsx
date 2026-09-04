import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { VipMembershipClient } from "@/components/vip-membership-client";
import { guestRegex } from "@/lib/constants";

export default function VipPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <VipPageContent />
    </Suspense>
  );
}

async function VipPageContent() {
  const session = await auth();
  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    redirect("/login");
  }

  return (
    <main className="min-h-dvh bg-slate-50 px-5 py-12 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[32px] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
            Membership
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#001736]">
            VIP Membership
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            VIP includes access to Premium AI mode for the active membership
            period. Membership renews monthly until cancelled, and payments are
            handled securely by Stripe-hosted checkout — card details are never
            entered or stored on this website.
          </p>
          <VipMembershipClient />
        </div>
      </div>
    </main>
  );
}
