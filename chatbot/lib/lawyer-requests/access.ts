import "server-only";

import { auth } from "@/app/(auth)/auth";
import { guestRegex } from "@/lib/constants";

export type StaffRole = "lawyer" | "admin";

export type StaffActor = {
  id: string;
  email?: string | null;
  role: StaffRole;
};

export async function requireLawyerStaff() {
  const session = await auth();
  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  if (session.user.role !== "lawyer" && session.user.role !== "admin") {
    return Response.json({ error: "Lawyer access required." }, { status: 403 });
  }
  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
  } satisfies StaffActor;
}
