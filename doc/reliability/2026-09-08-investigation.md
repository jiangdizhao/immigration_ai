# Default reliability investigation — 8 September 2026

## Pre-change root-cause report

Source: clean `phase9-vip-subscription-billing`, HEAD `cd33a189fd1d3c61d61baafdedaa6a75e4c28a3a`. Read AGENTS.md and the 8 September Phase-9 handoff. Stable SHA `a9a8c3a29d59ec3e3a586e2a2d58d90a59804467`; recovery exists as remote-tracking `origin/phase1-local-production-simulation-backup` at `bc95cadde62988ad2603d67b784214c7178ba245` (no local branch). Phase-5.2 freeze `b486590` is an ancestor; merge bases with stable and Phase-5.2 branch are respectively `a9a8c3a` and `35296d7`. No branch changes, deployment, database migration, or configuration mutation.

A. Guest boundary: fresh public-site guest bootstrap works. Two isolated cookie jars produce distinct guest identities, refresh preserves each identity, VIP status returns 401. Desktop and mobile/WeChat user-agent probes get secure, host-scoped, SameSite=Lax cookies on www.aulawyers.com.au. This is HTTP testing, not an actual WeChat device/browser test. Fresh guest `hi` and `你好` both reproduce the service fallback in 65 and 139 ms respectively, with widget HTTP 200.

B. Logged-in/reported fallback boundary: FastAPI QueryRequest requires question min_length=3, while the widget accepts nonempty text and AgentRuntime accepts min_length=1. Two-character greetings fail before the route handler, AgentRuntime, tools, provider, terminal synthesis, checker, or answer persistence. Identity does not affect this validation. Original failure account types are not present in the safe logs, so individual events cannot be independently attributed to registered users.

C. Evidence: CloudWatch read-only scan from 6 September UTC through investigation start: 654 chatbot events, 91 legal-service events. All 13 observed `legal-service error:` events are HTTP 422 with only `string_too_short`, location `[body, question]`, min_length=3. Matching backend access timestamps differ by 1–5 ms. Examples: 7 September 14:10:57.685/687 UTC and 19:01:22.876/877 UTC (8 September 00:10 and 05:01 Sydney). No matching fetch-failure, non-JSON, JSON-parse, ASGI exception, serving exception, DB-pool or provider-error events were found. Six CredentialsSignin events are not proof of guest bootstrap failure. Two earlier aborted/ECONNRESET messages are not labelled widget legal-service fetch failures.

D. Same defect for reproduced guest greetings and logged fallback signature. No independent guest-cookie defect is established.

E. Long research is not involved in a request rejected by schema validation. The reported long wait is still unexplained: logs lack ingress timing and browser correlation. Do not claim the entire incident is explained.

F. Current ECS rev27: one running task, started 6 September 09:13 Sydney; no stop/exit status; target healthy. Task is 1 vCPU / 2 GiB shared by chatbot and legal-service. No container health checks; ECS health UNKNOWN is not proof of failure. Image command has one Uvicorn worker. Query route is synchronous `def`, dispatched in FastAPI's worker threadpool; `asyncio.run` and synchronous Responses streaming occur inside that request worker, not the main ASGI event loop. DB connections can be held during research; pool/thread exhaustion remains a capacity hypothesis, not evidence of this incident. Runtime/provider/registry objects are constructed per request and observability uses ContextVar. No shared serving lock/semaphore found in those modules.

G. Smallest proposed correction: align QueryRequest with the existing nonempty 1–4000 character contract, rejecting blank input without rewriting nonblank text. Add focused schema/HTTP regressions and safe fallback classification/correlation. Keep auth, ownership, models, research/tool policy, budgets, terminal protocol and checker semantics. The schema change is backward compatible for all previously accepted nonblank questions and reversible; no migration needed. Telemetry must never print error bodies, exception messages, customer content or credentials.

Runtime values verified directly from rev27: Default deadline 360000, research 300000, terminal 45000, reserve 15000 ms; AUTH_URL/NEXTAUTH_URL both https://www.aulawyers.com.au; legal-service is loopback http://127.0.0.1:8000. Backend image points to 8184b8b; relevant schema/query/provider files have no changes between that source checkpoint and current HEAD.

## Existing fallback map

Exact temporary-service text: fetch rejection (connection/abort/etc. indistinguishable in old logs); any non-2xx status including 401/403/422/429/5xx; 2xx content-type without application/json; JSON parsing failure. Response body reading occurs outside catch and after clearing the timeout: read failures go to the outer generic 500 instead. Valid JSON has no runtime shape validation: null/wrong fields can cause the outer generic 500; missing/empty answer gives the different 'could not generate' message. Widget authentication, ownership and local rate limits produce their own errors, not this exact fallback. Backend provider/terminal/checker failures usually produce a structured QueryResponse; an upstream exception/DB failure that escapes may instead yield 5xx. ALB is on browser-to-chatbot path, not the loopback backend fetch. No logs establish ALB/OOM/provider/deadline as the cause of these 422s.

## Separate existing policy gap

`/api/immigration-conversations` checks user ID only, not registered type; fresh guest GET returns 200 with an empty list. Its POST likewise accepts a guest session and the workspace uses it. Thus the desired registered-only persistent-history privilege is not fully enforced in existing code. No cross-user read was attempted or observed. Changing that contract requires coordinating guest workspace continuity rather than simply rejecting its bootstrap request; it is not the demonstrated short-message failure. Report this explicitly as outstanding.

## Continuation session (9 September 2026)

Scope: finish/validate the inherited patch, continue the long-wait investigation, no Fast/Slow sub-modes, no commits.

### Validation results (re-run, not trusted from the previous session)

- Backend focused suite (`test_query_reliability.py`, `test_phase2_default_agent_serving.py`, `test_agent_observability.py`, `test_phase6_checker_runtime.py`, `test_political_failsafe.py`), approved `torch` interpreter, Python 3.10.13: **165 passed, 0 skipped, 0 failed**. The previous session's "33 passed" claim was stale for the current tree: the inherited `test_short_general_turn_uses_one_provider_and_no_research_or_checker` failed for all 4 parameters. Two inherited test defects were fixed, production code untouched:
  1. `ExecutionBudget()` was constructed without its required `turn_deadline_ms` / `answer_research_target_ms` / `checker_target_ms` fields;
  2. the test asserted `result.tool_outputs == []`, but the runtime contract records the accepted `submit_answer` execution there. The assertion now requires exactly one tool output with `tool_call_id == 'submit'` (i.e. no research tool executions), which is the actual short-turn invariant.
- Frontend transport tests: **15 passed** (`legal-service-transport.test.ts` + new `server-http-timeouts.test.ts`).
- Biome check on all touched chatbot files: clean (after auto-format). `git diff --check`: clean.

### CONFIRMED root cause of short greeting failures (unchanged)

`QueryRequest.question` previously enforced `min_length=3`; `hi`/`你好` (2 chars) were rejected with HTTP 422 before any runtime stage. The inherited fix (`min_length=1` + nonblank validator) is preserved exactly. All 15 `legal-service error:` chatbot events in the full 14-day CloudWatch window are HTTP 422 `string_too_short` on `[body, question]` (7 September UTC), fast-failing, matching guest and logged-in reproductions.

### Long-wait failure: code-proven boundary defect found and fixed (not yet log-reproduced)

**Finding.** Node's built-in `fetch` (undici) enforces a global default `headersTimeout`/`bodyTimeout` of **300 seconds**. The Default backend legitimately runs up to its 360 s absolute turn deadline (verified rev27 read-only: `DEFAULT_TURN_DEADLINE_MS=360000`, `DEFAULT_ANSWER_RESEARCH_TARGET_MS=300000`, `DEFAULT_TERMINAL_SYNTHESIS_TARGET_MS=45000`, `DEFAULT_FINAL_RESPONSE_RESERVE_MS=15000`). Any substantive research turn whose total backend time exceeded 300 s was therefore killed by the chatbot container's own transport layer before the 370 s widget AbortController could fire: the fetch rejects with an undici timeout, old code logged an undifferentiated fetch failure, and the customer saw the generic fallback after a ~5-minute wait. The intended ordering `backend 360s < frontend abort 370s` was inverted by undici's implicit `300s < 360s` cap (code-proven via Node/undici documented defaults, `3e5` constants in the bundled undici copy, and ECS chatbot image `node:22-bookworm-slim`).

**Fix (evidence-supported; no budget increase beyond closing the inversion).**

- `chatbot/lib/server-http-timeouts.ts`: shared `LEGAL_SERVICE_TIMEOUT_MS = 370_000` and `LEGAL_SERVICE_DISPATCHER_TIMEOUT_MS = 380_000` plus a **module-scoped undici `Agent` dedicated to Next.js → legal-service traffic** (`headersTimeout`/`bodyTimeout` = 380 s). The agent is created once and reused across requests; it is never installed as the process-global dispatcher, so Stripe/auth/SES and all other server-side fetches keep undici's default 300 s behavior. `fetchViaLegalServiceDispatcher()` binds undici's own `fetch` to the dedicated agent via the per-call `dispatcher` init option.
- `chatbot/lib/legal-service-transport.ts`: `requestLegalService()` now defaults its fetch to `fetchViaLegalServiceDispatcher` (dependency-injected test fetches unchanged). The per-request AbortController (370 s) is untouched, and with the scoped dispatcher it is again the first effective boundary; 380 s stays below the 400 s ALB idle timeout on the browser→chatbot path.
- No global dispatcher is installed anywhere in production code; `instrumentation.ts` keeps only its OpenTelemetry registration.
- `undici@^6.21.3` added explicitly (resolved 6.28.1; matches Node 22's bundled undici 6.x on the ECS image).
- Scaled deterministic tests (`lib/server-http-timeouts.test.ts`) prove with local HTTP servers that (a) ordinary global-fetch traffic hits the global boundary while the dedicated dispatcher ignores it, (b) a shorter scoped dispatcher overrides the global one, (c) the widget AbortController fires before the dispatcher timeout and is classified `legal_service_abort_timeout` / `timeout_layer=widget_legal_service`, and (d) normal responses pass through unchanged. Measured finding: undici enforces headers/body timeouts with low-resolution "fast timers" (~1 s resolution, ±500 ms) — immaterial at the production 370/380 s scale, but scaled tests must use ≥1 s boundary values.

With the inherited transport classification, the next occurrence of any failure path is distinguishable in logs: `legal_service_abort_timeout`, `legal_service_connect_error`, `legal_service_http_error` (+ status), `legal_service_non_json`, `legal_service_json_parse_error`, `legal_service_invalid_payload`, `legal_service_empty_answer` — each with `request_id`, `http_status`, `elapsed_ms`, `content_type` and completion fields, correlated with the backend middleware logs `legal_query_received` / `legal_query_finished request_id=… http_status=… elapsed_ms=…`.

### 14-day CloudWatch scan (read-only, full retention window)

Both log groups retain 14 days. Chatbot 4,821 events (25 Aug 04:46 → 7 Sep 22:30 UTC), legal-service 1,735 events (26 Aug 18:53 → 7 Sep 22:30 UTC):

- Query route: **51 × HTTP 200**, **15 × HTTP 422** (`string_too_short`), no other statuses.
- Legal-service tracebacks: **15 × `openai.APITimeoutError: Request timed out.`** (individual provider calls timing out inside the budgeted runtime; the runtime's terminal-recovery path still returned HTTP 200 for those turns, so provider-timeout recovery worked as designed — but each event consumed that turn's research budget and pushed latency toward the terminal phase), 2 × `sqlalchemy.exc.DataError` (PostgreSQL NUL 0x00 bytes), 1 × `FileNotFoundError` for `/app/data/processed/experimental/schedule2_navigation/nodes.json`. The NUL-byte and schedule2-file errors are separate pre-existing defects, not the long-wait cause; recorded as observations only.
- Chatbot: **zero** `legal-service fetch failed`, `widget-chat error`, non-JSON or JSON-parse events in the window; two `Error: aborted / ECONNRESET` events (6 Sep 08:30:44 / 08:31:06 UTC) have **no** corresponding `/api/v1/query` activity nearby, so they are not attributable to the legal long-wait path.
- The 28 Aug 08:45–08:51 UTC cluster (provider timeouts at 08:50:22/08:50:27, query completion 08:50:42, prior completions 08:45:23/08:48:00) is consistent with a turn running ~300 s+ into terminal recovery — exactly the class of turn the undici 300 s boundary kills client-side. Old code recorded fetch failures only as free text and none exist in the window, so the long-wait failure is **not yet log-reproduced**; any real occurrences either predate the 14-day retention window or happened while this telemetry was absent.

### Status of the long-wait investigation

- CONFIRMED (code-level): undici 300 s boundary defect; fixed as above. The fix's correctness does not depend on catching it in old logs.
- NOT CONFIRMED (log-level): a specific observed long-wait incident matched to a boundary. The new classification telemetry is the instrument for the next real occurrence; no speculative timeout increases were made.
- Remaining hypotheses if fallbacks recur despite the fix (all now measurable from the new events): backend turn overrunning 360 s deadline + assembly past 370 s (`legal_service_abort_timeout` with `elapsed_ms ≈ 370000`); chatbot-side persistence/DB hang (`widget_request_finished` absent / `widget_request_error`); provider-path stalls consumed within runtime budget (visible in completion fields); DB pool or threadpool saturation under concurrency (delayed `legal_query_received`). No current evidence supports worker-count changes.

### Guest access status

No auth regression: guest bootstrap, session persistence and VIP denial were re-verified by the previous session and are unchanged by this patch; the earlier guest `hi`/`你好` failures were the same HTTP 422 defect. The conversation-history policy gap remains outstanding as described above.

### Worktree additions in this session

- Modified: `chatbot/app/api/widget-chat/route.ts` (constant import), `chatbot/lib/legal-service-transport.ts` (scoped-dispatcher default fetch), `chatbot/package.json` + `pnpm-lock.yaml` (explicit `undici@^6.21.3`), `legal-service/tests/test_query_reliability.py` (two fixture fixes). `chatbot/instrumentation.ts` was briefly modified for the earlier global-dispatcher approach and has been restored to its OpenTelemetry-only HEAD state.
- New: `chatbot/lib/server-http-timeouts.ts`, `chatbot/lib/server-http-timeouts.test.ts`.
- `chatbot/next-env.d.ts` diff (`.next/dev/types` → `.next/types`) is a generated side effect of running `next build`; restored to HEAD.
- Nothing committed; no AWS/deploy/database changes (read-only AWS inspection only).
