import { z } from "zod";
import {
  getLawyerClarificationRequestForAdmin,
  updateLawyerClarificationRequest,
} from "@/lib/db/queries";
import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import {
  isLawyerClarificationStatus,
  validateLawyerClarificationUpdate,
} from "@/lib/lawyer-requests/status";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

const updateSchema = z
  .object({
    status: z.string(),
    lawyerResponse: z.string().trim().max(8000).optional(),
    correctedAnswer: z.string().trim().max(12_000).optional(),
  })
  .strict();

export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireAdminUser();
  if (admin instanceof Response) {
    return admin;
  }
  const id = (await context.params).id;
  const result = await getLawyerClarificationRequestForAdmin(id);
  if (!result) {
    return Response.json(
      { error: "Lawyer request not found." },
      { status: 404 }
    );
  }
  return Response.json({
    ...result.request,
    customerEmail: result.customerEmail,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireAdminUser();
  if (admin instanceof Response) {
    return admin;
  }
  const id = (await context.params).id;
  const current = await getLawyerClarificationRequestForAdmin(id);
  if (!current) {
    return Response.json(
      { error: "Lawyer request not found." },
      { status: 404 }
    );
  }
  if (current.request.status === "closed") {
    return Response.json(
      { error: "Closed lawyer requests cannot be modified." },
      { status: 409 }
    );
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isLawyerClarificationStatus(parsed.data.status)) {
    return Response.json(
      { error: "A valid status is required." },
      { status: 400 }
    );
  }

  const lawyerResponse =
    parsed.data.lawyerResponse ?? current.request.lawyerResponse;
  const correctedAnswer =
    parsed.data.correctedAnswer ?? current.request.correctedAnswer;
  const update = {
    status: parsed.data.status,
    lawyerResponse,
    correctedAnswer,
  } as const;
  const validationError = validateLawyerClarificationUpdate(
    current.request,
    update
  );
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const now = new Date();
  const substantive =
    parsed.data.status === "confirmed" ||
    parsed.data.status === "corrected" ||
    parsed.data.status === "needs_more_information";
  const updated = await updateLawyerClarificationRequest({
    id,
    expectedStatus: current.request.status,
    values: {
      status: parsed.data.status,
      reviewerUserId: admin.id,
      ...(parsed.data.lawyerResponse !== undefined ? { lawyerResponse } : {}),
      ...(parsed.data.correctedAnswer !== undefined ? { correctedAnswer } : {}),
      ...(substantive ? { reviewedAt: now } : {}),
      ...(parsed.data.status === "closed" ? { closedAt: now } : {}),
      updatedAt: now,
    },
  });
  if (!updated) {
    return Response.json(
      { error: "Request changed; reload and try again." },
      { status: 409 }
    );
  }
  return Response.json(updated);
}
