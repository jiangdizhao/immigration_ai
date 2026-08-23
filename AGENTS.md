## Immigration AI v2.1.3 architecture invariants

These repository instructions govern every change that can affect the customer answer path. They supersede older repository guidance where they conflict.

### Architecture precedence and change control

- `doc/local-codex-specs/v2.1.3/` is the governing implementation package wherever it conflicts with v2.1.2, v2.1.1, or older implementation guidance. `immigration_ai_new_architecture_proposal_2026_08_15.docx` remains the frozen architectural foundation; explicit v2.1.3 corrections control serving, evidence gates, checker behavior, mode separation, and migration where wording differs.
- The current user-approved experimental implementation branch for Phase 5.2 is `phase5.2-navigation-research-integration`. The validated Phase-5.1 control branch is `phase5.1-luna-calibration`. The stable/integration branch is `phase1-local-production-simulation`; the immutable recovery branch is `phase1-local-production-simulation-backup`.
- Implement architecture changes only on the user-approved implementation branch. Never implement directly on the stable/integration branch or modify the immutable recovery branch.
- Before architecture-affecting edits, verify branch, HEAD, clean worktree, ancestry, stable/recovery SHA, merge-base, and the prior approved checkpoint. Do not auto-merge or rebase stable changes into the implementation branch.
- Never force-push, rewrite, delete, rebase, merge, deploy, modify a backup branch, infer AWS topology, alter database data, or apply migrations without explicit authorization.
- Do not change architecture because of one example. Record empirical evidence, identify the affected invariant, propose the smallest bounded correction, assess compatibility/rollback impact, and obtain approval before architecture drift.

### Local environment and validation

- On Rico's Ubuntu laptop, backend validation uses `/home/rico/anaconda3/envs/torch/bin/python`. The approved Conda environment is `torch`; the currently approved interpreter is Python 3.10.13.
- Python 3.10.x is explicitly approved for local implementation and validation in this repository. `legal-service/pyproject.toml` may continue to declare Python >=3.11 as packaging/runtime metadata until a separately authorized compatibility audit changes it; do not create or modify another Conda environment as a workaround without approval.
- Use the repository-declared frontend package manager/version and lockfile.
- Prefer Codex for implementation and test authoring; unless explicitly authorized otherwise, Rico/ChatGPT independently performs paid/live validation.

### Mode separation

- Default is GPT-5.6 Luna research mode: bounded `tool_choice=auto`, local legal retrieval plus native agentic web search for substantive research where useful, optional exact legal lookup for precision, deterministic integrity, one compact checker, and dependency-aware claim filtering.
- Premium is GPT-5.6 Sol direct-web mode: bounded recent state/history, native agentic web search, lightweight claim-addressable handoff, deterministic integrity, and the same compact checker.
- Premium MUST NOT normally use local RAG, exact local lookup, Flat-RAG, LightRAG, PFVD, Schedule-first routing, or legacy semantic/router chains.
- Premium MUST NOT be forced through the full Default `AgentSubmissionV2`/opaque-ref terminal protocol merely for architectural symmetry. Premium remains direct and claim-addressable.
- Stable/general turns normally use one provider call, no research, and no checker. Current general turns may use current-information web search in the same logical stage. Never invoke legal-only tools merely because a question is current.
- A normal substantive legal turn uses no more than two logical LLM stages: one bounded answer/research stage and one compact checker stage. Provider continuations/retries remain separately counted calls and never create hidden logical stages.
- No mode may silently fall back per request to a materially different engine or model. Rollback/fallback must be explicit, configured, observable, and tested.
- Do not add a mandatory standalone LLM classifier/router before the answer agent. Tool selection remains dynamic under the conversational model.

### General architecture, not case patches

- Never fix an example by adding a subclass-, visa-, clause-, phrase-, language-, nationality-, or case-specific routing regex, hard-coded answer, prompt branch, score boost, or response postprocessor.
- Apply the smallest general fix in tool policy/descriptions, canonical source ingestion, retrieval coverage, exact lookup, compact state, evidence identity, deterministic integrity, checker semantics, dependency filtering, or another typed interface.
- Add the failed example to the appropriate pilot/eval set and prove the correction does not regress unrelated or held-out cases.
- Deterministic patterns are allowed for syntax/locator parsing, generated safety policy, claim spans, dependency validation, budgets, and other non-semantic mechanics. They must not decide eligibility, pathway, research depth, or legal relevance.

### Research coverage

- Default research is high-recall, bounded, and coverage-oriented. Local and web retrieval are complementary; exact lookup is optional precision retrieval.
- Agentic web search is the primary open-ended discovery mechanism for current or cross-source legal research. Search relevant material branches until reasonable evidence saturation or a hard budget; do not search indefinitely or collect duplicates blindly.
- Schedule 2 is a source, never the research boundary. Follow relevant links into the Migration Act, Regulations and other schedules, legislative instruments, current Home Affairs material, amendments/transitional provisions, and relevant judicial/tribunal material.
- Missing local evidence must be reported honestly and does not invalidate genuine web evidence. Never fabricate or silently download a missing source during a customer query or merely to satisfy a test.
- Native web evidence is not backend-held exact source text unless a separately approved fetch actually obtained that text.
- LightRAG/graph relationships are derived navigation and relationship-discovery data, never legal authority. Do not promote LightRAG into the serving path without the required isolated evaluation and approval.
- For Phase 5.2 experimental Arm N only, the validated Schedule-2 navigation sidecar may be exposed to the shadow/evaluation Luna runtime as a bounded navigation tool. Its nodes, edges, locators, and resolution metadata are navigation hints only: they MUST NOT create evidence refs, support displayed citations, or independently support a decisive legal claim.
- When an Arm N navigation target is materially relevant, genuine support must come through the existing exact/local legal evidence path or genuine same-request native web evidence. The existing `ExactLegalSourceService` may be exposed through a thin bounded Arm N tool adapter; do not build a second exact-lookup engine or weaken `RequestEvidenceRegistry` identity rules.
- Arm L remains the unchanged Phase-5.1 control for the Phase-5.2 experiment. Phase 5.2 does not authorize LightRAG integration, compact-checker redesign/activation, Premium changes, or promotion of Arm N into the customer-serving path.
- Deterministic utilities may calculate an evidenced or user-supplied rule but must not choose the applicable legal rule, deadline, start date, fee, eligibility branch, or current policy.
- Do not force legal tools for general conversation or stable knowledge. Validate legal-research recall, unnecessary research on stable/general turns, and correct current-information tool use separately.

### Mechanical integrity versus semantic verification

- The deterministic evidence/submission gate is a **mechanical integrity gate only**.
- It verifies schema validity, claim/draft spans, claim IDs and dependencies, request-scoped evidence identity, genuine same-request native-web locators, citation structure/XOR rules, cross-request identity, bounded resources, and other deterministic lifecycle constraints.
- The integrity gate MUST NOT decide whether a legal proposition is substantively correct, sufficiently authoritative, current, applicable, or wisely phrased.
- The integrity gate MUST NOT reject a claim solely because document version, effective dates, exact statutory text/span, controlling-authority metadata, canonical URL for local evidence, or local corpus coverage is absent or unknown.
- Metadata incompleteness is not legal falsity. Historical, transitional, exact-wording, and date-sensitive propositions may require stronger semantic verification, but that judgment belongs to the compact checker.
- If the backend can normalize a submission deterministically without semantic guessing, normalize and continue. Do not turn legal-quality judgment into structural rejection.

### Evidence identity and source traceability

- Evidence refs are backend-issued, opaque, request-scoped, and produced by an actual tool/provider normalization path. Guessed, cross-request, URL-typed, model-invented, or fabricated refs are invalid.
- `NativeWebLocator` is a transient same-request observed HTTPS URL. Resolve it deterministically to a canonical `web:<opaque>` evidence ref before integrity checks. Locator resolution is canonicalization, not semantic verification or a general repair mechanism.
- Local evidence identity is grounded in controlled corpus/source/chunk/provision/text/hash provenance. `canonical_url`, `document_version`, and effective dates are valuable metadata when genuinely available, but are not universal identity requirements and must never be fabricated.
- Do not weaken missing-version/effective-date evidence-strength signals into fabricated applicability; equally, do not use their absence as a universal deterministic admission failure.
- Every displayed decisive citation must resolve to genuine request-scoped evidence. Never fabricate exact text/content hashes for native web citations that did not expose that text to the backend.
- Do not treat "official" as a single authority rank. Legislation, legislative instruments, superior-court authority, other judicial decisions, tribunal decisions, operational guidance, explanatory material, and commentary have different legal roles.
- A graph entity/edge, model-typed URL, unverified page, or generic legislation homepage cannot by itself support/display as exact decisive authority.
- Preserve and render all genuine relevant citations; do not impose an arbitrary small citation cap. Retain claim-to-evidence mappings in lawyer-review traces.

### Compact checker: semantic reliability layer

- Run one compact checker only for substantive legal submissions or other explicitly approved material claim classes. Stable/general turns do not invoke it.
- The compact checker is the **semantic reliability layer**. It evaluates material claims against evidence already collected in the same request, including support, meaning, contradiction, source fit/authority, currentness where the evidence makes it material, overstatement, qualification, and materiality.
- The initial checker baseline is evidence-only. It MUST NOT perform web search, local retrieval, Flat-RAG, exact lookup, LightRAG, or any other research call.
- Future checker-side verification requires separate feature flags, benchmarks, architecture approval, and migration gates.
- Checker output is `KEEP` or `DROP`, with structured internal reason codes. Qualification is an optional narrow patch, not a third normal serving decision.
- `KEEP` preserves the original claim span and unrelated draft material unchanged except approved deterministic citation/render normalization.
- `DROP` removes the affected claim span. Dependency propagation then removes material conclusions that depend on a dropped premise unless independently supported under the explicit dependency contract.
- Qualification is permitted only when the weaker proposition is directly supported by already-collected request-scoped evidence, adds no new substantive fact, and narrows certainty or scope. Otherwise `DROP`.
- Any qualification must be applied through validated targeted span/hash semantics. Patch mismatch, new unsupported facts, unrelated prose changes, or ambiguous targeting fail closed.
- The checker may not invent propositions, evidence refs, citations, URLs, legal metadata, or hidden facts; may not stylistically rewrite the whole answer; and may not turn a detailed correct answer into generic caution.
- The checker must use only evidence refs present in the current request registry. Unknown/cross-request refs from checker output are invalid and must never surface.
- Missing `document_version`, effective dates, canonical URL on local evidence, or exact statutory text alone MUST NOT cause `DROP`.
- If the checker fails, times out, returns malformed output, or its deterministic patch/finalization cannot be validated, do not silently serve unchecked substantive content, silently invoke the legacy/PFVD engine, or trigger a full answer rewrite/re-research loop. Follow the explicit v2.1.3 fail-safe contract and tests.

### Claim and dependency contract

- Material claims must be addressable by stable claim IDs and deterministic draft spans/hashes sufficient for checker filtering.
- Use a compact `depends_on` list where material conclusions rely on premises.
- Unknown dependencies, duplicate claim IDs, impossible claim locations, and dependency cycles are structural failures.
- Valid nested/overlapping addressable claim spans are not automatically legal-quality failures; overlap alone is not grounds for semantic rejection.
- Dropping a prerequisite claim MUST trigger deterministic dependency propagation so an invalid dependent conclusion cannot survive unchanged.
- Preserve independent surviving claims and unrelated draft text byte-for-byte where practical.
- Do not introduce fuzzy semantic claim matching as a repair mechanism.

### Runtime, deadlines, and terminal completion

- Start one absolute monotonic backend deadline when FastAPI accepts the allowed query, before state loading or agent setup. It covers state, providers, research tools, continuations, retries, integrity, checker, state/citation commit, and response-critical assembly.
- No component timeout, retry, continuation, research stage, terminal stage, or checker resets or extends the absolute deadline.
- The answer/research target is a non-resetting research boundary, not an automatic no-answer boundary. When research time/round/viability is exhausted but absolute time remains, research tools disappear and the runtime may use a terminal-only synthesis opportunity with `submit_answer` only.
- `submit_answer`, deterministic utility, governor-denied calls, and terminal synthesis are not Flat-RAG research rounds.
- Bound and record logical stages, provider calls, tool calls/rounds, retries, tokens, latency, deadlines, checker identity, evidence origins, state, cost, and review trace IDs separately.
- No unbounded agent, research, repair, retry, checker, or re-research loop.
- If a provider finishes without terminal submission, never serve raw provider text. Permit only the approved bounded continuation behavior inside the original deadline.

### Compact state and political/privacy gate

- Both answer modes use versioned compact matter state sufficient for multi-turn continuity, including stable topic/option identities and ordinal order where required so follow-ups such as "the second"/"第二个" can resolve without a mandatory router call.
- Persist only user-provided or confirmed facts as confirmed facts. Do not store hidden chain of thought.
- The primary political/sensitive gate runs in the browser before transmission, persistence, upload, model calls, or raw-text telemetry. Route/backend guards are defense in depth, not legal routers.
- Do not send, store, log, or echo blocked raw text in normal history, analytics, or telemetry.
- Ordinary web research queries must abstract the legal/general issue and exclude client names, DOB, passport/TRN/application IDs, phone/email, residential address, and other unique identifiers unless a separately approved public-record workflow requires an identifier.
- Do not store hidden reasoning, secrets, blocked text, raw PII, or unredacted sensitive matter/search content in normal telemetry.

### Observability

- Separately record `logical_llm_stage_count`, `provider_api_call_count`, `tool_call_count`, `tool_round_count`, per-tool call counts, `retry_count`, answer-agent latency, checker latency, total latency, token usage, deadlines, and deadline-exceeded stage.
- Track native web search, exact lookup, graph/LightRAG, Flat-RAG, deterministic utility, terminal submission, and checker calls explicitly when present.
- Every turn should retain architecture/config/prompt/policy/corpus/checker versions, evidence origins/counts, integrity results, checker KEEP/DROP identity, qualification/dependency drops, state revision, actual citations, cost estimate, and review trace ID as applicable.
- Observability is part of the architecture. Do not change metric semantics merely to make a new implementation look green; inspect and preserve the intended contract.

### Preserve operational capabilities

- Keep matter identity, authentication, rate limiting, conversation persistence, citations, booking/task handoffs, lawyer-review trace/list/detail/submit/export, container health, and explicit rollback operational.
- Database changes are additive first. Preserve explicit legacy rollback adapters until approved soak/retention gates permit removal.
- The canonical PostgreSQL legal corpus remains authoritative for local exact source content. Derived relationship indexes are rebuildable navigation layers.
- Do not infer, rename, or deploy live AWS resources from local compose. Require authoritative topology and explicit deployment authorization.
- Do not apply the nullable-local-URL migration merely because it exists; apply migrations only through the controlled migration/deployment procedure when an environment actually needs the schema change.

### Validation before completion

- Before claiming an R-stage complete, run the affected unit, contract, integration, frontend/build, container smoke, pilot/evaluation, review, and rollback checks when authorized, and report exact pass/fail/skip results.
- Hard gates include zero fabricated/unresolved displayed citations, zero request-scoped evidence bypass, zero graph-only decisive authority, zero blocked-text transmission, zero checker-introduced unsupported claims, and zero silent legacy fallback from the new runtime.
- Test general no-tool behavior, legal/local research, native web research, exact/effective-date questions, cross-schedule references, authority conflicts, tool failures, checker KEEP preservation, checker DROP behavior, dependency propagation, narrow qualification, checker failure/timeout, political bypass, lawyer review, rollback, and multi-turn English/Chinese continuity.
- For checker validation specifically, include URL-less local evidence, missing-version metadata, unknown/cross-request checker refs, prerequisite/dependent claim drops, independent-claim survival, and targeted qualification hash/span validation.
- Do not run large paid/live OpenAI evaluations after every small change. Prove contracts locally first, then run a representative bounded live pilot, then the complete acceptance set only when warranted.
- Stop and mark `DECISION REQUIRED` when the frozen architecture or v2.1.3 package does not determine a material choice. Do not invent a tactical workaround.
- Treat legacy smokes as phase-aware. Classify them as rollback compatibility, obsolete hot-path assumption, or still-valid shared invariant; replace obsolete hot-path assertions with explicit legacy-adapter tests rather than deleting them blindly.

### Prohibited shortcuts

- No mandatory semantic router/classifier before the answer agent.
- No visa/subclass/phrase/language/case-specific routing or answer patch.
- No always-search rule for stable/general turns.
- No local retrieval in Premium.
- No full Default terminal/evidence machinery as a mandatory Premium handoff.
- No checker-as-second-research-agent.
- No checker-side retrieval in the initial baseline.
- No normal answer-model re-research after checker `DROP`.
- No automatic whole-answer rewrite after checker failure.
- No fuzzy claim matching, arbitrary URL conversion, fabricated legal metadata, or evidence-gate bypass.
- No silent legacy/PFVD fallback from the corrected runtime.
- Do not increase deadlines/retries merely to hide orchestration or checker defects.
- Do not reactivate PFVD/proposal-first exhaustive verification inside the compact checker.

### v2.1.3 revision stages

Use the corrected v2.1.3 revision-stage names in implementation plans and checkpoints rather than treating old historical Phase numbers as the governing architecture sequence:

- **R0** — freeze correction and empirical baseline;
- **R1** — deterministic mechanical integrity gate;
- **R2** — claim/dependency contract;
- **R3** — evidence-only compact checker and deterministic filtering;
- **R4** — revised Default Luna integration;
- **R5** — Default validation;
- **R6** — Premium Sol direct-web path;
- **R7** — Premium lightweight handoff/shared checker integration;
- **R8** — Premium validation;
- **R9** — paired evaluation and rollout decision.

### Current checkpoint notes

- Current experimental implementation branch: `phase5.2-navigation-research-integration`; current Phase-5.1 control branch: `phase5.1-luna-calibration`.
- Approved Phase-5.1 reliability checkpoint before checker acceptance: `f216911a14b6d0ead482b1ede85f971f64a3285d` (`feat: stabilize revised default luna runtime`).
- Phase 5.2 is an evaluation-only navigation/exact-lookup integration. Arm N must remain non-serving until its A/B validation and a separate user approval; Arm L remains the unchanged control.
- Current approved low-cost answer model: `gpt-5.6-luna`.
- Current approved compact-checker model: `gpt-5.6-luna`.
- Current approved Premium target model: `gpt-5.6-sol`.
- Current revised-Default calibration baseline uses Luna reasoning effort `low`.
- The validated revised-Default runtime has explicit terminal-only synthesis, request-scoped local/native-web evidence, URL-optional local evidence identity, bounded Flat-RAG/tool/retry behavior, and corrected terminal telemetry. Do not regress those contracts while implementing R3 checker behavior.
- `COMPACT_CHECKER_ENABLED` remains feature-gated until checker contracts and acceptance tests pass.
- Transitional Flat-RAG remains part of the current revised-Default evaluation path; it is not authorization to make Flat-RAG a permanent Premium tool or to skip later retrieval architecture decisions.
- Model IDs, reasoning effort, tool limits, storage backend, and latency thresholds may change only through configuration plus benchmark/approval; configuration changes do not authorize violating the invariants above.