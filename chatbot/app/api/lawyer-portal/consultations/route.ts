import { requireConsultationStaff } from "@/lib/consultations/access";
import { listLawyerConsultations } from "@/lib/consultations/service";
import { staffConsultationView } from "@/lib/consultations/views";

export async function GET() {
  const actor = await requireConsultationStaff(["lawyer"]);
  if (actor instanceof Response) {
    return actor;
  }
  const records = await listLawyerConsultations(actor.id);
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
