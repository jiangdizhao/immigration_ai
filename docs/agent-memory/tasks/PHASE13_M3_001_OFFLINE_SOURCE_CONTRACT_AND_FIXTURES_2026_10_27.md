# Phase 13 M3-001 — Offline Education Source, Identity and Field Provenance Foundation

Created: 2026-10-27
Status: DISPATCH READY / NOT IMPLEMENTED
Branch: phase13-study-journey-project-centric
Expected base HEAD at dispatch: the pushed M3 design-doc commit (owner must fast-forward first)
Authority: PHASE13_M3_EDUCATION_INTELLIGENCE_ARCHITECTURE_2026_10_27.md, AGENTS.md, CURRENT_HANDOFF.md, DECISIONS.md.
Scope: one bounded, no-side-effect coding task. No requirement for another architecture approval.

## Goal

Implement a pure, isolated TypeScript kernel for official education *source identity*, provider/course/delivery/intake identity, immutable synthetic source observations and field-level provenance/uncertainty. This is the data-contract foundation of M3, not a live course finder.

## Allowed locations (smallest necessary additions only)

- chatbot/lib/education-intelligence/contracts.ts (new): typed discriminated domain contracts and structural validators; source family, entity-scope identities, source/snapshot/field observations and field-resolution statuses.
- chatbot/lib/education-intelligence/identity.ts (new): deterministic normalization and exact keyed identity helpers; no fuzzy merge or invented CRICOS codes.
- chatbot/lib/education-intelligence/field-resolution.ts (new): deterministic per-scope/field candidate grouping and bounded resolution, returning UNKNOWN/KNOWN/CONFLICTED/STALE/NOT_APPLICABLE/WITHDRAWN with explicit reasons and provenance. If unsupported date/authority reasoning is required, return UNKNOWN rather than assume.
- chatbot/lib/education-intelligence/fixtures.ts (new): synthetic fixture factory for ELICOS, VET, undergraduate, coursework-master and research, plus multi-campus/intake and conflict variants. Use reserved *.example URLs and explicit TEST_ONLY/SYNTHETIC marks; no fabricated current official data presented as real.
- Matching focused *.test.ts files colocated with these pure modules.
- docs/agent-memory/CURRENT_HANDOFF.md, CURRENT_MILESTONE.md, PROJECT_STATE.md: only concise status append/prepend describing exact uncommitted implementation and tests; do not change architecture/decisions.
No other existing code modifications unless a genuine import/test compatibility blocker is explained first. No changes to Git config.

## Contracts to honor

- Provider ID, CRICOS provider code, course ID, CRICOS course code, institution internal code, delivery campus/site and intake are different dimensions; stable identity depends on scope and evidenced external values, never name alone.
- A field observation has exact source family/source ID/snapshot ID/URL or locator, hash, observation time and field applicability; date fields distinguish retrieval, publication, effective date, application deadline and intake.
- Fee fields have currency (if evidenced), international-student audience and basis (total/annual/semester/unit) and year/period; incompatible fee units must never auto-merge.
- Unknown and stale are first-class; a latest failed parse cannot erase historical support; two materially conflicting still-applicable candidate values cannot silently resolve to one.
- Distinguish observed official-source data from approved school admissions criteria; do not introduce lawyer approval or official validation from a string flag.
- Fixture code can use synthetic records with full explicit scope and provenance; validators must prevent a synthetic fixture accidentally masquerading as live.
- Explicit boundedness: set reasonable maximum records, lengths and per-field candidates; deterministically reject invalid types, cross-entity provenance and ambiguous identities. Avoid arbitrary real-world facts in fixtures.
- No real network, no source crawling, no new model prompts or provider calls, no database connection/schema/migration, no AWS, no route/UI, no cross-Chat writes, no policy sync. M2 and Standalone behavior must remain byte-for-byte unchanged.

## Focused test matrix

1. providerCode versus courseCode identity; same course title at two schools; repeated school with separate campuses/intakes.
2. Explicit missing fee/deadline/prerequisite => UNKNOWN; no zero/default invented.
3. Fee comparison requires matching international-student audience, currency and basis; incompatible => scoped nonresolution/conflict.
4. Unverifiable text cannot become authoritative just by declaring source family; malformed source URL/identity rejected.
5. Same snapshot hash/idempotent candidate produces stable outcome; changed snapshot retains provenance and old observation history.
6. Contradictory same-scope claims => CONFLICTED; stale claims are flagged separately from current facts, no silent winner.
7. No inferred official date/deadline from an intake term, no school admission success from CRICOS status.
8. Five synthetic pathway fixtures plus multi-campus/intake, unknown, withdrawal and conflict negatives.
9. No private Project Fact/Document or existing Policy Intelligence module imported by this new kernel.

## Validation & stop condition

- Read package scripts; run focused Node/TypeScript tests for the new files.
- Run full pnpm test:unit if practical in current supported environment; compare repository baseline rather than calling existing unrelated diagnostics new failures.
- Run pnpm db:check only as a read-only schema check if available; no database mutations.
- Run changed-file Biome and git diff --check. Explicitly report any sandbox-only limitations and their correct owner-host retry commands.
- Do NOT claim whole M3 passed; this completes only M3-001 after independent review and owner test.
- STOP before commit/push or implementing M3-002. Deliver exact file list, test counts, behavior contracts, cumulative uncommitted patch path and SHA-256, git status, known limitations, and any blockers. Do not contact AWS, run live web fetchers, or add a migration.

## Exit

Reviewed source and offline fixtures clearly support a later M3-002 additive database implementation. The verifier can reproduce cases of ambiguous identity, absent fees/deadlines and contradictory source claims. Inference, customer data and other project modules remain unchanged.
