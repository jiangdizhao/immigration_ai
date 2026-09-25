import { requireConsultationStaff } from "@/lib/consultations/access";
import { requireConsultationSchema } from "@/lib/consultations/schema-availability";
import { listAdminConsultations } from "@/lib/consultations/service";
import { staffConsultationView } from "@/lib/consultations/views";

export async function GET() {
  const actor = await requireConsultationStaff(["admin"]);
  if (actor instanceof Response) {
    return actor;
  }
  const unavailable = await requireConsultationSchema();
  if (unavailable) {
    return unavailable;
  }
  const records = await listAdminConsultations();
  return Response.json({
    consultations: records.map(
      ({ request, customerId, customerEmail, lawyerId, lawyerEmail }) =>
        staffConsultationView(
          request,
          { id: customerId, email: customerEmail },
          lawyerId && lawyerEmail ? { id: lawyerId, email: lawyerEmail } : null
        )
    ),
  });
}
