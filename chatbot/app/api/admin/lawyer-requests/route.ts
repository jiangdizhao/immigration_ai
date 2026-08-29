import { z } from "zod";
import { listLawyerClarificationRequestsForAdmin } from "@/lib/db/queries";
import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import {
  isLawyerClarificationStatus,
  LAWYER_CLARIFICATION_STATUSES,
} from "@/lib/lawyer-requests/status";

const statusSchema = z.enum(LAWYER_CLARIFICATION_STATUSES);

export async function GET(request: Request) {
  const admin = await requireAdminUser();
  if (admin instanceof Response) {
    return admin;
  }

  const value = new URL(request.url).searchParams.get("status");
  if (value && value !== "all" && !isLawyerClarificationStatus(value)) {
    return Response.json({ error: "Invalid request status." }, { status: 400 });
  }
  const status =
    value && value !== "all" ? statusSchema.parse(value) : undefined;
  const results = await listLawyerClarificationRequestsForAdmin({ status });
  return Response.json({
    requests: results.map(({ request: requestRecord, customerEmail }) => ({
      ...requestRecord,
      customerEmail,
    })),
  });
}
