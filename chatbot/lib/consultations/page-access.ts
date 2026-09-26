import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { guestRegex } from "@/lib/constants";
import { getConsultationUserIdentity } from "@/lib/db/queries";
import { customerAccessForIdentity } from "./access-policy";

export async function requireVerifiedConsultationCustomer() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const identity = await getConsultationUserIdentity(session.user.id);
  const decision = customerAccessForIdentity(identity);
  if (!decision.allowed) {
    redirect(decision.status === 401 ? "/login" : "/client-portal");
  }
}

export async function requireVerifiedConsultationStaffPage(
  allowed: Array<"admin" | "lawyer">
) {
  const session = await auth();
  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    redirect("/login");
  }
  const identity = await getConsultationUserIdentity(session.user.id);
  if (!identity || guestRegex.test(identity.email)) {
    redirect("/login");
  }
  if (identity.role !== session.user.role) {
    redirect(
      identity.role === "admin"
        ? "/admin-portal"
        : identity.role === "lawyer"
          ? "/lawyer-portal"
          : "/ai-workspace"
    );
  }
  if (!identity.emailVerifiedAt) {
    redirect("/login");
  }
  if (
    (identity.role !== "admin" && identity.role !== "lawyer") ||
    !allowed.includes(identity.role)
  ) {
    redirect(
      identity.role === "admin"
        ? "/admin-portal"
        : identity.role === "lawyer"
          ? "/lawyer-portal"
          : "/ai-workspace"
    );
  }
}
