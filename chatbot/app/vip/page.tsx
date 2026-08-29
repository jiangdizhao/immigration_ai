import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { VipMembershipClient } from "@/components/vip-membership-client";
import { guestRegex } from "@/lib/constants";

export default async function VipPage() {
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
            VIP includes access to Premium AI mode through the Premium service
            for the active membership period. This page uses a clearly marked
            local payment simulation and does not collect payment-card data.
          </p>
          <VipMembershipClient />
        </div>
      </div>
    </main>
  );
}
