import { cookies } from "next/headers";
import { authorizeClientPortalIdentity } from "@/lib/client-portal/access";
import {
  buildClientPortalView,
  ClientPortalRoleError,
} from "@/lib/client-portal/service";
import { normalizeSiteLocale } from "@/lib/site-locale";
import { requireRegisteredUser } from "@/lib/vip/access";

export async function GET() {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }
  const decision = authorizeClientPortalIdentity({
    type: access.session.user.type,
    role: access.entitlement.role,
    email: access.session.user.email,
  });
  if (!decision.allowed) {
    return Response.json(
      { error: "Customer portal access is required." },
      {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
  try {
    const cookieStore = await cookies();
    const locale = normalizeSiteLocale(cookieStore.get("site-locale")?.value);
    const view = await buildClientPortalView(
      { userId: access.userId, email: access.session.user.email ?? "" },
      locale
    );
    return Response.json(view, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ClientPortalRoleError) {
      return Response.json(
        { error: "Customer portal access is required." },
        {
          status: 403,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
    }
    throw error;
  }
}
