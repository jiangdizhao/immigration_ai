# Phase 7.3B — Synthetic self-evolution and held-out transfer

Phase 7.3B is an offline experiment harness for testing whether a generalized
procedural lesson can transfer to unseen process-reasoning tasks. It is not a
legal-quality test, a production usefulness test, a lawyer-equivalence test, or
a deployment authorization.

## Synthetic world and split

The benchmark is a fictional regulatory micro-world explicitly marked `NOT
AUSTRALIAN LAW` and `NOT LEGAL AUTHORITY`. It contains five procedural
families: decisive missing facts, cross-reference dependency, retrieval miss
versus nonexistence, temporal/version applicability, and navigation versus
evidence. Each family has one source case, two held-out positive-transfer
cases, and two negative controls. A source failure produces a lesson; source
success produces `NO_LEARNING_SIGNAL`. Source cases never count as transfer.

`SyntheticTaskInput` is experiment metadata plus a strict
`SyntheticTaskVisibleInput` projection. Only that projection reaches runner
prompts. `RetrievalQuery` contains only the question, bounded facts, and
task-visible observations. Task IDs, family/split labels, oracle fields, and
fixture roles are never model-visible. The oracle is used only after model
execution by the deterministic evaluator. Held-out scoring cases and negative
controls are rejected by the Phase-7.3B compiler adapter.

## Learning pipeline

The fixture pipeline is:

```
source run → deterministic supervisor → candidate → actual 7.3A prompt
→ strict compiler draft → 7.3A proposal/quality gate → explicit simulated
governance → temporary simulation bank → lexical retrieval → baseline/memory
paired runs → deterministic evaluation → cumulative interference report
```

The supervisor is a deterministic substitute for future lawyer feedback. It
maps failed evaluator metrics to bounded generalized process feedback; family
metadata does not determine the feedback. Its candidate uses `synthetic_test`
provenance and is never `lawyer_reviewed`.
`Phase73RuleCompilerService` remains provider-free. Phase 7.3B invokes its
allowlisted packet/prompt through a separate provider boundary and constructs
the authoritative packet/output envelope on the server.

## Storage and governance

Each run creates a temporary SQLite database and exercises the existing
Phase-7 artifact chain where needed: synthetic matter, trace, review,
experience, evaluation case, candidate, proposal, decision, and rule. The
store rejects non-SQLite URLs and authoritative PostgreSQL identifiers before
`Base.metadata.create_all()`. SQLite registers a simulation-only no-op for
`pg_advisory_xact_lock`; this does not weaken PostgreSQL 7.3A locking.

Simulation rules use `simulation`, `synthetic_test`, and
`simulation_offline`. The curator rejects quality-gate/residue/provenance
failures and otherwise applies an explicit fixture-directed governance action.
It does not claim to be a lawyer. The synthetic curator has an explicit policy:
quality/provenance/source-residue failures are rejected, exact normalized
duplicates use `merge_support`, and clean new procedural rules use
`approve_new`. No rule is promoted to `shadow` or `active`.

## Memory boundary and retrieval

`ReasoningGuidancePacket` is the only memory representation given to the
memory condition. It contains only structured procedural rule fields and
retrieval metadata, with the notice `PROCESS GUIDANCE ONLY; NOT EVIDENCE; NOT
LEGAL AUTHORITY; MUST NOT BE CITED`. It has no evidence/citation/source-case
fields. The deterministic lexical retriever normalizes with Unicode NFKC,
case-folding, and whitespace normalization. One threshold and `top_k <= 3`
apply to the entire run; weak matches are rejected in favor of no memory.
Only current approved/normal simulation rules are eligible.

The baseline and memory prompts share the same system instructions, task-visible
payload, model, and settings. Only the guidance section differs; baseline
observations are cached by task-visible fingerprint, model/settings, and repeat
index. Memory rules cannot satisfy evidence citations, and navigation
hints/search absence/model memory are not synthetic evidence. Source question,
facts, evidence text, baseline answer, feedback, and candidate text are checked
for normalized leakage before a rule is governed and again before guidance is
used.

## Evaluation and metrics

Runner output is strict structured data: disposition, requested facts,
research actions, claims with supporting synthetic evidence IDs, cited evidence
IDs, bounded answer text, and architecture flags. No hidden reasoning is
requested or stored. Primary scoring is exact and deterministic against the
oracle: disposition, required/prohibited actions, missing-fact requests,
claims, evidence validity, required evidence, navigation/evidence separation,
and architecture invariants. Provider failure, timeout, and malformed output
are represented separately and paired results are `NOT_SCORED`.

Reports include baseline/memory pass rates and delta, per-repeat results and
counts, improved/regressed and unchanged cases, retrieval precision (null when
there was no retrieval), irrelevant and negative-control retrieval, no-memory
rate, memory-as-evidence violations, source leakage, architecture violations,
rule counts, and per-stage cumulative regressions. A five-family repeats=1
live run is preflighted at 5 source baselines + 5 compilers + 20 evaluation
baselines + 60 cumulative memory calls = 90 maximum calls. Baselines run once;
each stage evaluates only families with governed rules so far. Any unresolved
provider/budget/metric failure prevents `MECHANISM_SUPPORTED`.

Each cumulative stage also records its stage index, bank count and digest,
evaluated families/case count, baseline and memory rates, positive-transfer
improvements, negative-control regressions, retrieval counts/precision,
no-memory and negative-control retrieval rates, provider-error count, and
stage-scoped evidence/leakage/architecture violations. Retrieval precision is
`null` when the stage selected no rules.

Fixture pack v1 is infrastructure-only and reports authored fixture
transitions, never model efficacy. Versioned v2 is an independently authored
`live_efficacy_pilot` pack and is selected explicitly for live work; fixture
mode remains the normal offline validation path.

## Live safety and artifacts

Fixture mode uses deterministic fake providers and no network. Live mode
requires `--live`, `PHASE7_3B_LIVE_ENABLED=true`, explicit compiler and runner
models, an efficacy-capable v2 pack, a bounded timeout, and `--max-live-calls`
(maximum 100; default 100). The Responses provider sends no web, retrieval, or
custom tools and uses zero retries; every HTTP attempt consumes one budget
unit. Runner and compiler responses use strict `responses.parse` contracts;
the compiler contract contains semantic draft fields only, with packet
identity, lineage, evaluation metadata, and governance confirmations kept
server-side. `--live-compiler-smoke` is a separately gated one-call compiler
diagnostic using a temporary simulation store; it does not run the experiment,
runner, bank governance, or authoritative database path. Live mode is a
separate execution step and is not run by normal tests.

Local reports go under `legal-service/.phase7_3b_runs/<run_id>/` and contain a
manifest, learned rules, retrieval JSONL, paired-run JSONL, JSON report, and
Markdown summary. They contain no credentials, raw hidden reasoning, or
authoritative `ReviewArtifact` rows. Phase 7.3B has no serving import and does
not read the real ReasoningBank or alter Phase 6/evidence behavior.
