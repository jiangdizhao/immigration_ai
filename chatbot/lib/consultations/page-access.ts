import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
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
