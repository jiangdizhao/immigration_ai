import { z } from "zod";
import { requireLawyerStaff } from "@/lib/lawyer-requests/access";
import { notifyLawyerRequest } from "@/lib/lawyer-requests/notifications";
import {
  getLawyerRequestNotificationTargets,
  getStaffLawyerRequest,
  LawyerRequestDomainError,
  updateStaffRequest,
} from "@/lib/lawyer-requests/service";
import { isLawyerClarificationStatus } from "@/lib/lawyer-requests/status";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

const updateSchema = z
  .object({
    status: z.string(),
    lawyerResponse: z.string().trim().max(8000).optional(),
    correctedAnswer: z.string().trim().max(12_000).optional(),
  })
  .strict();

export async function GET(_request: Request, context: RouteContext) {
  const staff = await requireLawyerStaff();
  if (staff instanceof Response) {
    return staff;
  }
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid request ID." }, { status: 400 });
  }
  const result = await getStaffLawyerRequest(id);
  if (!result) {
    return Response.json(
      { error: "Lawyer request not found." },
      { status: 404 }
    );
  }
  if (
    staff.role === "lawyer" &&
    result.request.assignedLawyerUserId !== staff.id
  ) {
    return Response.json(
      { error: "This request is not assigned to you." },
      { status: 403 }
    );
  }
  return Response.json({
    ...result.request,
    customerEmail: result.customerEmail,
    messages: result.messages,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const staff = await requireLawyerStaff();
  if (staff instanceof Response) {
    return staff;
  }
  const id = (await context.params).id;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid request ID." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isLawyerClarificationStatus(parsed.data.status)) {
    return Response.json(
      { error: "A valid request status is required." },
      { status: 400 }
    );
  }
  try {
    await updateStaffRequest({
      actor: staff,
      requestId: id,
      status: parsed.data.status,
      lawyerResponse: parsed.data.lawyerResponse,
      correctedAnswer: parsed.data.correctedAnswer,
    });
    const targets = await getLawyerRequestNotificationTargets(id);
    if (
      targets?.customerEmail &&
      (parsed.data.status === "confirmed" || parsed.data.status === "corrected")
    ) {
      await notifyLawyerRequest({
        email: targets.customerEmail,
        requestId: id,
        recipient: "customer",
        kind: "review_completed",
      });
    }
    if (
      targets?.customerEmail &&
      parsed.data.status === "needs_more_information"
    ) {
      await notifyLawyerRequest({
        email: targets.customerEmail,
        requestId: id,
        recipient: "customer",
        kind: "needs_more_information",
      });
    }
    const updated = await getStaffLawyerRequest(id);
    return Response.json({
      ...updated?.request,
      customerEmail: updated?.customerEmail,
      messages: updated?.messages ?? [],
    });
  } catch (error) {
    if (error instanceof LawyerRequestDomainError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
