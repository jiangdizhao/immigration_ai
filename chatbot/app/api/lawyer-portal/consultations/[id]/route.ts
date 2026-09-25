import { z } from "zod";
import { requireConsultationStaff } from "@/lib/consultations/access";
import {
  ConsultationDomainError,
  cancelConsultation,
  completeConsultation,
  getLawyerConsultation,
  proposeConsultation,
} from "@/lib/consultations/service";
import { lawyerActionSchema } from "@/lib/consultations/validation";
import { staffConsultationView } from "@/lib/consultations/views";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };
const uuid = z.string().uuid();

export async function GET(_request: Request, context: RouteContext) {
  const actor = await requireConsultationStaff(["lawyer"]);
  if (actor instanceof Response) {
    return actor;
  }
  const id = (await context.params).id;
  if (!uuid.safeParse(id).success) {
    return Response.json(
      { error: "Invalid consultation ID." },
      { status: 400 }
    );
  }
  const result = await getLawyerConsultation(actor.id, id);
  if (!result) {
    return Response.json({ error: "Consultation not found." }, { status: 404 });
  }
  const {
    request: record,
    customerId,
    customerEmail,
    lawyerId,
    lawyerEmail,
  } = result;
  return Response.json(
    staffConsultationView(
      record,
      { id: customerId, email: customerEmail },
      lawyerId && lawyerEmail ? { id: lawyerId, email: lawyerEmail } : null
    )
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const actor = await requireConsultationStaff(["lawyer"]);
  if (actor instanceof Response) {
    return actor;
  }
  const id = (await context.params).id;
  if (!uuid.safeParse(id).success) {
    return Response.json(
      { error: "Invalid consultation ID." },
      { status: 400 }
    );
  }
  const parsed = lawyerActionSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid consultation action." },
      { status: 400 }
    );
  }
  try {
    const result =
      parsed.data.action === "propose"
        ? await proposeConsultation(actor, id, parsed.data.expectedRevision, {
            startAt: new Date(parsed.data.startAt),
            endAt: new Date(parsed.data.endAt),
            scheduledMethod: parsed.data.scheduledMethod,
            meetingInstructions: parsed.data.meetingInstructions,
          })
        : parsed.data.action === "cancel"
          ? await cancelConsultation(actor, id, parsed.data.expectedRevision)
          : await completeConsultation(actor, id, parsed.data.expectedRevision);
    const full = await getLawyerConsultation(actor.id, result.id);
    if (!full) {
      return Response.json(
        { error: "Consultation not found." },
        { status: 404 }
      );
    }
    const {
      request: record,
      customerId,
      customerEmail,
      lawyerId,
      lawyerEmail,
    } = full;
    return Response.json(
      staffConsultationView(
        record,
        { id: customerId, email: customerEmail },
        lawyerId && lawyerEmail ? { id: lawyerId, email: lawyerEmail } : null
      )
    );
  } catch (error) {
    if (error instanceof ConsultationDomainError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
