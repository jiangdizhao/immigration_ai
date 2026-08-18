## Immigration AI architecture invariants

These rules apply to every change affecting the customer answer path.

### Git, recovery, and local validation

- Implement architecture changes only on the user-approved implementation branch. Never implement directly on the stable/integration branch or modify the immutable recovery branch.
- Create the implementation branch only in the first approved implementation session. In later sessions, resume the existing branch after clean-worktree, approved-baseline ancestry, stable/backup SHA, merge-base, and prior-approved-commit checks. An existing implementation branch is expected after Phase 0. If stable changed, stop; never auto-merge or rebase it.
- Never force-push, rewrite, delete, rebase, or merge into a recovery branch. Merge or deployment always requires explicit user authorization.
- On Rico's Ubuntu laptop, run backend validation with `/home/rico/anaconda3/envs/torch/bin/python`; confirm that exact executable and Python >=3.10 before testing. Python 3.10.x is explicitly approved for local implementation and validation in this repository; the currently approved local interpreter is Python 3.10.13. `legal-service/pyproject.toml` may continue to declare Python >=3.11 as packaging/runtime metadata until a separate full-backend Python-3.10 compatibility audit is authorized; that declaration is not a blocker for local validation with the approved `torch` environment. Do not use, create, install into, or modify another Conda environment as a workaround without approval.
- Use the repository-declared frontend package manager/version and lockfile.

### LLM stages, calls, and routing

- General conversation and stable-general turns use one low-cost answer-agent logical stage, normally one provider API call, no research tool, and no fact checker. Current-general turns remain one logical stage and may use current-information tools; do not invoke legal-only tools unnecessarily.
- A normal substantive legal turn uses no more than two logical LLM stages: a bounded answer/research stage and one compact fact-check stage.
- Separately cap and record `logical_llm_stage_count`, `provider_api_call_count`, `tool_call_count`, `tool_round_count`, per-tool call counts, `retry_count`, answer/check latency, and total latency. Never hide continuations or retries inside a logical-stage label.
- Tool loops and retries must be bounded and configurable. No unbounded agent loop or former multi-minute timeout may become normal behavior.
- Start one absolute monotonic backend deadline when FastAPI accepts the allowed query, before matter/state loading or agent setup, and share it across the backend fail-safe, state load, providers, tools, continuations, retries, evidence validation, checker, state/citation commit, and response-critical assembly. Component timeouts fit inside that deadline; no retry resets or extends it. Measure browser/Next.js transport separately. Record `turn_deadline_ms`, `pre_agent_latency_ms`, `backend_total_latency_ms`, `remaining_deadline_before_call_ms`, and `deadline_exceeded_stage`.
- Do not add a mandatory standalone LLM classifier/router before the answer agent. Normal tool selection is dynamic (`tool_choice=auto` under the current implementation).
- Do not silently fall back per request to a materially different legacy engine or model. Rollback/fallback must be explicit, configured, observable, and tested.

### General architecture, not case patches

- Never fix an example by adding a subclass-, visa-, clause-, phrase-, language-, nationality-, or case-specific routing regex, hard-coded answer, prompt branch, score boost, or response postprocessor.
- Apply the smallest general fix in tool policy/descriptions, canonical source ingestion, exact lookup, relationship retrieval, compact state, evidence validation, fact checking, or a typed interface.
- Add the failed example to the pilot and prove the fix does not regress unrelated/held-out cases.
- Deterministic patterns are allowed for syntax/locator parsing, generated safety policy, and other non-semantic mechanics. They must not decide eligibility, pathway, research depth, or legal relevance.

### Tool-first legal research

- Agentic web search is the primary open-ended legal-discovery mechanism. Research queries must abstract to the legal/general issue and must not include client names, DOB, passport/TRN/application IDs, phone/email, residential address, or other unique personal identifiers unless a separately approved public-record workflow explicitly requires an identifier. Test and record zero PII leakage without storing PII-bearing query text in normal telemetry.
- Use exact legal lookup for a known/discovered provision, schedule, PIC, condition, instrument, case, subclass criterion, or effective-version question.
- Before generalized exact lookup, produce and validate a canonical-corpus coverage report. Expose a source family only where the report confirms local coverage; disclose partial/absent/unknown coverage and use web discovery instead. Never fabricate or silently download a missing legal source during a query or merely to satisfy a test.
- A graph relationship retrieval layer may discover entities, relationships, and multi-hop paths, but it is derived navigation data and never legal authority.
- Schedule 2 is a source, not the research boundary. Follow relevant links into the Act, Regulations/all schedules, instruments, cases, tribunal material, and official guidance.
- Deterministic utilities may calculate an evidenced/supplied rule but must not choose the applicable legal rule, deadline, start date, or current fee.
- Do not serve a substantive legal answer from model memory. Decisive claims must pass the deterministic evidence/applicability postcondition using actual tool-issued evidence references.
- Do not force legal tools for general conversation or stable knowledge. Validate substantive-research recall, unnecessary research on stable/general conversation, and correct current-information tool use on time-sensitive general questions.

### Fact-check preservation and authority

- Run one compact checker only for substantive legal submissions.
- `PASS` returns the original draft unchanged except approved deterministic citation/render normalization.
- `FIX` changes only the affected validated claim spans. `UNCERTAIN` qualifies or removes only the uncertain portion. Preserve unrelated content, structure, examples, tone, and citations.
- The checker may remove, narrow, correct, or qualify a claim when stronger evidence supports the change.
- The checker may not invent a proposition/citation, modify unrelated correct passages, stylistically rewrite a PASS answer, or turn a detailed good answer into generic caution.
- Apply checker output through deterministic span/hash/evidence validation where practical. If checker or patch validation fails, do not serve unchecked substantive content or regenerate the whole answer silently.

### Exact source traceability

- Every decisive legal claim maps to an evidence reference returned by an actual tool and to either a backend-held canonical source/span or an actual native web-search citation. Never fabricate exact text/content hashes for a native web citation that does not expose that source passage to the backend; exact-wording/version claims should resolve to canonical/exact evidence when available.
- Evidence references are server-issued, opaque, and request-scoped. Accept one only when it exists in that execution's tool-output registry; a URL, guessed ID, or cross-request ref typed by the model/user is invalid. Cryptographic signing is not required unless separately approved.
- If a provider finishes without terminal `submit_answer`, never serve its raw text. Permit one bounded counted continuation inside the original deadline, then return a controlled incomplete/error response.
- Preserve at minimum: source type, authenticity, authority kind, jurisdiction, binding status, court/tribunal level where relevant, document version, effective interval, retrieval time, canonical source ID, canonical URL, provision/span, and content hash where available.
- Do not treat “official” as a single authority rank. Legislation, legislative instruments, superior-court authority, other decisions, tribunal decisions, operational guidance, explanatory material, and commentary have different legal roles.
- A graph entity/edge, model-typed URL, unverified page, or generic legislation homepage cannot support/display as an exact decisive citation.
- Expose unresolved conflicts and escalate; do not silently prefer guidance over binding law or treat a tribunal decision as legislation.
- Render all actual relevant citations in default and premium modes and retain claim-to-evidence mappings in lawyer-review traces. Do not impose an arbitrary small citation cap.

### Compact state and political gate

- Both answer modes use versioned compact matter state with stable topic/option IDs and ordinal order so “the second”/“第二个” can resolve without a router call.
- Persist only user-provided/confirmed facts as confirmed facts. Store no hidden chain of thought.
- The primary political-sensitive gate runs in the browser before transmission, persistence, upload, model calls, or raw-text telemetry. Route and backend deterministic guards are defence in depth, not visa/legal routers.
- Do not send, store in normal state/history/analytics, log, or echo blocked raw text. Treat browser policy assets as inspectable; do not claim encoding makes policy secret.

### Latency and observability

- Meet approved p50/p95 and hard-timeout budgets for general, legal, premium, web, exact lookup, relationship retrieval, utility, and checker paths.
- Every turn records IDs and architecture/config/prompt/policy/corpus versions; model/stage/provider/tool/retry counts; per-stage/tool latency/tokens; actual sources; evidence/check status; checker patch/PASS identity; state revision; cost estimate; and review trace ID.
- Track `web_search_call_count`, `exact_lookup_call_count`, graph-retrieval call count, flat-RAG call count, and utility call count explicitly.
- Do not log hidden reasoning, secrets, blocked raw text, or unredacted sensitive matter/search content.

### Preserve operational capabilities

- Keep matter identity, auth, rate limiting, conversation persistence, citations, booking/task handoffs, lawyer-review trace/list/detail/submit/export, container health, and explicit rollback operational.
- Database changes are additive first. Keep dual-readable state and the explicit legacy engine until approved soak/retention completes.
- The canonical PostgreSQL legal corpus remains authoritative. Relationship indexes are derived and rebuildable.
- Do not assume the existing AWS RDS database supports LightRAG graph storage. Pin and verify the exact LightRAG release/backend/extensions in isolation; choose production storage only after Arm C evaluation and approval.
- Do not infer, rename, or deploy live AWS resources from local compose. Require authoritative topology and explicit deployment authorization.

### Validation before completion

- Before claiming a phase complete, run every affected unit, contract, integration, frontend, build, container smoke, pilot/eval, and rollback test using the required environment.
- Treat legacy smokes as phase-aware: through Phase 11 retain applicable compatibility/rollback tests; from Phase 12 classify each as rollback compatibility, obsolete hot-path assumption, or still-valid shared invariant, and replace obsolete hot-path assertions with explicit legacy-adapter tests rather than deleting them.
- Hard gates include zero fabricated/unresolved displayed citations, zero evidence-gate bypass, zero graph-only decisive authority, zero blocked-text transmission, and zero checker-introduced unsupported claims.
- Test general no-tool behavior, legal research, exact/effective dates, cross-schedule references, authority conflicts, tool failures, checker PASS preservation/targeted patches, political bypass, lawyer review, rollback, and multi-turn English/Chinese ordinals.
- Report exact files, commands with pass/fail/skip, config/migrations, sanitized traces, raw call/tool metrics, latency/tokens/search/cost, manual results, and completed rollback rehearsal.
- Stop and mark `DECISION REQUIRED` when the frozen architecture or repository does not determine a material choice. Do not invent one.

### Configurable implementation notes (not permanent architecture)

- Current stable/integration branch: `phase1-local-production-simulation`.
- Current immutable recovery branch: `phase1-local-production-simulation-backup`.
- Current implementation branch: `next-architecture-agentic-tools`.
- Current approved low-cost answer model: `gpt-5.6-luna`.
- Current approved premium high-capability model: `gpt-5.6-sol`.
- Current approved compact checker model: `gpt-5.6-luna`.
- Current premium v1 answer tools: web search, deterministic utility, and terminal submission only.
- Current default v1 answer tools: web search, exact lookup, graph relationship retrieval when enabled, deterministic utility, and terminal submission. Transitional flat RAG is evaluation/rollback only.
- Current candidate graph relationship retriever: LightRAG. Shadow storage starts with an isolated backend confirmed by the pinned release; production graph storage is not selected until Arm C evaluation supports promotion and Rico approves it.
- Model IDs, reasoning effort, tool-round limits, storage backend, and latency thresholds may change only through configuration plus benchmark/approval; changing them does not authorize violating the invariants above.
