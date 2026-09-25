import { auth } from "@/app/(auth)/auth";
import { guestRegex } from "@/lib/constants";
import { getConsultationUserIdentity } from "@/lib/db/queries";
import { customerAccessForIdentity } from "./access-policy";

export type ConsultationActor = {
  id: string;
  role: "customer" | "lawyer" | "admin";
};
export async function requireConsultationCustomer() {
  const session = await auth();
  if (!session?.user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const identity = await getConsultationUserIdentity(session.user.id);
  const access = customerAccessForIdentity(identity);
  if (!access.allowed) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  return { id: identity.id, role: "customer" } satisfies ConsultationActor;
}

export async function requireConsultationStaff(
  allowed: Array<"lawyer" | "admin">
) {
  const session = await auth();
  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const identity = await getConsultationUserIdentity(session.user.id);
  if (!identity || guestRegex.test(identity.email)) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const role = identity.role;
  if ((role !== "lawyer" && role !== "admin") || role !== session.user.role) {
    return Response.json({ error: "Staff access required." }, { status: 403 });
  }
  if (!identity.emailVerifiedAt || !allowed.includes(role)) {
    return Response.json({ error: "Access denied." }, { status: 403 });
  }
  return { id: identity.id, role } satisfies ConsultationActor;
}
