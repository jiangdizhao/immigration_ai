import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import { listManageableLawyers } from "@/lib/lawyer-requests/service";

export async function GET() {
  const admin = await requireAdminUser();
  if (admin instanceof Response) {
    return admin;
  }
  const lawyers = await listManageableLawyers();
  return Response.json({
    users: lawyers.map(
      ({ id, email, role, membershipTier, emailVerifiedAt }) => ({
        id,
        email,
        role,
        membershipTier,
        emailVerifiedAt,
      })
    ),
  });
}
