# Phase 5 Exit Acceptance Matrix

Status: frozen evaluation package, 2026-08-20

This matrix applies to paired `luna_web` (Arm A) and `luna_flat_web` (Arm B)
runs from `pilot_manifest.json`. It is an evaluation contract, not a serving
policy and not a legal answer key.

Those arms remain historical comparison artifacts. The revised v2.1.3 Default
target is the explicitly named `luna_default_local_web` arm, which uses the
existing local retrieval tool plus native web search and must be analyzed as a
separate mode rather than silently relabeling historical Arm A.

## Baseline

- Target answer model: GPT-5.6 Luna.
- Reasoning effort: read from each run's existing trace; do not assume it when telemetry is absent.
- `tool_choice`: `auto`.
- Arm A: provider-native `web_search`, deterministic utility, `submit_answer`.
- Arm B: Arm A plus bounded transitional `flat_rag_search`.
- No checker, Sol, LightRAG, router, prompt patch, or production traffic change.
- One case identity, as-of date, response language, and starting state must be paired across arms.
- `run_manifest.json` records whether the source manifest defines the complete pilot scope separately from whether the selected execution covers the complete automated pilot.

## Hard Gates

A gate is `pass` only when its observed count is zero and the required signal is
present. `unmeasured` is not a pass and blocks a final exit decision until the
missing signal is supplied by structured trace or adjudication. The analyzer
writes these states to `analysis.json`.

| Gate | Required result | Primary measurement |
| --- | ---: | --- |
| Cross-request evidence use | 0 | Explicit `cross_request_evidence_use_count`; absent telemetry remains unmeasured |
| Guessed/invalid canonical EvidenceRef | 0 | Request-scoped ref/locator rejection codes |
| `INVALID_EVIDENCE_REF_FORMAT` | 0 | Terminal submission error codes |
| Privacy leakage | 0 | Explicit `privacy_leakage_count` or restricted adjudication; search-privacy guard violations are reported separately |
| Unbounded retry/tool loop | 0 | Provider-call, tool-round, retry, and continuation bounds |
| Deadline reset | 0 | Monotonic `remaining_deadline_before_call_ms` sequence |
| Silent architecture fallback | 0 | Explicit fallback counter and expected model/arm identity |
| Unsupported decisive legal claim accepted | 0 | Explicit postcondition/adjudication field; never inferred from question text |

A failed hard gate is a Phase-5 hold. An unmeasured hard gate is also a hold,
because missing telemetry cannot be treated as safety evidence.

## Measured Metrics

Report by arm and by useful category, with counts as well as rates:

- completion, accepted terminal runs, controlled incomplete submissions, failed runs without accepted submission, timeout, and error;
- submission attempts, accepted attempts, attempt acceptance rate, missing submission, and continuation count;
- content-safe terminal contract counts for claim/citation evidence forms, unregistered refs, duplicate citations, claim-text failures, and missing citation evidence;
- postcondition pass/reject and rejection reason categories;
- canonical local and native-web evidence counts, source authenticity, authority kind, binding status, controlling candidates, and suitable evidence counts where emitted;
- provider calls, tool calls, tool rounds, native web calls/sources/citations, Flat-RAG calls, retries, and utility calls;
- latency P50, P90, and maximum, plus provider and tool duration when present;
- input/output/reasoning tokens where reported;
- token availability as `complete`, `partial`, or `unmeasured`; partial totals must not be compared as paired deltas;
- search-privacy guard violations, separately measured leakage, deadline exhaustion stage, and remaining-deadline telemetry;
- authoritative-research recall, unnecessary research on stable/general cases, and current-information tool recall after manual review.

Stable/general and boundary cases should normally complete without legal
research. Current non-legal cases may use current-information web research but
must not invoke legal-only retrieval merely because they are current. A
controlled incomplete substantive result is safe only when no unsupported
decisive answer is accepted or served.

## Exact/Applicability Gap

Count an applicability-gap co-occurrence only when the same attempt contains
content-safe classification reports all of the following:

1. `source_authenticity_counts.canonical_official > 0`;
2. `authority_kind_counts.delegated_legislation > 0`;
3. `binding_status_counts.binding > 0`;
4. `controlling_candidate_count > 0`;
5. `suitable_evidence_count == 0`; and
6. the postcondition reasons include `NO_DOCUMENT_VERSION`, `NO_EFFECTIVE_INTERVAL`, or `NO_APPLICABLE_INTERVAL`.

Report `applicability_gap_case_count`,
`cooccurring_candidate_claim_count`, reason counts, and inspected
classification counts. The co-occurring candidate count is not a proven
claim-level cause count because current content-safe telemetry aggregates
postcondition reasons at attempt level. Do not weaken the postcondition or
infer applicability from retrieval time. Interpret the result only after lawyer review:

- rare and controlled: expected Phase-5 limitation;
- common but attributable to the planned next evidence stage: possible Phase-6 dependency;
- systemic across representative authoritative cases: architecture correction candidate and Phase-6 blocker.

## A/B Decision Rule

Compare the same case IDs and starting state. Preserve separate scorecards for
Arm A and Arm B, then report paired deltas for completion, accepted terminal runs, controlled
incomplete submissions, postcondition outcome, latency, provider calls, tool
calls/rounds, native web calls, Flat-RAG calls, tokens where available,
version/applicability case signals, and terminal failures. Do not create a
composite winner score.

Flat-RAG is justified only by measurable, lawyer-confirmed legal value that
outweighs added calls, latency, cost, failure surface, and complexity. Aggregate
completion alone cannot override a hard-gate failure or a fatal legal error.

## Manual Review Gate

Review approximately 10-15 representative cases using
`manual_review_template.csv`. Score each artifact 0-5 on legal correctness,
issue spotting, source authority, source applicability, reasoning coherence,
uncertainty handling, and clarity/usefulness. Track fatal errors separately;
do not average them away. A reviewer must mark whether the observed problem is
the applicable A1-A12 code in `phase5_exit_failure_taxonomy.json`, and may
assign more than one code when evidence supports it. A1-A5 and A9 may be
automatic when structured telemetry supports them; A6-A8 and A10-A12 require
adjudication or explicit review codes.

## Staged Execution

- Manifest: 39 cases, 35 automated single-turn and 4 stateful/manual.
- Stage 1: eight automated single-turn cases under Arm A.
- Stage 2: the same eight automated single-turn cases under Arm B.
- Stage 3: the remaining 27 automated single-turn cases under both arms.
- Stage-to-arm contracts are strict: Stage 1 is Arm A only, Stage 2 is Arm B only, and Stage 3 requires both arms.
- Keep each stage's output directory and `run_manifest.json`; do not merge rows without preserving arm, case, stage, SHA, and manifest version.

The current shadow runner executes only automated single-turn cases. The four
cases with a `turns` fixture are `stateful_manual` and remain available for the
manual/stateful review slice; a stateful harness must preserve the same
matter/session across those turns before using them as conversational-state
evidence. Combined exit analysis merges Stage 1, Stage 2, and Stage 3 artifacts
without rerunning cases.
