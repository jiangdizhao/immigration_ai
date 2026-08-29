import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { reviewAccessDecision } from "@/app/api/lawyer-review/access";

export default function LawyerReviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50" />}>
      <LawyerReviewLayoutContent>{children}</LawyerReviewLayoutContent>
    </Suspense>
  );
}

async function LawyerReviewLayoutContent({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const access = reviewAccessDecision(session);

  if (access === "unauthenticated") {
    redirect("/login");
  }

  if (access === "forbidden") {
    redirect("/ai-workspace");
  }

  return <>{children}</>;
}
