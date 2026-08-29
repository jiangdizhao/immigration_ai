import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { LawyerRequestDetail } from "@/components/lawyer-request-detail";
import { SiteHeader } from "@/components/site-header";
import { guestRegex } from "@/lib/constants";

export default async function LawyerRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    redirect("/login");
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-12 lg:px-8">
        <Link
          className="text-sm font-semibold text-sky-800 underline"
          href="/lawyer-requests"
        >
          Back to lawyer requests
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          Lawyer request details
        </h1>
        <LawyerRequestDetail id={(await params).id} />
      </main>
    </div>
  );
}
