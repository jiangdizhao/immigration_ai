import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  Agent,
  getGlobalDispatcher,
  setGlobalDispatcher,
  fetch as undiciFetch,
} from "undici";

import { requestLegalService } from "./legal-service-transport";
import {
  getLegalServiceDispatcher,
  LEGAL_SERVICE_DISPATCHER_TIMEOUT_MS,
  LEGAL_SERVICE_TIMEOUT_MS,
} from "./server-http-timeouts";

type Diagnostic = Record<string, unknown>;

const REQUEST_ID = "e96c3912-50ce-4f23-917e-2d4368d4e72c";

/**
 * Local HTTP server that answers any request with JSON after `delayMs`.
 * Scaled stand-in for the production "long synchronous turn before response
 * headers" boundary: hundreds of milliseconds instead of hundreds of seconds.
 */
async function startDelayedJsonServer(delayMs: number, payload: unknown) {
  const server = http.createServer((request, response) => {
    request.on("error", () => {
      /* ignore sockets aborted by test cleanup */
    });
    response.on("error", () => {
      /* ignore sockets aborted by test cleanup */
    });
    setTimeout(() => {
      if (response.writableEnded || response.destroyed) {
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    }, delayMs);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not report a port");
  }
  return {
    url: `http://127.0.0.1:${address.port}/api/v1/query`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      (
        server as unknown as { closeAllConnections?: () => void }
      ).closeAllConnections?.();
    },
  };
}

function scopedFetchWith(dispatcher: Agent): typeof fetch {
  const boundUndiciFetch = undiciFetch as unknown as typeof fetch;
  return ((url: string | URL, init?: RequestInit) =>
    boundUndiciFetch(url, {
      ...init,
      dispatcher,
    } as RequestInit)) as typeof fetch;
}

test("constants keep the intended boundary ordering", () => {
  assert.equal(LEGAL_SERVICE_TIMEOUT_MS, 370_000);
  assert.equal(LEGAL_SERVICE_DISPATCHER_TIMEOUT_MS, 380_000);
  assert.ok(LEGAL_SERVICE_DISPATCHER_TIMEOUT_MS > LEGAL_SERVICE_TIMEOUT_MS);
});

test("legal-service dispatcher is dedicated, not the process global", () => {
  assert.notEqual(getLegalServiceDispatcher(), getGlobalDispatcher());
});

test("scoped dispatcher outlives a shorter global dispatcher (scaled)", async () => {
  // Scaled proxy: undici enforces dispatcher timeouts with ~1s-resolution fast
  // timers, so the "short global" boundary is 1000 ms against a 2000 ms server
  // delay (production scale: 300 s global default vs 380 s legal dispatcher
  // against a 360 s backend turn).
  const { url, close } = await startDelayedJsonServer(2000, {
    answer: "scoped-ok",
  });
  const scopedShortAgent = new Agent({
    headersTimeout: 1000,
    bodyTimeout: 1000,
  });
  const originalGlobal = getGlobalDispatcher();
  const shortGlobalAgent = new Agent({
    headersTimeout: 1000,
    bodyTimeout: 1000,
  });
  const logs: Diagnostic[] = [];
  try {
    setGlobalDispatcher(shortGlobalAgent);

    // Ordinary global-fetch traffic hits the global boundary first.
    await assert.rejects(fetch(url, { method: "POST" }), (error: unknown) => {
      assert.ok(error instanceof Error);
      return true;
    });

    // The dedicated per-call dispatcher overrides the global boundary for an
    // explicitly scoped (here: 1000 ms) legal-service fetch. The transport
    // never rejects; it classifies the transport failure as ok:false with a
    // content-free diagnostic (the signal is not aborted, so this is not an
    // AbortController timeout).
    const scopedShortResult = await requestLegalService(
      {
        url,
        payload: { question: "timing-probe" },
        requestId: REQUEST_ID,
        timeoutMs: 5000,
      },
      {
        fetch: scopedFetchWith(scopedShortAgent),
        log: (event) => logs.push(event),
      }
    );
    assert.equal(scopedShortResult.ok, false);
    const scopedShortEvent = logs.at(-1) as Record<string, unknown>;
    assert.equal(scopedShortEvent.event, "legal_service_connect_error");

    // Production path: the module-scoped 380 s dispatcher ignores the 1000 ms
    // global boundary and the request succeeds after the server delay, well
    // inside its 5000 ms AbortController.
    const viaProduction = await requestLegalService(
      {
        url,
        payload: { question: "timing-probe" },
        requestId: REQUEST_ID,
        timeoutMs: 5000,
      },
      { log: (event) => logs.push(event) }
    );
    assert.equal(viaProduction.ok, true);
    if (viaProduction.ok) {
      assert.equal(viaProduction.data.answer, "scoped-ok");
    }
  } finally {
    // Never leave global state modified between tests.
    setGlobalDispatcher(originalGlobal);
    await Promise.allSettled([
      shortGlobalAgent.close(),
      scopedShortAgent.close(),
    ]);
    await close();
  }
  assert.doesNotMatch(JSON.stringify(logs), /timing-probe|scoped-ok/);
});

test("widget AbortController fires before the scoped dispatcher timeout", async () => {
  const { url, close } = await startDelayedJsonServer(3000, {
    answer: "too-late",
  });
  const logs: Diagnostic[] = [];
  const started = performance.now();
  try {
    const result = await requestLegalService(
      {
        url,
        payload: { question: "timing-probe" },
        requestId: REQUEST_ID,
        timeoutMs: 300,
      },
      { log: (event) => logs.push(event) }
    );
    assert.equal(result.ok, false);
    const last = logs.at(-1) as Record<string, unknown>;
    assert.equal(last.event, "legal_service_abort_timeout");
    assert.equal(last.timeout_layer, "widget_legal_service");
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 2000, `abort took ${elapsed}ms`);
    assert.doesNotMatch(JSON.stringify(logs), /timing-probe|too-late/);
  } finally {
    await close();
  }
});

test("successful legal-service response through the dedicated dispatcher", async () => {
  const { url, close } = await startDelayedJsonServer(100, {
    answer: "prompt answer",
    research_status: "not_required",
  });
  const logs: Diagnostic[] = [];
  try {
    const result = await requestLegalService(
      {
        url,
        payload: { question: "timing-probe" },
        requestId: REQUEST_ID,
        timeoutMs: 5000,
      },
      { log: (event) => logs.push(event) }
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.answer, "prompt answer");
      assert.equal(result.data.research_status, "not_required");
    }
    const last = logs.at(-1) as Record<string, unknown>;
    assert.equal(last.event, "legal_service_response_received");
    assert.doesNotMatch(JSON.stringify(logs), /timing-probe|prompt answer/);
  } finally {
    await close();
  }
});
