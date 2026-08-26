# Phase 7.2 — Lawyer Supervision and Evaluation Bank Foundation

Phase 7.2 is a control-plane milestone. It turns an explicitly authenticated
lawyer review into typed offline supervision and regression material without
changing customer-serving answers.

## Data flow

```text
AnswerTrace / immutable ExperienceRecord
    -> authenticated lawyer review
    -> AnswerReview (mutable operational workflow)
    -> ReviewArtifact: phase7_review_record
    -> explicit materialization decision
       -> phase7_evaluation_case
       -> phase7_reasoning_lesson_candidate
    -> deterministic offline Evaluation Bank / replay
```

`AnswerReview` remains the existing mutable review record. `ReviewRecord` is
the canonical typed supervision payload stored in a `ReviewArtifact` row.
`ExperienceRecord` is read only during review/admin materialization and is
never rewritten. Existing legacy reviews are not backfilled automatically.

## Provenance and legacy reviews

The server-side lawyer-review proxy authenticates `LAWYER_REVIEW_TOKEN` and,
only for a configured matching token, sends the private
`X-Lawyer-Review-Assertion` using `LAWYER_REVIEW_ASSERTION_SECRET`. The
legal-service compares that secret in constant time. Browser values and
reviewer names/roles cannot establish authoritative provenance. Development
proxy bypass is non-authoritative and sends no assertion. Direct backend
requests without the assertion remain compatible but are not promoted to
lawyer-reviewed supervision; explicitly materialized records default to
`system_generated` and `unclassified`.

Synthetic/manual records cannot use `lawyer_reviewed` provenance. The eight
pre-existing `AnswerReview` rows remain operational legacy records and are not
converted into Phase-7 artifacts at startup or during bootstrap.

## Review artifacts and versioning

The only Phase-7 artifact types are:

- `phase7_review_record`
- `phase7_evaluation_case`
- `phase7_reasoning_lesson_candidate`

Payloads use strict Pydantic contracts, allowlisted trace/snapshot fields, and
canonical SHA-256 payload hashes. The semantic fingerprint excludes generated
envelope fields and drives idempotency; the stored-payload integrity hash
covers the complete typed payload except its own hash. Creation and read
verification share one canonicalization helper. Repeating the same
materialization reuses the existing logical artifact. Changed content creates
a new immutable payload version and marks the previous artifact `superseded`;
the old JSON payload is never overwritten. Review-record creation and its
canonical artifact are committed synchronously. Optional materialization
failures are returned as explicit `failed` statuses so the review can be
retried. Every materialization locks its parent `AnswerReview` row with
PostgreSQL `SELECT ... FOR UPDATE`, providing cross-process serialization for
one review without a new uniqueness constraint.

## Evaluation Bank

Evaluation cases are regression material, not legal authority. A valid linked
ExperienceRecord is preferred and its snapshot hash is recomputed before it is
trusted. Ambiguous exact links fail closed; only a backend-observed request
identity may be used as fallback, never `client_turn_id`. Such lawyer-reviewed cases may be `active`. Cases without an
ExperienceRecord are explicitly tagged `source_integrity=legacy_trace_only`
and remain `draft`; they are excluded from the default active bank. A bad
snapshot hash prevents active case creation and never repairs the immutable
record.

The review API provides list/get operations over typed cases. Default
selection is `phase7_evaluation_case`, `artifact_status=active`, and
`provenance=lawyer_reviewed`, excluding synthetic provenance and origin.
Synthetic cases require explicit inclusion and are never merged into
lawyer-reviewed quality metrics. Malformed or hash-invalid historical payloads
raise an explicit validation error. `get_case()` is an admin-style inspection
operation and exposes `eligible_for_default_regression`.

Correct, minor-issue, and material-issue reviews may all be explicitly added
to the bank. Corrected answers and accepted positive answers are retained only
as reviewed reference material; replay never requires byte-for-byte answer
equality and no legal expectation is fabricated.

## Reasoning lesson boundary

`ReasoningLessonCandidate` stores only exact, explicitly supplied lawyer
strategy text. It remains lifecycle `candidate`, is never approved, embedded,
retrieved, or injected into a prompt. No `ReasoningLesson` persistence or
ReasoningBank runtime exists in this phase.

## Deterministic replay

`Phase7ReplayService` accepts an `EvaluationCase` and a supplied
`CandidateRunObservation`. It performs no model, web, retrieval, graph, or
checker-provider call. Supported checks are explicit claim IDs, prohibited
claims/behaviors, checker outcomes, positive-case false-`BLOCK`, latency/tool
thresholds, evidence characteristics, and supplied architecture violations.

Each metric is `PASS`, `FAIL`, or `NOT_SCORED`. Overall replay is `FAIL` when a
scored metric fails, `PASS` when at least one metric is scored and all scored
metrics pass, and `NOT_SCORED` when no deterministic criterion is available.
For a lawyer-reviewed correct case, `BLOCK` always independently fails the
`false_block_on_positive_case` metric, even if an expected checker outcome is
also present.

## Isolation, rollback, and limitations

No Phase-7 artifact is evidence, an `evidence_ref`, RequestEvidenceRegistry
entry, Phase-6 checker input, citation, or serving prompt context. Default,
V2, and Premium serving paths do not read Phase-7/review stores. Phase 6 is
unchanged. Disabling the Phase 7.1 archive does not disable review workflow;
it simply means new cases may be legacy-trace drafts until an immutable
experience exists. ReviewArtifact payload identity/content is protected by an
ORM update guard; direct SQL mutation remains possible but is rejected by
read-time hash validation. ReviewArtifact rows rely on the existing operational
AnswerReview retention policy: deleting an AnswerReview cascades its artifacts,
and this phase adds no delete API or schema. Evaluation Bank durability
therefore assumes AnswerReview records are not destructively deleted.

Phase 7.2 tests use injected fake sessions and an explicit guard against the
configured `SessionLocal`. No authoritative database writes are part of the
unit-test path.
