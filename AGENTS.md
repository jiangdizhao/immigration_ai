## Immigration AI v2.1.3 architecture invariants + Phase 6 checker freeze

These repository instructions govern every change that can affect the customer answer path. They supersede older repository guidance where they conflict. The explicit Phase 6 checker decisions agreed on 24 August 2026 are later corrections to the v2.1.3 checker wording and control where they conflict with older KEEP/DROP/qualification language.

### Architecture precedence and change control

- `doc/local-codex-specs/v2.1.3/` remains the governing implementation package except where an explicit later user-approved Phase 6 correction is recorded in this file. `immigration_ai_new_architecture_proposal_2026_08_15.docx` remains the frozen architectural foundation.
- The validated Phase-5.2 practical freeze is commit `b486590e1c8d90604c9732c388fdf1a75e60fe20` on `phase5.2-navigation-research-integration`. Treat Graph navigation, exact legal lookup, current corpus identity, request-scoped evidence provenance, and terminal submission normalization at this checkpoint as frozen foundations for Phase 6 unless direct regression evidence points back to them.
- The validated Phase-5.1 control branch is `phase5.1-luna-calibration`. The stable/integration branch is `phase1-local-production-simulation`; the immutable recovery branch is `phase1-local-production-simulation-backup`.
- Implement architecture changes only on a user-approved implementation branch. Never implement directly on the stable/integration branch or modify the immutable recovery branch.
- Before architecture-affecting edits, verify branch, HEAD, clean worktree, ancestry, stable/recovery SHA, merge-base, and the prior approved checkpoint. Do not auto-merge or rebase stable changes into the implementation branch.
- Never force-push, rewrite, delete, rebase, merge, deploy, modify a backup branch, infer AWS topology, alter database data, or apply migrations without explicit authorization.
- Do not change architecture because of one example. Record empirical evidence, identify the affected invariant, propose the smallest bounded correction, assess compatibility/rollback impact, and obtain approval before architecture drift.

### Local environment and validation

- On Rico's Ubuntu laptop, backend validation uses `/home/rico/anaconda3/envs/torch/bin/python`. The approved Conda environment is `torch`; the currently approved interpreter is Python 3.10.13.
- Python 3.10.x is explicitly approved for local implementation and validation in this repository. `legal-service/pyproject.toml` may continue to declare Python >=3.11 as packaging/runtime metadata until a separately authorized compatibility audit changes it; do not create or modify another Conda environment as a workaround without approval.
- The authoritative local development database is host PostgreSQL 17 on `127.0.0.1:5432`, database `immigration_legal`. The stale Docker Phase-1b database on `127.0.0.1:5433` is not an authoritative evaluation corpus. Do not expose database credentials in logs, prompts, artifacts, or handoffs.
- Codex sandbox failure to reach `localhost:5432` or `127.0.0.1:5432` does **not** mean the authoritative corpus is unavailable. The verified behavior on 26 August 2026 is: inside the Codex sandbox `pg_isready` reports no response; after explicit approved execution outside the sandbox, the same host PostgreSQL accepts connections and exposes the authoritative corpus.
- Before claiming any full-suite, real-corpus, retrieval, schema, or database-integration validation, probe the authoritative host database. If the Codex sandbox cannot reach it, request approved **outside-sandbox execution** for the database-backed validation rather than silently accepting skips or substituting another database.
- Database-dependent skipped tests are **not equivalent to passing tests**. Validation reports must distinguish sandbox-only results from authoritative-host-DB results and must state the number and reason for any skips. A freeze/release gate that depends on the canonical corpus requires an authoritative-host-DB run.
- Use PostgreSQL authentication through the existing user environment (for example `~/.pgpass`) without reading, displaying, copying, logging, or embedding credential contents. Never place the database password in commands, prompts, source code, reports, handoffs, or committed configuration.
- `127.0.0.1:5433` remains non-authoritative even if it is reachable from a sandbox/container. Do not substitute it for `5432` merely to make tests execute.
- Current diagnostic checkpoint values on 26 August 2026 are PostgreSQL 17.11, database `immigration_legal`, user `rico_local`, `46` rows in `legal_sources`, and `9372` rows in `source_chunks`. These counts are reference values for detecting accidental environment substitution or corpus mutation, not permanent corpus-size invariants; legitimate corpus updates may change them through an approved ingestion/update procedure.
- Use the repository-declared frontend package manager/version and lockfile.
- Prefer Codex for implementation and test authoring; unless explicitly authorized otherwise, Rico/ChatGPT independently performs paid/live validation.

### Mode separation

- Default is GPT-5.6 Luna research mode: bounded `tool_choice=auto`, local legal retrieval plus native agentic web search for substantive research where useful, optional exact legal lookup for precision, deterministic integrity, one compact checker, and dependency-aware claim filtering.
- Premium is GPT-5.6 Sol direct-web mode: bounded recent state/history, native agentic web search, lightweight claim-addressable handoff, deterministic integrity, and the same checker architecture with separately calibrated intervention policy.
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

### Phase 5.2 frozen research foundation

- Phase 5.2 is practically stabilized at `b486590e1c8d90604c9732c388fdf1a75e60fe20`. Proceed to Phase 6 rather than continuing to tune locator normalization, Schedule parsing, Graph structure, corpus identity, provenance plumbing, or terminal submission mechanics without direct regression evidence.
- The authoritative active Migration Regulations corpus for this checkpoint is compilation `F2026C00667`; stale/versionless active Regulations sources must not silently re-enter exact evidence.
- Default research is high-recall, bounded, and coverage-oriented. Local and web retrieval are complementary; exact lookup is precision retrieval.
- Agentic web search is the primary open-ended discovery mechanism for current or cross-source legal research. Search relevant material branches until reasonable evidence saturation or a hard budget; do not search indefinitely or collect duplicates blindly.
- Schedule 2 is a source, never the research boundary. Follow relevant links into the Migration Act, Regulations and other schedules, legislative instruments, current Home Affairs material, amendments/transitional provisions, and relevant judicial/tribunal material.
- Missing local evidence must be reported honestly and does not invalidate genuine web evidence. A zero local lookup result is never proof that a legal rule does not exist. Never fabricate or silently download a missing source during a customer query or merely to satisfy a test.
- Native web evidence is not backend-held exact source text unless a separately approved fetch actually obtained that text.
- The validated Schedule-2 Graph/navigation sidecar is a recall/navigation aid only. Graph nodes, edges, locators, rankings, and relationship hints are NEVER legal evidence and MUST NOT independently support a decisive legal claim or displayed citation.
- When a Graph navigation target is materially relevant, genuine support must come through exact/local legal evidence or genuine same-request native web evidence. Do not build a second exact-lookup engine or weaken `RequestEvidenceRegistry` identity rules.
- LightRAG/graph-derived relationships are navigation and relationship-discovery data, never legal authority. Do not promote LightRAG into the serving path without separate evaluation and approval.
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

### Phase 6 compact checker: frozen baseline intent

- Phase 6 is the next major engineering milestone. Implement it as one integrated, bounded milestone rather than a long chain of micro-phases unless a fundamental safety/architecture contradiction appears.
- The checker is a **conservative legal-claim auditor**, not a second answering agent, second researcher, or answer rewriter.
- Run exactly one compact checker call only for material substantive legal claims and other explicitly approved decisive current facts. Stable/general chat, simple navigation, deterministic calculations, and non-substantive procedural turns normally skip it.
- Checker gating is deterministic. Do not introduce another LLM router.
- The baseline checker is evidence-only. It MUST NOT perform web search, local retrieval, Flat-RAG, exact lookup, LightRAG, Graph traversal, Schedule pre-routing, or any other research/tool call.
- The checker sees only the mechanically accepted draft/claim structure, relevant compact matter facts, and a deterministically compacted packet of request-scoped evidence relevant to those claims. Do not pass the entire raw research trace merely because it exists.
- The checker must use only evidence refs registered in the current request. It may not invent a source, URL, evidence ref, legal authority, hidden fact, or new proposition.
- Graph output is never checker evidence.
- Baseline semantic verdicts are `KEEP`, `FLAG`, and `BLOCK` with structured reason codes. This later Phase 6 contract supersedes older baseline `KEEP`/`DROP` terminology.
- `KEEP`: adequately supported and applicable. Preserve the customer-visible claim unchanged.
- `FLAG`: suspicious, weakly supported, overstated, materially incomplete, stale, or applicability-unclear. Uncertainty normally produces `FLAG`, not `BLOCK`.
- `BLOCK`: reserve for high-confidence applicable evidence that clearly contradicts the material claim or makes it indefensible. There is no reward for intervening more often.
- Allow an answer-level `MATERIAL_OMISSION_SUSPECTED` signal only when evidence already gathered in the same request suggests a material branch was omitted. The checker may flag the possible omission but may not research or write the missing rule.
- **No free-form qualification/replacement text in the baseline Phase 6 checker.** Do not implement generative correction or whole-answer rewriting. Any future narrow qualification feature requires a separate explicit approval and validation contract.
- The checker LLM never edits the answer directly. A deterministic finalizer owns serving effects using accepted claim spans and dependency structure.
- Initial deployment is shadow-only: `KEEP`, `FLAG`, and `BLOCK` are telemetry/review outcomes and MUST NOT alter the customer answer while calibration is in progress.
- Later Default serving intervention, if separately approved after calibration: `KEEP` preserves; `FLAG` preserves with internal risk/escalation signal; `BLOCK` suppresses the exact targeted claim and deterministically removes dependent conclusions, with only minimal deterministic punctuation/format cleanup.
- Premium Sol uses the same checker architecture but must be calibrated separately. Initially prefer shadow `KEEP`/`FLAG`; enable Premium `BLOCK` only if false-intervention performance is independently acceptable.
- The initial checker model recommendation is configurable GPT-5.6 Luna. Do not hard-wire the model into semantics; offline evaluation may compare checker models if false interventions are excessive.
- Preservation invariant: if an accepted answer claim is correct, materially complete for the question, and supported by applicable request-scoped evidence, the checker should `KEEP` it and customer-visible wording should remain unchanged.
- Missing `document_version`, effective dates, canonical URL on local evidence, or exact statutory text alone MUST NOT produce `BLOCK`.
- Different dates, streams, transitional regimes, and factual branches are applicability branches, not automatic contradictions.

### Checker failure and serving policy

- During Phase 6 shadow/baseline calibration, checker timeout, malformed output, provider failure, insufficient remaining time, or deterministic checker-finalization failure is **fail-neutral**: preserve the mechanically valid Phase-5.2 answer, record checker failure/skipped telemetry, and do not start a new research loop.
- Checker failure MUST NOT trigger PFVD/legacy fallback, answer-agent re-research, another checker, or a whole-answer rewrite.
- Before any serving-mode `BLOCK` behavior is activated, define and test the explicit serving failure policy separately; do not infer serving semantics from the dormant pre-Phase-6 prototype.

### Claim and dependency contract

- Material claims must be addressable by stable claim IDs and deterministic draft spans/hashes sufficient for checker filtering.
- Use a compact `depends_on` list where material conclusions rely on premises.
- Unknown dependencies, duplicate claim IDs, impossible claim locations, and dependency cycles are structural failures.
- Valid nested/overlapping addressable claim spans are not automatically legal-quality failures; overlap alone is not grounds for semantic rejection.
- When a serving-mode `BLOCK` is eventually approved, blocking a prerequisite claim MUST trigger deterministic dependency propagation so an invalid dependent conclusion cannot survive unchanged.
- Preserve independent surviving claims and unrelated draft text byte-for-byte where practical.
- Do not introduce fuzzy semantic claim matching as a repair mechanism.

### Runtime, deadlines, and terminal completion

- Start one absolute monotonic backend deadline when FastAPI accepts the allowed query, before state loading or agent setup. It covers state, providers, research tools, continuations, retries, integrity, checker, state/citation commit, and response-critical assembly.
- No component timeout, retry, continuation, research stage, terminal stage, or checker resets or extends the absolute deadline.
- The Phase-5.2 40-second runtime remains the validated historical baseline. Phase 6 implementation should move toward an approximately 60-second absolute hard ceiling so complex agentic research and one checker can coexist without making simple turns slower.
- Under the Phase 6 target budget, keep a strong answer-agent soft ceiling around 45-50 seconds for complex research and preserve enough remaining budget for terminal completion/checking; do not routinely allow the answer agent to consume the entire absolute ceiling.
- Checker desired incremental latency is approximately 3-6 seconds with an approximately 8-second hard checker budget, exactly one checker call, zero checker retries, and zero checker tools.
- The checker latency KPI is incremental latency, not merely total latency. A checker that adds excessive delay fails even if total time remains under the hard ceiling.
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
- Track native web search, exact lookup, Graph/LightRAG, Flat-RAG, deterministic utility, terminal submission, and checker calls explicitly when present.
- Every turn should retain architecture/config/prompt/policy/corpus/checker versions, evidence origins/counts, integrity results, checker `KEEP`/`FLAG`/`BLOCK` identity, omission flags, dependency effects where applicable, state revision, actual citations, cost estimate, and review trace ID as applicable.
- Record checker-only latency separately from total turn latency.
- Observability is part of the architecture. Do not change metric semantics merely to make a new implementation look green; inspect and preserve the intended contract.

### Preserve operational capabilities

- Keep matter identity, authentication, rate limiting, conversation persistence, citations, booking/task handoffs, lawyer-review trace/list/detail/submit/export, container health, and explicit rollback operational.
- Database changes are additive first. Preserve explicit legacy rollback adapters until approved soak/retention gates permit removal.
- The canonical PostgreSQL legal corpus remains authoritative for local exact source content. Derived relationship indexes are rebuildable navigation layers.
- Do not infer, rename, or deploy live AWS resources from local compose. Require authoritative topology and explicit deployment authorization.
- Do not apply migrations merely because they exist; apply migrations only through the controlled migration/deployment procedure when an environment actually needs the schema change.

### Phase 6 testing discipline

- Develop the checker primarily from stored Phase-5.2 answers, claim structures, request evidence registries, and traces. Do not regenerate Luna answers unnecessarily.
- Offline-first is mandatory: contract/prompt/finalizer tests and adversarial fixtures first; focused backend tests during implementation; full backend pytest once near the end; then one small representative live checker gate when offline behavior is credible.
- Do not use a large paid M3-style run as a debugging instrument. Run a broad paid acceptance set only when it can materially change the release decision.
- Do not repeatedly retest frozen Phase-5.2 subsystems unless the checker exposes direct evidence of a regression there.
- Measure preservation and false intervention, not just error catching. False `BLOCK` is a critical safety metric; false `FLAG` also matters. The checker is not considered better because it changes more claims.
- Measure checker completion, checker-only latency, total latency, unknown/cross-request evidence rejection, omission flags, dependency behavior, and failure neutrality.
- Shadow before serving for both Default and Premium. Do not activate customer-visible `BLOCK` behavior merely because unit tests pass.

### Validation before completion

- Before claiming Phase 6 complete, run affected unit/contract/integration tests and report exact pass/fail/skip results. Run the full backend suite once near the end unless a new failure requires another run.
- Hard gates include zero fabricated/unresolved displayed citations, zero request-scoped evidence bypass, zero Graph-only decisive authority, zero blocked-text transmission, zero checker-introduced unsupported claims, zero checker research/tool calls in baseline, and zero silent legacy fallback.
- Test general no-checker behavior, legal/local research, native web research, exact/effective-date questions, cross-schedule references, authority conflicts, checker `KEEP` preservation, `FLAG` uncertainty behavior, high-confidence `BLOCK`, material-omission suspicion, checker timeout/provider failure/malformed output, unknown/cross-request checker refs, URL-less local evidence, missing-version metadata, prerequisite/dependent claims, independent-claim survival, political bypass, lawyer review, rollback, and multi-turn English/Chinese continuity.
- Do not require baseline qualification/hash-patch tests because free-form qualification is not part of the frozen Phase 6 baseline.
- Do not run large paid/live OpenAI evaluations after every small change. Prove contracts locally first, then run a representative bounded live pilot, then the complete acceptance set only when warranted.
- Stop and mark `DECISION REQUIRED` when the frozen architecture or current Phase 6 contract does not determine a material choice. Do not invent a tactical workaround.
- Treat legacy smokes as phase-aware. Classify them as rollback compatibility, obsolete hot-path assumption, or still-valid shared invariant; replace obsolete hot-path assertions with explicit legacy-adapter tests rather than deleting them blindly.

### Prohibited shortcuts

- No mandatory semantic router/classifier before the answer agent.
- No visa/subclass/phrase/language/case-specific routing or answer patch.
- No always-search rule for stable/general turns.
- No local retrieval in Premium.
- No full Default terminal/evidence machinery as a mandatory Premium handoff.
- No checker-as-second-research-agent.
- No checker-side retrieval in the initial baseline.
- No normal answer-model re-research after checker `FLAG` or `BLOCK`.
- No free-form checker qualification/replacement text in baseline Phase 6.
- No automatic whole-answer rewrite after checker failure.
- No fuzzy claim matching, arbitrary URL conversion, fabricated legal metadata, or evidence-gate bypass.
- No silent legacy/PFVD fallback from the corrected runtime.
- Do not increase deadlines/retries merely to hide orchestration or checker defects.
- Do not reactivate PFVD/proposal-first exhaustive verification inside the compact checker.
- Do not reopen frozen Phase-5.2 Graph/exact/corpus/provenance architecture merely to make one checker fixture pass.

### v2.1.3 revision stages and current milestone mapping

The historical v2.1.3 R-stage names remain useful for implementation history, but the current practical milestone is Phase 6 checker work on top of the frozen Phase-5.2 foundation.

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

Do not let the historical ordering imply that already-validated Phase-5.2 foundations should be rebuilt before implementing the current Phase 6 checker contract.

### Current checkpoint notes

- Validated Phase-5.2 practical freeze: `b486590e1c8d90604c9732c388fdf1a75e60fe20` (`fix: stabilize Phase 5.2 evidence submission validation`) on `phase5.2-navigation-research-integration`.
- Earlier integrated Phase-5.2 checkpoint: `e6fbc8b3addb3b13ac7a826f49ca913da3db76f0`.
- Approved Phase-5.1 reliability checkpoint: `f216911a14b6d0ead482b1ede85f971f64a3285d` (`feat: stabilize revised default luna runtime`).
- Phase 5.2 is practically stabilized, not claimed to have passed a final post-`b486590` full paid M3 rerun. The final broad paid rerun was intentionally avoided; focused/local validation and the affected live regression justified proceeding to Phase 6.
- Current approved low-cost answer model: `gpt-5.6-luna`.
- Current recommended initial compact-checker model: configurable `gpt-5.6-luna`.
- Current approved Premium target model: `gpt-5.6-sol`.
- Current revised-Default calibration baseline uses Luna reasoning effort `low`.
- The validated revised-Default/Phase-5.2 runtime has explicit terminal-only synthesis, request-scoped local/native-web evidence, URL-optional local evidence identity, bounded Flat-RAG/tool/retry behavior, Graph navigation, exact legal lookup, and corrected terminal telemetry. Do not regress those contracts while implementing Phase 6.
- Existing dormant checker code is a prototype, not the frozen Phase 6 contract. Do not merely enable `COMPACT_CHECKER_ENABLED`; reconcile schema, verdicts, evidence packet, failure semantics, finalizer behavior, deadline budget, observability, and tests with this file first.
- `COMPACT_CHECKER_ENABLED` remains feature-gated. Phase 6 begins in shadow mode and must not alter customer answers until separately approved serving calibration gates pass.
- Transitional Flat-RAG remains part of the current revised-Default research path; it is not authorization to make Flat-RAG a Premium tool or to bypass future retrieval decisions.
- Model IDs, reasoning effort, tool limits, storage backend, and latency thresholds may change only through configuration plus benchmark/approval; configuration changes do not authorize violating the invariants above.
