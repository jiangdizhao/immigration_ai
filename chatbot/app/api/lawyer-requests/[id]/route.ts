import { z } from "zod";
import { notifyLawyerRequest } from "@/lib/lawyer-requests/notifications";
import {
  addCustomerReply,
  getCustomerLawyerRequest,
  getLawyerRequestNotificationTargets,
  LawyerRequestDomainError,
} from "@/lib/lawyer-requests/service";
import { customerLawyerRequestView } from "@/lib/lawyer-requests/views";
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
  const result = await getCustomerLawyerRequest({
    id,
    userId: access.userId,
  });
  if (!result) {
    return Response.json(
      { error: "Lawyer request not found." },
      { status: 404 }
    );
  }
  return Response.json(
    customerLawyerRequestView(result.request, result.messages)
  );
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireRegisteredUser();
  if (access instanceof Response) {
    return access;
  }
  const id = await requestId(context);
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Invalid request ID." }, { status: 400 });
  }
  const payload = await request.json().catch(() => null);
  const body =
    payload && typeof payload === "object" && "body" in payload
      ? payload.body
      : null;
  if (typeof body !== "string") {
    return Response.json(
      { error: "A reply body is required." },
      { status: 400 }
    );
  }
  try {
    const result = await addCustomerReply({
      userId: access.userId,
      requestId: id,
      body,
    });
    const targets = await getLawyerRequestNotificationTargets(id);
    if (targets?.lawyerEmail) {
      await notifyLawyerRequest({
        email: targets.lawyerEmail,
        requestId: id,
        recipient: "lawyer",
        kind: "customer_replied",
      });
    }
    return Response.json(
      customerLawyerRequestView(
        result.request,
        result.message ? [result.message] : []
      )
    );
  } catch (error) {
    if (error instanceof LawyerRequestDomainError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
