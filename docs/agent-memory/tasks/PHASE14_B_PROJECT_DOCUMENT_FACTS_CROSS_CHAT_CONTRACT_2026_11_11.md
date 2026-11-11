# Phase 14-B — Trusted Project Documents, Project Facts and Cross-Chat Context

**Status:** OWNER-APPROVED IMPLEMENTATION CONTRACT / NOT YET IMPLEMENTED  
**Date:** 2026-11-11 Australia/Sydney  
**Repository:** https://github.com/jiangdizhao/immigration_ai  
**Branch:** `phase14-b-project-document-cross-chat`  
**Created from:** `phase14-a-mobile-workspace-navigation` @ `5759500262e935974168981f5d08764795209a31`  
**Work style:** ONE cohesive delivery, focused verification and a single independent cumulative patch review, not many micro-milestones.

## 1. Product outcome

In one Study Journey Project, an authorized customer uploads synthetic CoE, OSHC or visa-related PDF/DOCX/TXT; the system stores an immutable Project Document version, checks trustworthy file processing prerequisites, extracts provenance-linked evidence and proposes useful structured Project Facts. The customer reviews/corrects/confirms the facts and explicitly publishes/grants them for Project AI use. Every chat the same customer owns within **that** Project may use these current authorized facts without asking again, and may retrieve authorized document excerpts when question-relevant. Another Project, Standalone Chat or unauthorized member must not see the file, private facts or chat history.

A user confirming a fact is **customer-confirmed, not government-verified or lawyer-approved**. Generated facts are candidates until explicit confirmation. The system never invents law or file details.

## 2. Reuse existing code rather than build parallel frameworks

Existing Phase 12 pipeline (under `chatbot/lib/matter-documents/processing/`) supports PDF, DOCX and text extraction; the historical legacy `securityStatus=clean` upon storage is **NOT trusted scan attestation**. Reuse the native parser core, but do not confuse legacy MatterDocument (Chat-scoped) with independently owned ProjectDocument.

Existing Phase 13 M2:
- `chatbot/lib/project-documents/`: asset/version/grants/intents, S3 exact version identity, evidence units and reference persistence. Current `runtime.ts` explicitly has `trustedLiveReadiness: async () => false` and `application: null` (this is an intentional fail-closed boundary).
- `chatbot/lib/project-documents/evidence.ts`: exact verified evidence service, currently only parses TXT/Markdown/JSON/CSV with a small 2 MiB limit; extend using the Phase 12 parser for prioritized PDF/DOCX/TXT, keeping bounded processing and provenance.
- `chatbot/lib/project-facts/{facts,postgres-repository}.ts`: ProjectFactAssertion, state transitions, evidence validation, conflict filtering, audience publication and independent `ai_context` grant. Reuse this model, do **not** create a second profile/fact database.
- `chatbot/lib/projects/{context-resolver,project-context}.ts`: persisted Project Chat identity, authorization and `refreshBeforeProvider()`; currently no production trusted Project Evidence resolver. Context packet currently carries at most 4 evidence snippets / 1,500 chars each and 12KB total and incorrectly couples inclusion of a previously verified `document_extracted` fact to whether its source excerpt is selected in those four snippets. Decouple **fact authorization/verification** from **which snippets happen to be sent** without weakening either check.
- `chatbot/components/project-documents-center.tsx`, `project-workspace-home.tsx` for customer-facing surfaces; existing AI Workspace three model modes stay separate.
- `AGENTS.md`, `docs/agent-memory/CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`, `DECISIONS.md` own project authority. Protect Phase 13 frozen restrictions.

## 3. Integrated work

### A. Trustworthy Project Document intake and processing
- Keep private-by-default Project ownership and creator-specific grants; attach asset/version to Project, never silently move a Standalone or Phase12 Chat file into a Project. Owner/member cannot read another member's private bytes merely by membership.
- Reuse existing HTTP/schema, Postgres Project document application, exact S3 object key/VersionId, SHA256, byte size, generation/CAS and immutable audit. Prefer real adapter composition; do not add a second duplicate store or unbounded processing queue.
- A stored object remains `securityStatus=pending` until **independently authenticated, exact-object** clean attestation matches bucket/key + VersionId + SHA256 + generation + Project/version. A raw EventBridge JSON, SQS ID, client field, Phase12 legacy clean status, or magic env flag does NOT prove a safe scan. Failed/skipped/unknown/stale reports fail-closed. If a production-proof issuer/provider or its infrastructure/security approval is unavailable, keep live readiness DENY and report the exact blocker; use injected synthetic scan-proof fixtures **only in offline tests**.
- Reuse Phase 12 parser for PDF/DOCX/TXT (prioritized), preserving bounded bytes, time, provenance page/line/location and partial/error states. No mandatory OCR/vision, XLSX or exhaustive format support now.
- Do not treat file text as official law, verified facts or instructions to the assistant. Extracted content is untrusted customer evidence. Do not reprocess unchanged exact versions unnecessarily.
- Limit accepted real files to owner-approved synthetic testing pending privacy/consent/retention and authenticated producer review. Do not enable live file intake just because a feature flag exists.

### B. Extract candidate Project Facts
- Build a narrow document-field extraction flow after authorized evidence is available. Suggested first fields: applicant name/date-of-birth **only where subject identity is explicitly established**, school, course, campus, start/end dates, CoE identifier, OSHC start/end and document-stated visa class/expiry/conditions. Unknown/ambiguous values remain unknown.
- Generate `document_extracted` Fact candidates via existing ProjectFactManagementService, with valid opaque same-Project `sourceEvidenceRef`, exact document version and locator. A missing/failed source prevents candidate promotion.
- Use deterministic parsing where reliable; optionally one **bounded** structured-model pass for varied PDFs/DOCX if authorized for test execution. Never automatically make AI-extracted values `customer_confirmed`, published or AI-granted. No SFT/new agent framework/reasoning memory.
- Detect conflicts, do not latest-wins overwrite. Keep history; when source version is withdrawn/replaced, previously derived facts become ineligible for future AI use until source/authorization is current. Do not conflate multiple people's attributes; avoid unapproved identity/guardian delegation semantics.

### C. Customer Project basic-information UI
- Add a small truthful "Project basic information" section in Project Home and a review/edit action in Project Documents, built on existing fact repository and authorized APIs.
- Show proposed fields, source file + page/line + exact version where available, needs-confirmation/confirmed/conflicted/stale states, and allow customer to correct/reject and batch confirm.
- Provide a clear affirmative "Confirm and use in this Project's AI" action. Behind one UI action, preserve **distinct** persisted fact confirmation, Project-audience publication and AI-use grant with audit/idempotency/concurrency behavior. If implementing one atomic server operation is unnecessary, maintain safe idempotent steps and clear partial-state messaging; never claim all steps succeeded if only one persisted.
- Allow user to revoke AI permission. Project-wide sharing is for the actor's authorized Project Chats; other Project members require explicit publication/grants, and cannot infer or read private facts, raw files or Chat histories.
- Keep zh-CN/en and Phase 14-A mobile navigation, existing desk layout intact. No fake progress/readiness/lawyer approval.

### D. Cross-Chat AI context
- For every Fast / Legal Check / Premium Project Chat, derive Project ID server-side from persisted `ProjectConversation` and the caller's owned Chat; never trust browser-provided projectId to widen scope.
- Provide a strictly bounded Project Context: (1) eligible customer-confirmed, project-published, AI-authorized, fresh, nonconflicted facts, and (2) separate question-relevant excerpts from trusted, authorized exact document versions when necessary.
- **Important existing defect:** `buildProjectContextPacket()` currently drops a `document_extracted` Fact unless its `sourceEvidenceRef` is among the up-to-four excerpts sent in that turn. Retain facts only after independent server-side evidence reference and current source/permission validation; do not require replaying the source excerpt in every answer. Preserve provenance identifiers and customer-confirmed/not-independently-verified labels. Never relax the limit by dumping every document into context.
- Keep `refreshBeforeProvider()` and ensure revocation, Project switch, source replacement, membership loss and evidence failure are rechecked before the actual model call. No new global chat memory or second ConversationTurn ledger.

## 4. Acceptance — few end-to-end scenarios, not micro tasks

**B1:** Project A accepts synthetic CoE PDF + OSHC DOCX (also TXT smoke), persists exact version and extracts genuine provenance; blocked if trusted scan is not available.  
**B2:** Extract actual school/course/date/insurance candidates; user can review/correct/batch-confirm and grant Project AI use, with correct labels.  
**B3:** A different Chat owned by the same actor in Project A can use confirmed fields without reuploading; can retrieve authorized evidence excerpts when question needs detail; Fast/Legal Check/Premium paths retain their existing boundaries.  
**B4:** Revised conflicting document or revoked AI-use grant invalidates subsequent fact/evidence use; former values not silently used.  
**B5:** Project B, Standalone, revoked member and an ungranted other member cannot get Project A's facts, document bytes or AI context; unverified scan never becomes a legitimate clean source.  
**B6:** Phase 14-A responsive mobile/desktop navigation and prior ordinary Chat/file/legal modes do not regress.

Use synthetic PDFs/DOCXs/TXT, injected mock scan proofs, and focused tests. Guarded disposable PostgreSQL validation can be prepared but **must not execute against any database without explicit owner approval** and an exact approved test-DB target. Do not run real AWS, S3, GuardDuty, SQS, Stripe, paid provider or existing service DB by default. The owner will separately authorize and perform genuine end-to-end staging/sandbox test if approved; offline green ≠ live production ready.

## 5. Required engineering discipline

One cohesive implementation, one concentrated validation and one cumulative review; no M2-A/B/C task explosion, repeated cosmetic correction rounds or mandatory 100% theoretical edge coverage. Test with focused Node suites, changed-file Biome, pnpm build and git diff --check; record actual TS historical baseline differences and genuine failures. Existing unrelated test failure for five vs six Project sections is not a Phase14-B blocker unless directly affected.

Cline may write code, focused tests, documentation, and additive migration **source files** if clearly required, but MUST NOT apply migrations to the ordinary `chatbot`/`immigration_legal`, staging or production DB, or change .env / AWS / secrets. Do not automatically activate feature flags. No commit/push/merge/rebase/force/clean/deploy.

Deliver in repo root (local, untracked): `phase14_b_review.patch` (complete cumulative tracked+new source diff), `phase14_b_report.md` (files, validation results, known blockers, exact owner B1–B6 browser/DB acceptance procedure), SHA256 of patch. Include new files by deliberate `git add -N -- path`; never `git add -A`. Record `IMPLEMENTED_PENDING_OWNER_REVIEW` in `CURRENT_HANDOFF.md` only upon finishing, without falsely claiming live scan or user E2E passed.

**Stop condition:** A coherent reviewable implementation and truthful limitations, not an infinite debugging loop. If an indispensable trust/identity/consent provider is missing, fail closed and report that hard boundary; never fake live readiness to make a test pass.
