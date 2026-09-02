import { z } from "zod";
import {
  LawyerRequestDomainError,
  markCustomerViewed,
} from "@/lib/lawyer-requests/service";
import { requireRegisteredUser } from "@/lib/vip/access";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

export async function POST(_request: Request, context: RouteContext) {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid request ID." }, { status: 400 });
  }
  try {
    const updated = await markCustomerViewed({
      userId: access.userId,
      requestId: id,
    });
    return Response.json({
      customerLastViewedAt: updated.customerLastViewedAt,
    });
  } catch (error) {
    if (error instanceof LawyerRequestDomainError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
