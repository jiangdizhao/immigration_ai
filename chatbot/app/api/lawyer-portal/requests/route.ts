import { requireLawyerStaff } from "@/lib/lawyer-requests/access";
import { listAssignedLawyerRequests } from "@/lib/lawyer-requests/service";
import {
  type LawyerWorkspaceActor,
  lawyerQueueAccessForActor,
} from "@/lib/lawyer-workspace/access";
import { projectLawyerQueueItem } from "@/lib/lawyer-workspace/projection";
import { LAWYER_WORKSPACE_QUEUE_LIMIT } from "@/lib/lawyer-workspace/queue";

export async function GET() {
  const staff = await requireLawyerStaff();
  if (staff instanceof Response) {
    return staff;
  }
  const actor: LawyerWorkspaceActor = {
    authenticated: true,
    role: staff.role,
    id: staff.id,
  };
  const access = lawyerQueueAccessForActor(actor);
  if (!access.allowed) {
    return Response.json({ error: access.error }, { status: access.status });
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
