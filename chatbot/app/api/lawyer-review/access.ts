import { guestRegex } from "@/lib/constants";

const REVIEW_ASSERTION_SECRET = process.env.LAWYER_REVIEW_ASSERTION_SECRET;

export type ReviewSession = {
  user?: {
    email?: string | null;
    role?: string;
  };
} | null;

export function reviewAccessDecision(session: ReviewSession) {
  if (!session?.user || guestRegex.test(session.user.email ?? "")) {
    return "unauthenticated" as const;
  }
  return session.user.role === "admin"
    ? ("allowed" as const)
    : ("forbidden" as const);
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export function reviewAuthorizationResponse(session: ReviewSession) {
  const decision = reviewAccessDecision(session);
  if (decision === "unauthenticated") {
    return jsonError("Authentication required for lawyer-review", 401);
  }
  if (decision === "forbidden") {
    return jsonError("Administrator access required for lawyer-review", 403);
  }
  return null;
}

export function trustedAssertionHeaders(
  assertionSecret = REVIEW_ASSERTION_SECRET
): Record<string, string> {
  if (!assertionSecret) {
    return {};
  }
  return { "X-Lawyer-Review-Assertion": assertionSecret };
}
