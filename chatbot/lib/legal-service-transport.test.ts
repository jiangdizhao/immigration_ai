import assert from "node:assert/strict";
import test from "node:test";
import { requestLegalService } from "./legal-service-transport";

const params = {
  url: "http://test/api/v1/query",
  apiKey: "secret-sentinel",
  payload: { question: "private-question-sentinel" },
  requestId: "e96c3912-50ce-4f23-917e-2d4368d4e72c",
  timeoutMs: 1000,
};

for (const [name, response, event] of [
  [
    "4xx",
    () => new Response("private-body-sentinel", { status: 422 }),
    "legal_service_http_error",
  ],
  [
    "rate limit",
    () => new Response("private-body-sentinel", { status: 429 }),
    "legal_service_http_error",
  ],
  [
    "5xx",
    () => new Response("private-body-sentinel", { status: 503 }),
    "legal_service_http_error",
  ],
  [
    "HTML",
    () =>
      new Response("private-body-sentinel", {
        headers: { "content-type": "text/html" },
      }),
    "legal_service_non_json",
  ],
  [
    "malformed JSON",
    () =>
      new Response("private-body-sentinel", {
        headers: { "content-type": "application/json" },
      }),
    "legal_service_json_parse_error",
  ],
  [
    "empty body",
    () => new Response("", { headers: { "content-type": "application/json" } }),
    "legal_service_json_parse_error",
  ],
  ["null payload", () => Response.json(null), "legal_service_invalid_payload"],
  ["missing answer", () => Response.json({}), "legal_service_invalid_payload"],
  [
    "wrong citation shape",
    () => Response.json({ answer: "hello", citations: "bad" }),
    "legal_service_invalid_payload",
  ],
  [
    "empty answer",
    () => Response.json({ answer: " \n" }),
    "legal_service_empty_answer",
  ],
] as const) {
  test(name, async () => {
    const logs: unknown[] = [];
    const result = await requestLegalService(params, {
      fetch: (() => Promise.resolve(response())) as typeof fetch,
      log: (e) => logs.push(e),
    });
    assert.equal(result.ok, false);
    assert.equal((logs.at(-1) as { event: string }).event, event);
    assert.doesNotMatch(JSON.stringify(logs), /private-|secret-sentinel/);
  });
}

test("connection errors do not log exception contents", async () => {
  const logs: unknown[] = [];
  await requestLegalService(params, {
    fetch: (() => Promise.reject(new Error("secret-sentinel"))) as typeof fetch,
    log: (e) => logs.push(e),
  });
  assert.equal(
    (logs.at(-1) as { event: string }).event,
    "legal_service_connect_error"
  );
  assert.doesNotMatch(JSON.stringify(logs), /secret-sentinel/);
});

for (const phase of ["headers", "body"]) {
  test(`timeout covers ${phase}`, async () => {
    const logs: unknown[] = [];
    const fetcher = ((_url, init) => {
      if (phase === "headers") {
        return new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("private-abort"))
          )
        );
      }
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () =>
                controller.error(new Error("private-abort"))
              );
            },
          }),
          { headers: { "content-type": "application/json" } }
        )
      );
    }) as typeof fetch;
    assert.equal(
      (
        await requestLegalService(
          { ...params, timeoutMs: 10 },
          { fetch: fetcher, log: (e) => logs.push(e) }
        )
      ).ok,
      false
    );
    assert.equal(
      (logs.at(-1) as { event: string }).event,
      "legal_service_abort_timeout"
    );
    assert.doesNotMatch(JSON.stringify(logs), /private-abort/);
  });
}

test("partial terminal answer and citations survive byte-for-byte with correlation", async () => {
  const answer = " Useful partial answer.\n";
  const data = {
    answer,
    citations: [{ title: "Source", url: "https://example.org/source" }],
    research_status: "incomplete",
    retrieval_debug: {
      terminal_recovery: {
        completion_status: "partial_timeout",
        triggered: true,
      },
      execution_metrics: { provider_api_call_count: 2 },
    },
  };
  const logs: unknown[] = [];
  const result = await requestLegalService(params, {
    fetch: ((_url, init) => {
      assert.equal(
        (init?.headers as Record<string, string>)["X-Request-ID"],
        params.requestId
      );
      return Promise.resolve(Response.json(data));
    }) as typeof fetch,
    log: (e) => logs.push(e),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, data);
  }
  assert.equal(
    (logs.at(-1) as { completion_status: string }).completion_status,
    "partial_timeout"
  );
  assert.doesNotMatch(
    JSON.stringify(logs),
    /Useful partial answer|example.org|private-question|secret-sentinel/
  );
});
