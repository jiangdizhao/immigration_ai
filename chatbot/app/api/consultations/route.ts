import { requireConsultationCustomer } from "@/lib/consultations/access";
import { notifyConsultation } from "@/lib/consultations/notifications";
import { requireConsultationSchema } from "@/lib/consultations/schema-availability";
import {
  ConsultationDomainError,
  createConsultation,
  listCustomerConsultations,
} from "@/lib/consultations/service";
import {
  createConsultationSchema,
  validateCreateInput,
} from "@/lib/consultations/validation";
import { consultationRequestView } from "@/lib/consultations/views";

export async function GET() {
  const actor = await requireConsultationCustomer();
  if (actor instanceof Response) {
    return actor;
  }
  const unavailable = await requireConsultationSchema();
  if (unavailable) {
    return unavailable;
  }
  const records = await listCustomerConsultations(actor.id);
  return Response.json({
    consultations: await Promise.all(
      records.map((record) => consultationRequestView(record))
    ),
  });
}

export async function POST(request: Request) {
  const actor = await requireConsultationCustomer();
  if (actor instanceof Response) {
    return actor;
  }
  const unavailable = await requireConsultationSchema();
  if (unavailable) {
    return unavailable;
  }
  const parsed = createConsultationSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid consultation request." },
      { status: 400 }
    );
  }
  const validation = validateCreateInput(parsed.data);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }
  try {
    const record = await createConsultation(actor, validation.data);
    await notifyConsultation(record.id, "request_created");
    return Response.json(consultationRequestView(record), { status: 201 });
  } catch (error) {
    if (error instanceof ConsultationDomainError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
