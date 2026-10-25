# Phase 13 M2-A0 — Architect-Bounded Schema Foundation Implementation Packet

**Date:** 2026-10-25  
**Status:** READY FOR OWNER'S EXPLICIT TASK AUTHORIZATION ONLY. No implementation was performed when this packet was written.  
**Design authority:** PHASE13_M2_001_PROJECT_DATA_FACTS_DOCUMENTS_CONTRACT.md, architect-controlled R1 (2026-10-25).

## Objective

Implement ONLY the additive database and typed foundation of Project-owned immutable document assets/versions, explicit grants and processing-run provenance. This is not the Project document service and does not make Project files accessible in UI or model context.

## Approved code-task envelope (if owner launches this packet)

1. Add Drizzle table definitions: ProjectDocumentAsset, ProjectDocumentVersion, ProjectDocumentGrant, ProjectDocumentProcessingRun. Use same-project composite FK targets, restrictive deletes, immutable byte identity, unique storage keys, version numbers/generations, and valid-state/digest constraints.
2. Keep source provenance optional and non-authorizing. Do not add direct MatterDocument or Chat FK that could transfer ownership, nor create source-file read APIs.
3. Define typed state enums for pending/stored/failed/cleanup_pending storage, pending/clean/rejected/failed security, and run started/completed/failed; do not assume a completed upload or scanner result.
4. Generate the next additive Drizzle migration and snapshot/journal entry only after verifying current branch HEAD and journal index 30. If source drift is found, STOP and report.
5. Implement focused schema/contract tests and guarded integration tests against ONLY the fixed disposable database immigration_ai_phase13_m1_1_test. Do not run reset/migration on chatbot, immigration_legal, staging, production or any unknown DB. For destructive test-db reset follow existing guard and report exact connected identity.
6. Preserve existing M1.1–M1.4, Phase 12 document functionality and 3 widget paths; make the new data foundation inert and unreachable at runtime.

## Explicitly forbidden

No Project document APIs, uploads/imports/downloads, S3 work, scanner or extraction jobs, public feature flag, Project facts, templates, context resolver, professional grants, account/person association, applications, legacy file security hotfix, AI changes, arbitrary PostgreSQL migration, commit/push/deployment. No changes to current ProjectOperation/ProjectEvent enum allow-lists until a separate mutation task. No source-specific case patches or invented professional requirements.

## Tests / verification

Use focused unit/schema tests, guarded Postgres FK/check/version constraint tests on the named disposable DB, pnpm db:check, relevant existing M1 regressions, Biome and git diff --check. Report baseline TypeScript diagnostics separately from newly introduced ones. No test skips may be described as PASS. Do not call paid models or external services.

## Deliverables

A small reviewable uncommitted diff, exact schema/migration artifacts, focused test results, list of unresolved questions and safe rollback/forward plan. Append an honest M2-A0 implementation status to CURRENT_HANDOFF / CURRENT_MILESTONE / PROJECT_STATE; do not mark M2 accepted. Export a cumulative review patch to ~/phase13_m2_a0_review.patch including untracked files; no files in /tmp. Stop for independent review; no commit or push.
