import "server-only";

import { auth } from "@/app/(auth)/auth";
import { guestRegex } from "@/lib/constants";

export async function requireAdminUser() {
  const session = await auth();
  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  if (session.user.role !== "admin") {
    return Response.json(
      { error: "Administrator access required." },
      { status: 403 }
    );
  }
  return session.user;
}
