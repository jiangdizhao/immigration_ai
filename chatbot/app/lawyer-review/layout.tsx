import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { reviewAccessDecision } from "@/app/api/lawyer-review/access";

export default async function LawyerReviewLayout({
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

  return children;
}
