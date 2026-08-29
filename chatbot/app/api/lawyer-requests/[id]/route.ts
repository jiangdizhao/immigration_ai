import { z } from "zod";
import { getLawyerClarificationRequestForUser } from "@/lib/db/queries";
import { requireRegisteredUser } from "@/lib/vip/access";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function requestId(context: RouteContext) {
  return (await context.params).id;
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }
  const id = await requestId(context);
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid request ID." }, { status: 400 });
  }
  const requestRecord = await getLawyerClarificationRequestForUser({
    id,
    userId: access.userId,
  });
  if (!requestRecord) {
    return Response.json(
      { error: "Lawyer request not found." },
      { status: 404 }
    );
  }
  return Response.json(requestRecord);
}
