import { z } from "zod";

import { fetchViaLegalServiceDispatcher } from "./server-http-timeouts";

const payloadSchema = z
  .object({
    answer: z.string(),
    response_language: z.string().nullish(),
    citations: z
      .array(
        z
          .object({
            title: z.string().nullish(),
            authority: z.string().nullish(),
            section_ref: z.string().nullish(),
            url: z.string().nullish(),
            quote_text: z.string().nullish(),
            source_id: z.string().nullish(),
            source_type: z.string().nullish(),
            used_for: z.string().nullish(),
          })
          .passthrough()
      )
      .nullish(),
    compact_sources: z.array(z.string()).nullish(),
    follow_up_questions: z.array(z.string()).nullish(),
    missing_facts: z.array(z.string()).nullish(),
    retrieval_debug: z.record(z.unknown()).nullish(),
  })
  .passthrough();

type Diagnostic = Record<string, string | number | boolean | null>;
type Result = { ok: true; data: z.infer<typeof payloadSchema> } | { ok: false };

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function allowed(value: unknown, values: string[]): string | null {
  return typeof value === "string" && values.includes(value) ? value : null;
}

function completionFields(data: z.infer<typeof payloadSchema>): Diagnostic {
  const debug = record(data.retrieval_debug);
  const runtime = record(
    debug.default_agent_runtime ?? debug.defaultAgentRuntime ?? debug
  );
  const terminal = record(runtime.terminal_recovery);
  const metrics = record(runtime.execution_metrics);
  const checker = record(runtime.checker);
  return {
    completion_status: allowed(terminal.completion_status, [
      "complete",
      "partial_timeout",
      "evidence_salvage",
      "safe_failure",
    ]),
    research_status: allowed(data.research_status, [
      "not_required",
      "complete",
      "incomplete",
    ]),
    terminal_recovery:
      typeof terminal.triggered === "boolean" ? terminal.triggered : null,
    checker_status: allowed(checker.status, [
      "not_required",
      "skipped",
      "completed",
      "failed",
    ]),
    provider_call_count:
      typeof metrics.provider_api_call_count === "number" &&
      Number.isFinite(metrics.provider_api_call_count)
        ? metrics.provider_api_call_count
        : null,
  };
}

// Never log bodies, URLs, exception messages/causes, prompts or auth headers.
export async function requestLegalService(
  params: {
    url: string;
    apiKey?: string;
    payload: Record<string, unknown>;
    requestId: string;
    timeoutMs: number;
  },
  dependencies: {
    fetch?: typeof fetch;
    log?: (event: Diagnostic) => void;
  } = {}
): Promise<Result> {
  // Default to the dedicated legal-service dispatcher so the extended
  // headers/body timeouts apply only to this call path; injected test
  // fetches are used unchanged.
  const fetcher = dependencies.fetch ?? fetchViaLegalServiceDispatcher;
  const log =
    dependencies.log ?? ((event) => console.info(JSON.stringify(event)));
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  let status: number | null = null;
  let contentType: string | null = null;
  let phase = "headers";
  const emit = (event: string, fields: Diagnostic = {}) =>
    log({
      event,
      request_id: params.requestId,
      http_status: status,
      elapsed_ms: Math.round(performance.now() - started),
      content_type: contentType,
      ...fields,
    });
  emit("legal_service_request_started");
  try {
    const response = await fetcher(params.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": params.requestId,
        ...(params.apiKey ? { "X-API-Key": params.apiKey } : {}),
      },
      body: JSON.stringify(params.payload),
      cache: "no-store",
      signal: controller.signal,
    });
    status = response.status;
    const rawContentType = response.headers.get("content-type") ?? "";
    contentType =
      allowed(rawContentType.split(";")[0].trim().toLowerCase(), [
        "application/json",
        "text/html",
        "text/plain",
        "application/problem+json",
      ]) ?? "other";
    if (!response.ok) {
      emit("legal_service_http_error");
      await response.body?.cancel();
      return { ok: false };
    }
    if (!rawContentType.toLowerCase().includes("application/json")) {
      emit("legal_service_non_json");
      await response.body?.cancel();
      return { ok: false };
    }
    phase = "body";
    const body = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      emit("legal_service_json_parse_error");
      return { ok: false };
    }
    const validated = payloadSchema.safeParse(parsed);
    if (!validated.success) {
      emit("legal_service_invalid_payload");
      return { ok: false };
    }
    if (!validated.data.answer.trim()) {
      emit("legal_service_empty_answer", completionFields(validated.data));
      return { ok: false };
    }
    emit("legal_service_response_received", completionFields(validated.data));
    return { ok: true, data: validated.data };
  } catch {
    emit(
      controller.signal.aborted
        ? "legal_service_abort_timeout"
        : "legal_service_connect_error",
      {
        timeout_layer: controller.signal.aborted
          ? "widget_legal_service"
          : null,
        transport_phase: phase,
      }
    );
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}
