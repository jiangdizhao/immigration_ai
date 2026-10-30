# Phase 13 M5.1 — Multi-School Application Foundation: Integrated Implementation Contract

**Date:** 2026-10-30 (Sydney)  
**Branch:** phase13-m5-school-admissions  
**Starting code baseline:** M4 HEAD be1255589f8b9f55b0393b3a0cc562d1dbbef154 plus docs-only M5 planning commit  
**Status:** IMPLEMENTATION CONTRACT PREPARED / NOT EXECUTED / NO DB OR PRODUCTION AUTHORIZATION  
**Whole-task rule:** one cohesive implementation; do not turn schema, API, UI, authorization or tests into separate mini-milestones.

## A. Required read-only preflight

- Verify branch/HEAD/status and compare with the M4 baseline. Stop and report if expected branch differs, unreviewed worktree edits exist, or project records conflict; never reset, merge, rebase, force-push or clean.
- Read AGENTS.md and canonical docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE,DECISIONS}.md; PHASE13_STUDY_JOURNEY_ROADMAP.md; PHASE13_M5_SCHOOL_ADMISSIONS_INTEGRATED_PLAN_2026_10_30.md; M4 owner deferral/closeout records; M1 Project foundation, M2 facts/documents/requirements, M3 education intelligence and M4 immutable target/review/readiness contracts.
- Audit actual existing types and repositories rather than inventing duplicate infrastructure. Expected entry points include chatbot/lib/db/schema.ts, chatbot/lib/db/project-foundation.ts, chatbot/lib/projects/, chatbot/lib/project-facts/, chatbot/lib/project-documents/, chatbot/lib/project-requirements/, chatbot/lib/education-intelligence/, chatbot/lib/managed-target/policy.ts, chatbot/components/project-entry-panel.tsx, chatbot/components/immigration-ai-workspace.tsx, chatbot/app/api/projects/[projectId]/, chatbot/lib/db/migrations/meta/_journal.json.
- Existing flags, auth semantics, Drizzle migration journal and run scripts are source-of-truth. Check for an existing School Application implementation before creating a new one.

## B. Deliver complete, usable foundation

1. **Application identity and database model.** Add only necessary additive Drizzle entities and one coherent unapplied migration. Each school application has opaque application ID; canonical Project association; creator/owner; institution/course/delivery/intake identity plus clearly labelled source and validation status; independent lifecycle, revision and audit/operation identity. Support multiple applications to same institution if course/intake differs. Prevent foreign-Project rebind, mutable ownership, unbounded free text and misleading school/source authority.
2. **Authorization and consistency.** Use current authenticated regular customer identity, persisted Project association, Project active state and M1 membership. Treat application details as creator-private by default; membership or even Project ownership must not automatically expose another member's private facts/chats/files/application content. Staff assignment or message participation alone is never a disclosure grant. Mutations use expected revision/CAS and operationId+requestHash idempotency; concurrent edits must have one unambiguous winner; archive is not delete/reuse. Fail closed for missing/partial schema, revoked membership, stale ownership or closed Project.
3. **Source and Project-data references.** Integrate M3 source/catalog identity without representing synthetic or unverified school data as official. Bind M2 fact/requirement/document references to each application with current source-version and owner/permission checks. A reference is not a new M2 ai_context use grant, not document-body retrieval and not M4 protected-resource disclosure; never leak source text or raw private document bytes via school-application APIs. Invalidate or mark dependent snapshots stale on relevant reference/material revision or access loss.
4. **Versioned application package.** Build an immutable, deterministic per-application preparation snapshot, with canonical application+Project+target kind+package version/hash, reference identities and provenance. One document/fact/requirement change must invalidate the affected current snapshot; no silent resurrection on replay. Align the target-identity representation with existing managed-target/policy.ts and the future exact-version professional review without enabling reviews or READY. Do not fabricate application submissions, approvals, offers, CoEs or receipts.
5. **API and workable bilingual UI.** Provide customer-authorized create/list/view/update/archive and snapshot read/build under the existing Project routes; add compact and responsive multi-application management within the existing Project workspace. Visible statuses must distinguish draft/preparing/package prepared/stale from professionally approved or submitted. Show source verification and missing data. At least three concurrent schools can be managed without visiting developer-only endpoints.
6. **Feature gate and compatibility.** Introduce an explicit Phase 13 M5.1 default-OFF feature flag, or reuse an existing appropriately scoped flag if present; document the choice. Preserve Standalone Chat, existing own Project Chat semantics, Phase 12 documents and legacy lawyer requests, Stripe VIP, consultation, policies, Fast/Legal/Premium inference and all M4 deny-only runtime adapters. M5.1 cannot auto-enable any M4 or M5.2 service.

## C. Out of scope

No full AI school application drafting or broad eligibility evaluator (M5.2); no third-party network/application submission; no real school content ingestion or acceptance decisions; no Offer/CoE processing; no school/admission email automation; no real professional licensing, signature/payment certification; no genuine customer data; no privileged staff document access; no production/staging deployment or migration application. The existing failed M4 tests remain deferred to post-M5 E2E; do not patch them or label PASS.

## D. Acceptance matrix (must design and implement tests)

- Three independent school applications under one authorized Project: create/list/reload/update/archive, independent revisions, course/intake distinctions and duplicate requests.
- Authorization negatives: other Project, other member, revoked member, closed Project, staff/admin without explicit policy, guest/unauthenticated, forged projectId/creatorId, missing schema and feature OFF.
- M2/M3 provenance: customer-confirmed != independently verified; synthetically sourced institution != official; no cross-Project or cross-member facts/document leaks; no implicit AI or staff grants.
- Package behavior: deterministic exact version/hash; idempotent replay; material reference change or revocation invalidates package; old package immutable; no fake approvals or receipts.
- Concurrency: stale expectedRevision conflict, duplicate operation replay and simultaneous writes; no partial DB state.
- UI: usable Chinese-first/English alternative, responsive three-school list/detail, honest empty/stale/unverified states; legacy workspace unaffected when flag OFF.
- Repeat focused and broad unit suites where feasible; Biome, TypeScript delta, Drizzle schema check, git diff --check. Distinguish pre-existing errors, failed tests, skipped checks and sandbox limitations. Write DB integration test harness/fixtures but do not run SQL or migration without owner authorization.

## E. Reporting and stop rule

- Deliver one coherent implementation patch/worktree with exact changed-file inventory, code paths, migration bytes/journal changes, test output, potential security regressions, explicit deferred integration tests and known assumptions.
- Do not commit or push implementation until independent review and owner approval. Do not touch AWS, production/staging/normal PostgreSQL, S3, Stripe or any secrets. No broad repo refactor.
- One integrated review plus, if needed, one tightly bounded correction round for evidence-backed critical defects. If safe implementation is blocked by an unresolved authority or schema collision, prefer an explicit fail-closed state and report the concrete blocker rather than invent a policy.
- Completion label may be IMPLEMENTED_PENDING_REVIEW or OFFLINE_VALIDATED only when supported; never database-validated, production-ready, or lawyer-approved without separate proof.

**M5.1 handoff:** next M5.2 may consume the resulting immutable per-school application/package and authorized Project references. The post-M5 separate E2E stage owns all deferred M4 failure revalidation.
