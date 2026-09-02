import { requireLawyerStaff } from "@/lib/lawyer-requests/access";
import { listAssignedLawyerRequests } from "@/lib/lawyer-requests/service";

export async function GET() {
  const staff = await requireLawyerStaff();
  if (staff instanceof Response) {
    return staff;
  }
  const results =
    staff.role === "admin" ? [] : await listAssignedLawyerRequests(staff.id);
  return Response.json({
    requests: results.map(({ request, customerEmail }) => ({
      ...request,
      customerEmail,
    })),
  });
}
