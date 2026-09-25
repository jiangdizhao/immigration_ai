import { requireLawyerStaff } from "@/lib/lawyer-requests/access";
import { listAssignedLawyerRequests } from "@/lib/lawyer-requests/service";
import { projectLawyerQueueItem } from "@/lib/lawyer-workspace/projection";
import { LAWYER_WORKSPACE_QUEUE_LIMIT } from "@/lib/lawyer-workspace/queue";

export async function GET() {
  const staff = await requireLawyerStaff();
  if (staff instanceof Response) {
    return staff;
  }
  if (staff.role !== "lawyer") {
    return Response.json({ requests: [] });
  }
  const results = await listAssignedLawyerRequests(staff.id);
  const requests = results
    .slice(0, LAWYER_WORKSPACE_QUEUE_LIMIT)
    .map(({ request, customerEmail }) =>
      projectLawyerQueueItem(request, customerEmail)
    )
    .filter((item) => item !== null);
  return Response.json({ requests });
}
