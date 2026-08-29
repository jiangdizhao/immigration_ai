import { auth } from "@/app/(auth)/auth";
import { reviewAuthorizationResponse, trustedAssertionHeaders } from "./access";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function authorizeReviewRequest() {
  return reviewAuthorizationResponse(await auth());
}

async function legalFetch(path: string, init: RequestInit = {}) {
  const legalServiceUrl =
    process.env.LEGAL_SERVICE_URL ?? "http://127.0.0.1:8000";
  const apiKey = process.env.LEGAL_SERVICE_API_KEY;
  const response = await fetch(`${legalServiceUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    return Response.json(
      {
        error: "legal-service review API failed",
        status: response.status,
        body,
      },
      { status: response.status }
    );
  }
  return Response.json(body);
}

export async function GET(request: Request) {
  const denied = await authorizeReviewRequest();
  if (denied) {
    return denied;
  }
  const url = new URL(request.url);
  const matterId = url.searchParams.get("matterId");
  const conversations = url.searchParams.get("conversations");
  const status = url.searchParams.get("status") ?? "unreviewed";
  const limit = url.searchParams.get("limit") ?? "50";
  const offset = url.searchParams.get("offset") ?? "0";

  if (matterId) {
    return legalFetch(`/api/v1/review/matters/${encodeURIComponent(matterId)}`);
  }
  if (conversations === "true") {
    return legalFetch(
      `/api/v1/review/conversations?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
    );
  }
  return legalFetch(
    `/api/v1/review/queue?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
  );
}

export async function POST(request: Request) {
  const denied = await authorizeReviewRequest();
  if (denied) {
    return denied;
  }
  const body = await request.json();
  const traceId = String(body.traceId ?? "").trim();
  if (!traceId) {
    return jsonError("traceId is required", 400);
  }
  const {
    traceId: _traceId,
    review_provenance: _reviewProvenance,
    provenance: _provenance,
    trusted_provenance: _trustedProvenance,
    ...clientPayload
  } = body;
  const payload = {
    ...clientPayload,
  };
  return legalFetch(
    `/api/v1/review/traces/${encodeURIComponent(traceId)}/reviews`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: trustedAssertionHeaders(),
    }
  );
}

export async function PATCH(request: Request) {
  const denied = await authorizeReviewRequest();
  if (denied) {
    return denied;
  }
  const body = await request.json();
  const reviewId = String(body.reviewId ?? "").trim();
  if (!reviewId) {
    return jsonError("reviewId is required", 400);
  }
  const {
    reviewId: _reviewId,
    review_provenance: _reviewProvenance,
    provenance: _provenance,
    trusted_provenance: _trustedProvenance,
    ...clientPayload
  } = body;
  const payload = {
    ...clientPayload,
  };
  return legalFetch(`/api/v1/review/reviews/${encodeURIComponent(reviewId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    headers: trustedAssertionHeaders(),
  });
}
