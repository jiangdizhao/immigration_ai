# Phase 13 M0-001 - As-Is Architecture Audit and To-Be Boundary Proposal

**Status:** READY TO ASSIGN TO CODEX; **NOT YET IMPLEMENTED / NOT ACCEPTED**  
**Branch:** `phase13-study-journey-project-centric`  
**Owner-known start SHA:** `8b963eea1aa4023d30f31eba816a545efaa65e3d` (documentation commits may have advanced HEAD; verify live)  
**Upstream roadmap:** [PHASE13_STUDY_JOURNEY_ROADMAP.md](../PHASE13_STUDY_JOURNEY_ROADMAP.md)

## Purpose

Read the actual repository plus the six `doc/` attachments and produce a **reproducible, evidence-based implementation inventory and a draft M0 architecture contract**. Do not write feature code, create migrations or change state. Reuse first, redesign only where source evidence demonstrates a gap.

## Mandatory inputs

1. `AGENTS.md` and current `docs/agent-memory/{CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE,DECISIONS}.md`, especially D-009 Phase 12 scoped no-Project decision, durable turns, lawyer sharing, policy intelligence, file/security constraints.
2. `doc/Immigration_AI_Study_Journey_Project_Centric_Architecture_V2_2026-10-22.pdf` and `doc/Study_Journey_School_and_Student500_Facts_Documents_Lawyer_Review_V0.1_2026-10-22.pdf` plus `doc/Picture1.png`, `doc/Picture2.png`, `doc/Picture3.png`, `doc/mermaid-diagram.png`.
3. Read [PHASE13_STUDY_JOURNEY_ROADMAP.md](../PHASE13_STUDY_JOURNEY_ROADMAP.md), including post-PDF owner corrections. PDFs are provisional lawyer-review reference, not certified law.
4. Examine **actual current source**: Drizzle schema/migrations/relations, Chat + ImmigrationConversation + ConversationTurn/turn-ledger, MatterDocument ownership/processing/evidence, policy intelligence and source revisioning, applicant/client portal, lawyer requests/messages/queue/consultations, auth/mode entitlements and Stripe boundaries. Identify precise paths and relevant test files.

## Required output (documents only)

Write `docs/agent-memory/tasks/PHASE13_M0_001_AUDIT_RESULT.md` with these sections:

1. Evidence envelope: branch, HEAD, clean/dirty status, exact inspected paths, current product baseline, test status only when run.
2. As-is data model and APIs: real entities, keys/FKs, auth roots, ownership boundaries, document lifecycle, persisted turn idempotency, policy data, lawyer request/communication, existing UI. Separate VERIFIED, INFERRED, NOT VERIFIED.
3. Reuse / adapt / new matrix: Project, Chat association, cross-Chat evidence, source-of-truth facts, admissions, visa, staff chat, service contracts/payment confirmation (not Stripe), package approvals and external receipts.
4. Draft minimal **to-be relationship map** with Proposed Entities and scope/owner (not migration SQL): Project separate from LegalMatter, per-school Application, visa Application, requirements, immutable evidence versions, sourced Fact Assertions, review/engagement/receipts. Explain Project document ownership coexistence with existing required `chatId` on MatterDocument and legacy read APIs. Record alternative approaches/tradeoffs; choose a provisional recommended route.
5. Proposed v1 input/output contracts for: `ProjectContextResolver`, versioned `RequirementTemplate`, `FactAssertion`, `EvidenceRef`, `ReviewTask`, `ServiceEngagement`, `SubmissionGate` (describe shapes and validations, do not code). Clearly distinguish provider claims vs source-verified facts and Human Approval.
6. State/guard matrix that includes admissions + visa, 3 entrances (no Offer, Offer, CoE), multiple school applications, self vs managed, independent VIP and offline fees, lawyer approval at both managed submission gates, no live submission.
7. Change impact/security review: D-009 supersession scope; migration/additive/rollback strategy; auth and explicit document sharing; per-Project access, cross-Project negative tests, scanned document status; policy/source versioning; lawyer updates; approval invalidation; privacy.
8. M0-002 work items, dependency/decision list, minimal tests and validation needed before implementing M1. Flag decisions needing owner vs lawyer/agent signoff.

## Acceptance criteria for M0-001

- Every implementation claim has file:line or exact function/type link from inspected source; no merely copied handoff guesses.
- Every proposed new entity/guard is explicitly labelled PROPOSED, not existing.
- Exact unchanged code paths relevant to Fast/Legal Check/Premium, VIP and old lawyer requests identified.
- No inferred legal requirements promoted to approved; two PDFs remain provisional.
- A compatibility-first path for Chat-centric file ownership and existing idempotent turn ledger is explained, and at least one alternative discussed.
- Key scenarios and specific authorization negatives included.
- All outputs are docs-only; no DB, migration, AWS, Stripe, external web mutations, paid LLM calls, merges or deployment.
- Relevant updated handoff/milestone/status records accurately say M0-001 AWAITING OWNER REVIEW, not PASS. Do not self-approve.

## Procedure and stopping point

- Before work: `git branch --show-current`, `git status --short`, `git rev-parse HEAD`. If unexpected branch or dirty worktree, stop and report without discarding or overwriting user changes.
- Read the required PDFs with tools available locally; if PDF text/diagrams cannot be extracted, **state the limitation and refer to source manually**, do not make up their contents.
- Avoid full test suites for documentation-only audit; run `git diff --check` and targeted document/structure validation as feasible.
- At the end show changed file list and concise results. **Do not commit or push automatically unless the owner separately authorizes it**. Provide owner review commands and candidate commit/push commands. No next-phase code.
