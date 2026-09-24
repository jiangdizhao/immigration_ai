import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { ClientPortal } from "@/components/client-portal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { clientPortalRedirectForRole } from "@/lib/client-portal/access";
import { guestRegex } from "@/lib/constants";

export default function ClientPortalPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#f3f5f7]" />}>
      <ClientPortalPageContent />
    </Suspense>
  );
}

async function ClientPortalPageContent() {
  const session = await auth();
  if (
    !session?.user ||
    session.user.type === "guest" ||
    guestRegex.test(session.user.email ?? "")
  ) {
    redirect("/login");
  }
  const staffRoute = clientPortalRedirectForRole(session.user.role);
  if (staffRoute) {
    redirect(staffRoute);
  }

  return (
    <div className="min-h-dvh bg-[#f3f5f7] text-slate-950">
      <SiteHeader />
      <ClientPortal />
      <SiteFooter />
    </div>
  );
}
