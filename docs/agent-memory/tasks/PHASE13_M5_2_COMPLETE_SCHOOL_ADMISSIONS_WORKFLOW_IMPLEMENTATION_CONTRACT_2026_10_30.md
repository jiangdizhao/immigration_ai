# Phase 13 M5.2 — Complete School Admissions Workflow: Integrated Implementation Contract

**Draft date:** 2026-10-30 (Australia/Sydney)  
**Baseline:** `phase13-m5-school-admissions`, M5.1 owner-pushed code `e0b4be5df1eccb2b131af10b3f8c55ae580c5b56` plus this docs-only planning checkpoint  
**Planning disposition:** `M5_2_CONTRACT_PREPARED_NOT_IMPLEMENTED / LIVE_PRODUCTION_NO_GO`  
**Work shape:** ONE integrated, bounded cross-layer code implementation, NOT multiple tiny schema/API/UI/prompts.

## 0. Precedence and constraints

Read `AGENTS.md`; current shared Project state; the Phase13 M0–M10 roadmap and M5 three-milestone plan; the M5.1 closeout/actual implementation code; M2 Fact/Document/Requirement access controls; M3 Education Intelligence provenance and human-review signals; M4 engagement, staff disclosure, payment, exact-version professional review, managed target and fail-closed readiness contracts; the M4 owner deferral decision. Actual repository code is higher authority than stale historical plan paragraphs. Check HEAD/worktree and stop on unexpected branches or changes.

Do not renumber M0–M10. M5.2 is the **second** of exactly three internal M5 development milestones, not a replacement for independent post-M5 E2E. M5.1 source/schema is accepted with limitations, not freely changeable; do not reopen accepted implementation for nonblocking cosmetic drift.

## 1. Product outcome: complete preparation-to-result school journey

Provide a coherent, usable Project-scoped workflow that starts from each M5.1 SchoolApplication and extends through application preparation, Self-Service vs Managed Service selection, defensible conditional pathways, and verified-or-explicitly-unverified Offer/CoE evidence handling.

- Each application remains its own course/delivery/intake and immutable package identity; multiple school applications can progress independently in one Project.
- A Project can also enter via **existing Offer** or **existing genuine CoE** (or verified, authority-sourced exception) without forcing a fabricated new school application. No-Offer and newly received Offer scenarios are distinct. The UI is honest about missing/unknown evidence and enrollment/visa applicability.
- Do NOT conflate customer-reported Offer/CoE, uploaded PDF, human-entered notes and independently verified provider response. Preserve provenance, received/issued dates, source/channel, identity, verification state and audit. Do not parse a document and silently certify authenticity, admission, compliance or visa eligibility.
- M5.2 completes the **internal workflow** only: all actual institutional submissions, provider-side decisions/receipts and legally material real approvals remain disconnected or fail-closed.

## 2. AI-assisted evidence-limited preparation

Implement bounded assistant operations for per-school requirements, missing data, source-linked document/fact reconciliation, drafts/checklists and next-step suggestions. Reuse current M2 per-field fact confirmation, document ownership and distinct publication/AI-use permissions; M3 catalog source identity, quality and possible-options-for-review semantics. Offer user-visible uncertainty, per-claim source/date where available, field/source freshness, and human correction/confirmation.

- AI suggestions/drafts are provisional; no draft becomes customer-approved or professionally approved by model output alone. Do not infer guaranteed admission, scholarship, fees, deadlines, visa outcomes or application readiness from absent school policy evidence.
- Recheck current permissions immediately before any provider call; avoid passing private Project data into logs, telemetry, unrelated chats, source adapters or unauthorized staff contexts. Respect model access, cost, timeouts and config constraints in `AGENTS.md`; offline tests use stub adapters, not paid network model calls.
- Make missing requirements and contradictions visible, not silently resolved. Preserve exact version/hash of generated drafts and the M5.1 package to which they belong. Any material input/authorization change invalidates dependent derived state.

## 3. Separate Self-Service and Managed Service workflow

**Self-Service:**
- Customer-controlled preparation and externally performed submission: record optional customer-reported action with explicit self-report provenance, necessary warning/acknowledgement and timestamp; no automatic third-party receipt or provider confirmation.
- Never display self-reported action as independently confirmed school submission; no automatic lawyer endorsement. External forms/links, if added, must not become API submission authorization.
- Any direct in-system third-party submission remains DISABLED until explicit owner-approved adapter/policy.

**Managed Service:**
- Bind per-school immutable package identity to M4 target `managed_school_application`; use existing engagement, customer acceptance, staff assignment, protected-resource grants, off-platform contractual payment evidence, professional credential/role verification, exact-package review and customer confirmation readiness contracts.
- Never infer authority from `User.role=lawyer`, Project membership, chat participation, VIP tier, a signed text string or synthetic provider acknowledgement.
- Existing M4 authority adapters are unavailable/deny-only; unknown or unavailable professional, signature, finance and provider conditions remain `UNKNOWN`/`NOT_READY`/DENY. Do not modify frozen M4 policies or forge synthetic production READY.
- Formal review requests/decisions may be represented through the existing M4 review contracts, but no protected data is disclosed without its separate authorized grant, and no authentic approval is claimed without verified credentials and exact package match.
- Changing application, documents, requirements, source facts, agreement, approvals, customer scope or payment/assignment invalidates or blocks subsequent authorization. AI cannot overrule these gates.

## 4. Offer, CoE and conditional pathways

For each school response, model distinct **customer-reported**, **document-backed but unverified**, **source-reviewed** and **provider-confirmed only if a genuinely authorized provider exists** states. Track school/application association, original evidence identity, source origin, required-date caveats, evidence version and events. Offer accepted/declined/expired/deferred and CoE obtained/claimed/uncertain must not be collapsed into a single 'approved' boolean. Model missing decisions as `UNKNOWN`.

- Existing genuine Offer may lead to Offer-review path; genuine CoE may lead to next journey stage after its validity/identity/provenance checks. Do not falsely mark M6 Student 500 readiness; M5.2 is school workflow only.
- Exception path may be displayed as potential/needs professional or official review; only verified authority-backed exceptions can be treated as confirmed eligibility to skip school application.
- Unknown school APIs/receipt channels default `not_connected`/DENY. Record no provider-issued receipt or CoE without actually verifiable source evidence.

## 5. Data/API/UI implementation as one unit

Implement necessary minimal additive migrations (draft/unapplied), service contracts, repository/transaction layer, authenticated Project APIs, responsive bilingual Project workflow UI, audit/idempotency and integration tests together. Prefer existing M5.1 `SchoolApplication`, `SchoolApplicationPackage`, `SchoolApplicationOperation`, `SchoolApplicationEvent`, M1 Project, M2 evidence and M3 catalog instead of duplicating those systems.

- Preserve creator-private application ownership, scoped per-resource grants and revocation; staff/applicant flows cannot read another creator's data by generic Project membership.
- Use CAS, exact-authored-request idempotency, bounded input/response sizes, immutable source/history and deterministic package hash/revision; use appropriate transaction boundaries and TOCTOU revalidation.
- Provide coherent progress in one UI: missing items, draft vs evidence, self/managed distinction, Offer/CoE uncertainty and next review. Provide zh-CN and en without claiming automatic official translation.
- New M5.2 feature gate scoped and default OFF, independent of M5.1 if necessary. Existing Standalone Chat, Project Chat, Fast/Legal/Premium modes, Stripe VIP and M4 deny-only runtimes remain unchanged.

## 6. Test and acceptance matrix

At minimum implement executable offline tests for:
1. Three parallel applications and their independent preparation/Offer state; existing-Offer and existing-CoE entry without dummy school application/receipt creation.
2. M2/3 source and access provenance, incomplete and conflicting facts, revoked permissions, customer correction, stale catalog/draft versions; exact package invalidation.
3. AI assistant tools accept bounded, current, authorized inputs, and cannot promote model-generated content to verified or send unauthorized customer data to unapproved providers.
4. Self/Managed separation, VIP independence, staff-disclosure DENY, unknown professional/finance/signature/current-package prerequisites and no false READY or submission.
5. Customer-reported submission/offer vs independently evidenced provider status; negative replay/forgery/expired/bad-identity documents; CoE unknown state.
6. Cross-Project/cross-member/guest/staff unauthorized access, revoked grants and concurrently closed Project; operation replay, CAS conflicts, transaction rollback and audit.
7. Chinese/English Project UI accessibility/empty/error/stale states and feature-OFF legacy flow regression.
8. Real Store PostgreSQL integration tests prepared under a **new explicitly gated, disposable-only harness**. Never use standard database; obtain separate operator authorization before any SQL/migration execution.

Execute permitted focused/broad offline unit checks, frozen M4/M5.1 regressions, lint, migration check and `git diff --check`. Distinguish 44 existing TypeScript errors from actual new regressions; report PASS/FAIL/SKIP without suppressing tests. M5.3 later owns consolidated integrated offline acceptance; post-M5 E2E independently owns frozen M4 failures.

## 7. Explicit exclusions and developer stop rule

Do not perform real school API submissions, browser automation against institutions, third-party email submission, CoE/Offer fabrication, live professional-signature or payment certification, real student data handling, AWS/S3/Stripe, production/staging DB writes, application flag enablement, deployment, PR merge, rebase/force-push, or commit/push code without separate owner authorization. No M4 retroactive test PASS; do not change frozen M4 authority guards to make managed results READY.

If authoritative legal/professional/payment/provider policy is missing, implement a safely failing internal contract and document exactly what authority is required for future activation. Avoid a generic workflow framework or multiphase micro-task cascade; one bounded M5.2 patch followed by one independent comprehensive review and at most a bounded critical correction batch.

**Final status to report if completed:** `M5_2_IMPLEMENTED_PENDING_INDEPENDENT_REVIEW` with changed-file inventory, migration/journal artifact (unapplied), negative tests, test commands/results, error/unknown/provenance matrix, and specific deferred DB/browser/real-provider work.
