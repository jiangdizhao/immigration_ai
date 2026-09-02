import { z } from "zod";
import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import {
  LawyerRequestDomainError,
  setManagedLawyerRole,
} from "@/lib/lawyer-requests/service";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

const bodySchema = z.object({ role: z.enum(["user", "lawyer"]) }).strict();

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireAdminUser();
  if (admin instanceof Response) {
    return admin;
  }
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid account ID." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Role must be user or lawyer." },
      { status: 400 }
    );
  }
  try {
    const updated = await setManagedLawyerRole({
      actor: admin,
      targetUserId: id,
      role: parsed.data.role,
    });
    return Response.json({
      id: updated.id,
      email: updated.email,
      role: updated.role,
      membershipTier: updated.membershipTier,
      emailVerifiedAt: updated.emailVerifiedAt,
    });
  } catch (error) {
    if (error instanceof LawyerRequestDomainError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
