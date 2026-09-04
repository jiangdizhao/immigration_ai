import { z } from "zod";
import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import { classifyAdminLawyerRequestPatch } from "@/lib/lawyer-requests/admin-update";
import { attemptLearningBridge } from "@/lib/lawyer-requests/learning-bridge";
import { runLearningBridgeFailNeutral } from "@/lib/lawyer-requests/learning-bridge-policy";
import { notifyLawyerRequest } from "@/lib/lawyer-requests/notifications";
import {
  assignLawyer,
  getLawyerRequestNotificationTargets,
  getLearningBridge,
  getStaffLawyerRequest,
  LawyerRequestDomainError,
  updateStaffRequest,
} from "@/lib/lawyer-requests/service";
import { isLawyerClarificationStatus } from "@/lib/lawyer-requests/status";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

const updateSchema = z
  .object({
    status: z.string().optional(),
    lawyerResponse: z.string().trim().max(8000).optional(),
    correctedAnswer: z.string().trim().max(12_000).optional(),
    assignedLawyerUserId: z.string().uuid().nullable().optional(),
    preferredReasoningOrResearchApproach: z
      .string()
      .trim()
      .max(8000)
      .optional(),
    createReasoningLessonCandidate: z.boolean().optional(),
  })
  .strict();

export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireAdminUser();
  if (admin instanceof Response) {
    return admin;
  }
  const id = (await context.params).id;
  const result = await getStaffLawyerRequest(id);
  if (!result) {
    return Response.json(
      { error: "Lawyer request not found." },
      { status: 404 }
    );
  }
  return Response.json({
    ...result.request,
    customerEmail: result.customerEmail,
    messages: result.messages,
    learningBridge: await getLearningBridge(id),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireAdminUser();
  if (admin instanceof Response) {
    return admin;
  }
  const id = (await context.params).id;
  const current = await getStaffLawyerRequest(id);
  if (!current) {
    return Response.json(
      { error: "Lawyer request not found." },
      { status: 404 }
    );
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid lawyer request update." },
      { status: 400 }
    );
  }
  if (classifyAdminLawyerRequestPatch(parsed.data) === "mixed") {
    return Response.json(
      {
        error: "Assignment and review updates must be submitted separately.",
      },
      { status: 400 }
    );
  }
  if (
    parsed.data.status !== undefined &&
    !isLawyerClarificationStatus(parsed.data.status)
  ) {
    return Response.json({ error: "Invalid request status." }, { status: 400 });
  }
  try {
    if (parsed.data.assignedLawyerUserId !== undefined) {
      await assignLawyer({
        actor: admin,
        requestId: id,
        assignedLawyerUserId: parsed.data.assignedLawyerUserId,
      });
      const targets = await getLawyerRequestNotificationTargets(id);
      if (targets?.lawyerEmail) {
        await notifyLawyerRequest({
          email: targets.lawyerEmail,
          requestId: id,
          recipient: "lawyer",
          kind: "request_assigned",
        });
      }
    }
    if (parsed.data.status !== undefined) {
      await updateStaffRequest({
        actor: admin,
        requestId: id,
        status: parsed.data.status,
        lawyerResponse: parsed.data.lawyerResponse,
        correctedAnswer: parsed.data.correctedAnswer,
        preferredReasoningOrResearchApproach:
          parsed.data.preferredReasoningOrResearchApproach,
        createReasoningLessonCandidate:
          parsed.data.createReasoningLessonCandidate,
      });
      if (
        parsed.data.status === "confirmed" ||
        parsed.data.status === "corrected"
      ) {
        await runLearningBridgeFailNeutral(
          () => attemptLearningBridge(id),
          () =>
            console.error(
              "Phase-8 learning bridge failed after lawyer result finalization"
            )
        );
      }
      const targets = await getLawyerRequestNotificationTargets(id);
      if (
        targets?.customerEmail &&
        (parsed.data.status === "confirmed" ||
          parsed.data.status === "corrected")
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
    }
    const updated = await getStaffLawyerRequest(id);
    return Response.json({
      ...updated?.request,
      customerEmail: updated?.customerEmail,
      messages: updated?.messages ?? [],
      learningBridge: await getLearningBridge(id),
    });
  } catch (error) {
    if (error instanceof LawyerRequestDomainError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
