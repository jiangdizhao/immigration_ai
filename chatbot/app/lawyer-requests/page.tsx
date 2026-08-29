import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { LawyerRequestHistory } from "@/components/lawyer-request-history";
import { SiteHeader } from "@/components/site-header";
import { guestRegex } from "@/lib/constants";

export default async function LawyerRequestsPage() {
  const session = await auth();
  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    redirect("/login");
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Human review
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Lawyer review requests
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Review requests are tied to the exact saved AI answer you selected. A
          human lawyer may confirm it, provide a correction, or ask for more
          information.
        </p>
        <div className="mt-8">
          <LawyerRequestHistory />
        </div>
      </main>
    </div>
  );
}
