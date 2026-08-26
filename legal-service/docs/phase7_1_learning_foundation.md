# Phase 7.1 — Learning Infrastructure Foundation

Phase 7.1 adds a passive Experience Archive. A completed Default interaction
may be stored as one immutable `ExperienceRecord` containing a canonical
`phase7.experience.v1` snapshot and its SHA-256 hash. The archive is historical
observability, not runtime knowledge.

`AnswerTrace`, `AnswerReview`, and `ReviewArtifact` remain the existing passive
lawyer-review sidecar. `ExperienceRecord.answer_trace_id` may link an archive
snapshot to its AnswerTrace, but the responsibilities remain separate:
AnswerTrace carries mutable review workflow state; ExperienceRecord is an
append-only historical snapshot.

The snapshot contains explicitly allowlisted request, compact matter state,
accepted answer structure, claims/dependencies when present, citations,
content-free research/observability metadata, request-scoped evidence metadata
when a registry is supplied, Phase-6 status/result metadata when available, and
version/provenance metadata. It does not store hidden chain-of-thought or
arbitrary process/environment state. Secret-like fields are removed by the
archive sanitizer. Reported evidence refs are kept separate from registry-
authoritative evidence refs; Schedule Graph/navigation output is never promoted
to evidence.

The current live Default proposal/verification path uses bounded local/live
retrieval objects rather than `RequestEvidenceRegistry`; the registry exists in
the separate shadow AgentRuntime path and is not archived as a live interaction.
If a future serving completion supplies the live registry, the archive copies
its bounded entries before disposal, while keeping model-reported refs in a
separate field.

The `PHASE7_EXPERIENCE_ARCHIVE_ENABLED` flag defaults to `false`. Serving
capture is Default-only. Premium behavior is unchanged. The archive writer has
no provider, retrieval, prompt, checker, or ReasoningBank dependency. It is
fail-open: database or serialization failures are logged and return no archive
ID without changing, retrying, or rewriting the customer answer. A non-null
request ID is unique, so retries return the existing row and never update its
snapshot. Serving hooks dispatch the writer asynchronously after the response
path has completed, so archive storage is not a customer-visible latency
dependency. There are no archive update/delete service or API operations.

The future Evaluation Bank and ReasoningBank remain contracts only. Evaluation
cases are lawyer-reviewed regression material, while ReasoningBank lessons are
curated reasoning strategy memories. Neither is runtime authority, evidence,
citations, answer prompt context, or Phase-6 checker input. Provenance values
(`lawyer_reviewed`, `user_feedback`, `synthetic_test`, and `system_generated`)
remain distinct; synthetic input cannot be labelled lawyer-reviewed by the
contracts.

## Schema and local validation

`ExperienceRecord` is registered in `app.db.models`, so normal new-database
`Base.metadata.create_all()` bootstrap includes it. `create_all` also creates
the missing table in an existing database without altering existing tables.
For an explicit additive upgrade, review the target environment and run
`scripts/ensure_phase7_1_schema.py` through the approved database procedure.
That helper also installs only the named PostgreSQL append-only trigger and
function for `experience_records`; application bootstrap invokes the same
narrow safeguard after table creation.
Do not run it against the authoritative host database without authorization;
it is not an invitation to modify corpus data or apply a broad migration.

Run focused Phase 7.1 tests, relevant regression tests, `python -m compileall -q
app`, `git diff --check`, and the complete backend pytest suite. No paid/live
calibration or learning workflow is part of this milestone.
