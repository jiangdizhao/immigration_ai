const REVIEW_TOKEN = process.env.LAWYER_REVIEW_TOKEN;

function isAuthorized(request: Request) {
  if (!REVIEW_TOKEN && process.env.NODE_ENV !== "production") {
    return true;
  }
  const provided = request.headers.get("x-review-token") ?? "";
  return Boolean(REVIEW_TOKEN) && provided === REVIEW_TOKEN;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function legalFetch(path: string, init: RequestInit = {}) {
  const legalServiceUrl = process.env.LEGAL_SERVICE_URL ?? "http://127.0.0.1:8000";
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
      { error: "legal-service review API failed", status: response.status, body },
      { status: response.status }
    );
  }
  return Response.json(body);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return jsonError("Unauthorized lawyer-review request", 401);
  }
  const url = new URL(request.url);
  const matterId = url.searchParams.get("matterId");
  const status = url.searchParams.get("status") ?? "unreviewed";
  const limit = url.searchParams.get("limit") ?? "50";
  const offset = url.searchParams.get("offset") ?? "0";

  if (matterId) {
    return legalFetch(`/api/v1/review/matters/${encodeURIComponent(matterId)}`);
  }
  return legalFetch(`/api/v1/review/queue?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return jsonError("Unauthorized lawyer-review request", 401);
  }
  const body = await request.json();
  const traceId = String(body.traceId ?? "").trim();
  if (!traceId) {
    return jsonError("traceId is required", 400);
  }
  const { traceId: _traceId, ...payload } = body;
  return legalFetch(`/api/v1/review/traces/${encodeURIComponent(traceId)}/reviews`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return jsonError("Unauthorized lawyer-review request", 401);
  }
  const body = await request.json();
  const reviewId = String(body.reviewId ?? "").trim();
  if (!reviewId) {
    return jsonError("reviewId is required", 400);
  }
  const { reviewId: _reviewId, ...payload } = body;
  return legalFetch(`/api/v1/review/reviews/${encodeURIComponent(reviewId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
