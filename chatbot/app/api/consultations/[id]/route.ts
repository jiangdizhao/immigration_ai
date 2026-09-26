import { z } from "zod";
import { requireConsultationCustomer } from "@/lib/consultations/access";
import { notifyConsultation } from "@/lib/consultations/notifications";
import { requireConsultationSchema } from "@/lib/consultations/schema-availability";
import {
  ConsultationDomainError,
  customerConsultationAction,
  getCustomerConsultation,
} from "@/lib/consultations/service";
import { customerActionSchema } from "@/lib/consultations/validation";
import { consultationRequestView } from "@/lib/consultations/views";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };
const uuid = z.string().uuid();

export async function GET(_request: Request, context: RouteContext) {
  const actor = await requireConsultationCustomer();
  if (actor instanceof Response) {
    return actor;
  }
  const unavailable = await requireConsultationSchema();
  if (unavailable) {
    return unavailable;
  }
  const id = (await context.params).id;
  if (!uuid.safeParse(id).success) {
    return Response.json(
      { error: "Invalid consultation ID." },
      { status: 400 }
    );
  }
  const record = await getCustomerConsultation(actor.id, id);
  if (!record) {
    return Response.json({ error: "Consultation not found." }, { status: 404 });
  }
  return Response.json(consultationRequestView(record));
}

export async function PATCH(request: Request, context: RouteContext) {
  const actor = await requireConsultationCustomer();
  if (actor instanceof Response) {
    return actor;
  }
  const unavailable = await requireConsultationSchema();
  if (unavailable) {
    return unavailable;
  }
  const id = (await context.params).id;
  if (!uuid.safeParse(id).success) {
    return Response.json(
      { error: "Invalid consultation ID." },
      { status: 400 }
    );
  }
  const parsed = customerActionSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid consultation action." },
      { status: 400 }
    );
  }
  try {
    const updated = await customerConsultationAction(
      actor,
      id,
      parsed.data.expectedRevision,
      parsed.data.action
    );
    const notificationKind = {
      confirm: "customer_confirmed",
      request_reschedule: "reschedule_requested",
      cancel: "customer_cancelled",
    } as const;
    await notifyConsultation(updated.id, notificationKind[parsed.data.action]);
    return Response.json(consultationRequestView(updated));
  } catch (error) {
    if (error instanceof ConsultationDomainError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
