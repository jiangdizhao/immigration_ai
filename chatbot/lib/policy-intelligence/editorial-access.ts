import "server-only";

import { auth } from "@/app/(auth)/auth";
import { guestRegex } from "@/lib/constants";
import type { EditorialActorResolver } from "./editorial-api";

/**
 * Authenticated actor for the editorial API surface.
 *
 * Only the session identity is taken from the request context; the actor's
 * role and Policy Editor capability are always re-read from the database by
 * the service, so a forged actor or role can never be smuggled through a
 * request body.
 */
export async function requireEditorialActor(): Promise<
  { userId: string } | Response
> {
  const session = await auth();
  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  return { userId: session.user.id };
}

export const editorialActorResolver: EditorialActorResolver =
  requireEditorialActor;
