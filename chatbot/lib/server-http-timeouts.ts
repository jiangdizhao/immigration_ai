import { Agent, type Dispatcher, fetch as undiciFetch } from "undici";

/**
 * Budget used by the widget's AbortController when calling legal-service
 * (see app/api/widget-chat/route.ts and lib/legal-service-transport.ts).
 * Single source of truth shared with the legal-service transport.
 */
export const LEGAL_SERVICE_TIMEOUT_MS = 370_000;

/** Short transport budget for the speed-first Fast Luna lane. */
export const FAST_LEGAL_SERVICE_TIMEOUT_MS = 50_000;

/**
 * Undici dispatcher timeouts dedicated to Next.js -> legal-service traffic.
 *
 * Node's built-in `fetch` (undici) aborts a request when response headers
 * have not arrived within the active dispatcher's `headersTimeout`
 * (`bodyTimeout` is an analogous idle guard between body reads; neither is a
 * total-request deadline). The production failure boundary is the response
 * HEADERS: legal-service performs a long synchronous logical turn before it
 * returns the JSON HTTP response, so headers may not arrive until the turn
 * finishes. Undici's process-wide default `headersTimeout` is 300 seconds,
 * while the Default backend legitimately runs up to its 360-second absolute
 * turn deadline (DEFAULT_TURN_DEADLINE_MS=360000) plus final response
 * assembly. A 300-second boundary therefore killed the request before the
 * 370-second widget AbortController could fire.
 *
 * This module owns a dedicated, module-scoped `Agent` reused across requests
 * (never created per request, never installed as the process-global
 * dispatcher). It waits slightly longer than the widget AbortController
 * budget (and stays below the 400-second ALB idle timeout on the
 * browser-to-chatbot path). Every outgoing call remains bounded by its own
 * AbortController, and all other server-side fetches (Stripe, auth, SES,
 * etc.) keep undici's default behavior.
 *
 * Precision note: undici enforces headers/body timeouts with low-resolution
 * "fast timers" (~1 s resolution, ±500 ms). That is immaterial at the
 * production 370/380 s scale but means scaled tests must use boundary values
 * of at least ~1 second.
 */
export const LEGAL_SERVICE_DISPATCHER_TIMEOUT_MS =
  LEGAL_SERVICE_TIMEOUT_MS + 10_000;

const legalServiceDispatcher = new Agent({
  headersTimeout: LEGAL_SERVICE_DISPATCHER_TIMEOUT_MS,
  bodyTimeout: LEGAL_SERVICE_DISPATCHER_TIMEOUT_MS,
});

/** The dedicated legal-service dispatcher (distinct from the global one). */
export function getLegalServiceDispatcher(): Dispatcher {
  return legalServiceDispatcher;
}

type DispatcherFetchInit = RequestInit & { dispatcher?: Dispatcher };

/**
 * Fetch bound to the dedicated legal-service dispatcher. Drop-in compatible
 * with the global `fetch` signature used by `requestLegalService`. Uses
 * undici's own fetch implementation with a per-call dispatcher, so no global
 * dispatcher state is touched and Next.js's patched global fetch is bypassed.
 */
export function fetchViaLegalServiceDispatcher(
  url: string | URL,
  init: DispatcherFetchInit = {}
): Promise<Response> {
  // undici's bundled RequestInit type diverges slightly from the DOM type
  // (e.g. ReadableStream bodies), so cast through the runtime-compatible shape.
  const undiciFetchImpl = undiciFetch as unknown as (
    url: string | URL,
    init: Record<string, unknown>
  ) => Promise<Response>;
  return undiciFetchImpl(url, {
    ...init,
    dispatcher: legalServiceDispatcher,
  }) as unknown as Promise<Response>;
}

/** Release the dispatcher's pooled sockets (e.g. graceful shutdown). */
export async function closeLegalServiceDispatcher(): Promise<void> {
  await legalServiceDispatcher.close();
}
