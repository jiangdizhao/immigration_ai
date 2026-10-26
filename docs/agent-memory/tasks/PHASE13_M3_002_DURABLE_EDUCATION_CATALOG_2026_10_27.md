# Phase 13 M3-002 — Durable Education Catalog: normalized schema and repository

Created: 2026-10-27
Status: DISPATCH READY / NOT IMPLEMENTED
Working branch: phase13-study-journey-project-centric
Accepted M3-001 code SHA: f13cb89f5e27248d9b7eaff96290d2c8cebfc1b9
Codex dispatch HEAD: newly pushed docs-acceptance commit after owner fast-forward sync.

## Objective

Add an isolated PostgreSQL persistence layer faithful to the existing M3-001 EducationDataset contract, keeping its provenance, exact identities, source-specific field semantics, immutable history and synthetic/unverified distinction. Provide a transactional, injectable repository with bounded scoped reads that reconstruct inputs for the existing deterministic field resolver. It must not affect customer runtime, Policy Intelligence, Project, Standalone Chat or Legal Service.

This is a bounded engineering task. Author an additive migration and tests, but DO NOT APPLY any migration to any database, even disposable, until explicit owner approval naming the target and operation.

## Canonical references

Read AGENTS.md, current handoff/milestone/state/decisions, M3 architecture PHASE13_M3_EDUCATION_INTELLIGENCE_ARCHITECTURE_2026_10_27.md, M3-001 acceptance matrix, existing chatbot/lib/education-intelligence/{contracts,identity,field-resolution,fixtures}.ts, chatbot/lib/db/schema.ts, migrations journal, Drizzle config, migration operator and existing guarded schema/integration tests.

Current remote baseline: migration journal ends at 0039_phase13_m2_round2_event_actor_scope. If unchanged, plan next migration as 0040; examine Drizzle snapshots and manual 0039 metadata convention BEFORE generating. Never fabricate a missing snapshot, rewrite historical migrations or make unrelated generated schema changes.

## Seven independent catalog tables

1. EducationProvider: M3 opaque string ID (not UUID-only); RecordClass; required displayName; optional legalName/aliases/category and evidence-supported CRICOS provider code.
2. EducationCourse: M3 opaque string ID; FK to Provider; required title, optional qualification/sector/CRICOS course code/institution code; never title-only uniqueness.
3. EducationDelivery: M3 opaque string ID; FK to Course; optional evidenced campus/site IDs, city, state, mode; city text alone is not identity.
4. EducationIntake: M3 opaque string ID; FK to Delivery; optional intake code, term, year, exact start and deadline; same code in different years must not collide; ambiguous identity must not be silently merged.
5. EducationSource: ID, family, RecordClass, original/canonical HTTPS URLs, language, accessMode and scope CATALOG or PROVIDER. Provider-scope FK must be real and optional only for CATALOG. Enforce exact family+canonicalURL+scope uniqueness with correct Postgres NULL behavior, e.g. separate partial unique indexes for catalog and provider-scope sources.
6. EducationSnapshot: ID and source FK, CAPTURED/FAILED_FETCH/FAILED_PARSE, separate observedAt/retrievedAt/publication/effective dates, optional hash/parser/locator/excerpt, immutable history. A-B-A repeated source content is valid history; SHA is not the sole record ID or global unique key.
7. EducationFieldObservation: opaque ID; exact target scope Provider/Course/Delivery/Intake, fieldKey, claimDomain, disposition, typed value (JSON), RecordClass, source snapshot and source identity, locator, content hash, observed/effective dates. Enforce exactly one target using nullable typed target FKs plus CHECK, or an equivalent database-level integrity design. Use source/snapshot composite relationship or rigorously checked transaction invariant; never accept cross-source spoofing.

No institution/CRICOS registration string becomes a legal or admissions approved status by DB insertion. Current contract RecordClass is SYNTHETIC or UNVERIFIED — there is no live VERIFIED path.

### Integrity requirements

- Additive named keys/FKs/RESTRICT, justified unique/partial indexes, constraints on scope, enums, lengths and coherent required fields. Avoid cross-domain FKs into Project, LegalMatter, M2 facts or Policy Intelligence.
- Snapshot and field observations append-only (narrow table-specific DB write/delete protection where feasible, plus no-update repository API). No broadly attached trigger like the old 0035 side-effect defect.
- Preserve source/observation/evidence ownership, exact sourceURL, hash and locator; validate in the transaction. No invented source dates, hash, effective dates, official status or fees. Reject contradictions/collisions or leave fields explicitly unresolved; do not auto-pick the latest.
- Normalized strong identifiers only where actually supported; missing external IDs are null/unknown, not fabricated. Test provider/course code non-confusion and cross-provider separation.
- No private user, Project, customer transcript or personally identifying fields in these public/general catalog tables.

## Repository contract

Create a server-only injectable catalog repository in chatbot/lib/education-intelligence/ following local Drizzle style (no global database action on module import).

- Transactionally ingest a validated EducationDataset graph with exact referenced parents. Use existing validateEducationDataset and supplementary constraints for persistent cross-batch identity; reject invalid/oversized graphs BEFORE side effects.
- Replay exactly identical opaque records idempotently; a repeated ID with altered immutable contents must produce a deterministic integrity conflict, not overwrite existing snapshot, source identity or observation. Concurrency must converge correctly via DB uniqueness/transactions, not preflight-only check.
- A-B-A capture, failed parse/fetch attempt and different snapshot IDs preserve observed history. Do not deduplicate all history merely by content hash.
- Bounded exact-target/source-scope reads reconstruct a complete, internally consistent dataset for M3-001 resolver, including required entity parents, associated sources/snapshots and relevant attempt history. Fail explicitly if a bound prevents a truthful result; never silently truncate.
- Preserve UNVERIFIED/SYNTHETIC evidence semantics, resolving through existing deterministic resolver, not a new trust mechanism. No public endpoint, scheduled background job, crawler, AI matching, UI or model call.

## Tests and validation

- Structural offline tests: exactly seven isolated relations, FK and append-only constraints, partial source identity uniqueness, migration journal continuity (0039 byte-unchanged), no unrelated SQL/Drizzle schema drift.
- Repository-focused unit tests: successful multi-entity ingest, identical replay, mutated duplicate rejection and transactional rollback, cross-source snapshot mismatch, mismatched field target, ambiguous identities, same intake term in different years, A-B-A and failed extraction history, missing fee, conflicting fee scope and RecordClass segregation.
- Separately OPT-IN Postgres integration test for an exact owner-authorized disposable database. It must check the configured and live DB names and migration ledger BEFORE any database operation. Do not apply migrations or mutate the current populated Phase13 test DB merely to make the tests pass. Mark unavailable real-DB tests UNVERIFIED / NOT RUN, not PASS.
- Run explicit M3 focused tests; changed-file Biome, git diff --check, pnpm db:check and full pnpm test:unit if available. Compare TypeScript errors against the existing 44 preexisting diagnostics; report new errors separately. Existing unit test script does not automatically include M3 tests.

## Hard stop

NO migration execution whatsoever: no db:push/db:up/db:migrate/db:migrate:operator, direct DDL, integration setup mutation, clearing schema, reset, or test-record changes against any DB without fresh explicit exact-target approval. Migration FILE authoring only.
NO live CRICOS/school fetch, HTTP, AWS, payment, paid model, real-person cases, actual customer files, production deployment, Project permissions, Policy Intelligence serving, or M3-003. If migration generation cannot be safely reconciled with existing journal/snapshot conventions, stop and report a concrete blocker instead of inventing a success.

## Completion report

Leave all changes uncommitted/unpushed. Report exact diff and schema relations, migration ID, index/trigger/rollback behavior, idempotency/atomicity approach, ALL test counts/skips and unverified DB gate, changed TS diagnostics, a cumulative patch with SHA-256, git status/base HEAD, explicit host verification commands and known limitations. Update current project state docs as pending independent review only. STOP before M3-003.
