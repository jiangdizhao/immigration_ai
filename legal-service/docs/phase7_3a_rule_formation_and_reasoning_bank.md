# Phase 7.3A — Rule formation and ReasoningBank governance

Phase 7.3A is an offline/control-plane foundation. Its bounded flow is:

```text
ReasoningLessonCandidate -> RuleCompilerPacket -> externally supplied
RuleCompilerOutput -> ReasoningRuleProposal -> quality gates -> explicit
ReasoningRuleDecision -> immutable ReasoningLesson successor versions
```

The compiler service only builds an allowlisted packet and future prompt text;
it makes zero provider calls. It receives strategy text, provenance, issue
categories, claim IDs, scope, and compact evaluation/contrast summaries. It
never receives legal chunks, evidence text, citations, secrets, environment
state, or hidden reasoning. A compiler may return zero to three proposals.

## Rule and quality boundaries

Rules are procedural only: `research_strategy`, `evidence_strategy`,
`fact_elicitation`, `reasoning_strategy`, and `failure_avoidance`. A rule is a
structured WHEN/APPLY IF/DO/VERIFY/AVOID/LIMITS record, not a prose blob or a
legal proposition. The deterministic gate requires all of those structures,
explicit case-erasure and procedural-only confirmations, and rejects URLs,
emails, UUIDs, request/evidence/source/chunk identifiers, dates, declared
source residue, legal-proposition residue, and long normalized source copies.
The scanner is only a hard-residue detector; passing it does not prove
generalization. Lawyer or simulation approval and later held-out transfer
evaluation are separate semantic safeguards. Transfer validation is deferred
to Phase 7.3B.

Titles are limited to 180 characters; structured fields have at most eight
items and 400-character items; `lesson_text` is at most 2,000 characters; IDs
are bounded; and the serialized payload remains subject to the strict typed
contract. The limits are provisional, tunable operational safeguards.
`lesson_text` is rendered deterministically from the structured fields, so
identical structured rules render identically.

## Namespaces and approval

`real` rules require every source to be a live-interaction,
`lawyer_reviewed` source and require the private trusted lawyer assertion.
Simulation rules require `synthetic_test` provenance and `synthetic_test` or
`manual_fixture` origin. Candidate, experience, and evaluation-case lineage is
resolved from persisted artifacts and canonical hashes. Candidate history is
fail-closed; experience support must be derived from trace-compatible candidate
lineage; and REAL evaluation support uses active default-regression eligibility.
There is no namespace conversion and no cross-namespace support, merge,
revision, or conflict. The governance call separately requires explicit
case-erasure and procedural-only confirmations; body fields, reviewer
names/roles, and compiler output cannot authorize real writes.

Phase 7.3A can create only `approved` or `retired` rules. A new rule is
`approved` and `unvalidated`; `shadow` and `active` are rejected and reserved
for later milestones. Governance state (`normal`, `conflicted`, or
`quarantined`) is separate from lifecycle. Capacity limits are read from normal
configuration (defaults: 150 current non-retired rules and 50 per rule type).

Every proposal receives an explicit action: `approve_new`, `merge_support`,
`revise_existing`, `mark_conflict`, or `reject`. Exact normalized duplicates
are rejected for a new rule; semantic consolidation is never automatic and
uses no embeddings, similarity judge, or LLM. Merge support preserves the
semantic body and creates a new version with unioned support IDs. Revision
keeps the logical key and replaces the formulation. Conflict creates a stable
conflict group and immutable conflicted successors for both current rules;
there is no automatic winner. Rejection records a decision and creates no
rule. Retirement creates an immutable retired successor. Capacity defaults to
150 current non-retired rules globally and 50 per rule type, and is configurable;
capacity
blocks only new rules, not consolidation or retirement.

## Storage, state, and isolation

No table or migration is added. Proposals, decisions, and rules use
`ReviewArtifact`; its foreign key is a deterministic storage anchor (the
lexically first source `AnswerReview` ID), not the sole source. All source
candidate/review/experience IDs remain in the typed payload. The inherited
Phase 7.2 `ReviewArtifact` cascade means deleting an anchor review can delete
the artifact even when other source links remain; this residual limitation is
not silently changed in 7.3A.

Every bank mutation first takes a deterministic PostgreSQL transaction-scoped
`pg_advisory_xact_lock` for its namespace. This is the bank-wide, cross-process
serialization for capacity, duplicate detection, and successor identity.
After that lock, all involved parent review rows are locked with `SELECT ... FOR
UPDATE` in sorted ID order to protect source/anchor consistency. Fake-session
tests prove only that the lock is requested and ordered; they do not prove
PostgreSQL locking. Each mutation is enclosed in a caller-owned transaction's
savepoint and flushes its mutations before the savepoint can succeed.
Payload/type/parent fields remain immutable; only artifact status may transition.
Reads validate every historical row, canonical SHA-256, and the version chain,
failing closed on ambiguity. Terminal proposal decisions are single-assignment:
identical retries return the prior result and conflicting retries fail. Decision
reason codes participate in terminal identity; governance notes are not stored.

The read-only bank state reports current, approved, retired, conflicted, and
quarantined counts, per-type counts, configured capacity, unresolved proposals,
and a deterministic digest of normalized logical current rule state. Storage
UUIDs and timestamps do not affect that digest. Mutable usage counters are
intentionally absent.

The review/admin routes expose candidate, proposal, rule, and state inspection,
plus real compiler-output/decision/retirement controls. Simulation writes remain
internal service operations. Duplicate detection is exact normalized
fingerprinting only; semantic consolidation remains human-governed. The
hard-residue scanner detects case-specific residue but does not prove semantic
procedural generalization; trusted approval and Phase 7.3B held-out transfer
validation remain necessary. No frontend work, customer-query route, serving
read, retrieval, embedding, prompt injection, Phase 6 input, or
`RequestEvidenceRegistry` integration exists. ReasoningBank is not consulted
by any customer answer path. Canonical ReasoningBank and governance artifacts
contain no free-form case narrative; lawyer commentary remains in the Phase 7.2
review record.
