import { auth } from "@/app/(auth)/auth";
import { guestRegex } from "@/lib/constants";
import { getUserEntitlementById } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function requireRegisteredUser() {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  if (
    session.user.type === "guest" ||
    guestRegex.test(session.user.email ?? "")
  ) {
    return Response.json(
      {
        error: "A registered account is required for VIP membership.",
        loginPath: "/login",
        registerPath: "/register",
      },
      { status: 401 }
    );
  }

  const entitlement = await getUserEntitlementById(session.user.id);
  if (!entitlement) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  return { session, userId: session.user.id, entitlement };
}
