# Cline Execution Prompt — Phase 14-B Project Documents + Facts + Cross-Chat

Paste the content below into a fresh Cline task after syncing the Phase 14-B branch. The approved technical contract is the authority; this is its executable instruction.

---

You are the Cline implementation engineer for **Immigration AI Phase 14-B**. Deliver **Trusted Project Documents + Project Basic Facts + Cross-Chat AI Context** as **one cohesive, bounded feature implementation**, not as micro-milestones. Preserve prior Phase 14-A code and accepted Phase 13 architecture.

## 0. Local development and Git identity
- Repository: `https://github.com/jiangdizhao/immigration_ai`.
- Required working branch: `phase14-b-project-document-cross-chat`. It was branched from accepted `phase14-a-mobile-workspace-navigation` @ `5759500262e935974168981f5d08764795209a31`. The new branch contains planning document commits beyond this SHA; verify its **actual current HEAD and origin**, do not assume the base SHA is its tip.
- Ubuntu clone: `/home/rico/immigration_ai` or `~/immigration_ai`.
- Frontend/runtime: `~/immigration_ai/chatbot`, Next.js / React / TypeScript / Drizzle / pnpm, `pnpm dev`; local Web usually `http://localhost:3000/ai-workspace`. Read `chatbot/package.json` and pnpm lockfile for actual scripts and versions.
- Legal backend: `~/immigration_ai/legal-service`, FastAPI; approved interpreter `/home/rico/anaconda3/envs/torch/bin/python` (Conda `torch`). Retain existing Fast/Legal Check/Premium behavior, do not redesign their model/research pipeline.
- Databases in the owner's normal environment: host PostgreSQL on `127.0.0.1:5432`, app DB `chatbot`, legal corpus DB `immigration_legal`. Stale Docker `5433` is not authoritative. **Do not connect to or mutate any DB** absent a separate owner-approved exact disposable database identity and run. You may write additive migration source only if needed.
- AWS historical settings: profile `aulawyers-staging`, region `ap-southeast-2`. No AWS/S3/GuardDuty/SQS/Stripe/cloud calls, paid model runs, real customer files, migrations or deployment are authorized by this prompt.
- Never read, disclose, edit, commit or copy secrets from `chatbot/.env.local`, `legal-service/.env`, AWS credentials or `~/.pgpass`.
- Production status remains `LIVE_PRODUCTION_NO_GO`. M2 Project Document trust is DENY, M4 professional authority unavailable, M6 legal source coverage PARTIAL, and M8 Staff private-package authorization PENDING. Do not bypass these gates.

## 1. Verify current source and read authority BEFORE modifying files
Run `git branch --show-current`, `git status --short`, `git rev-parse HEAD`, `git log --oneline -6`, and `git ls-remote origin refs/heads/phase14-b-project-document-cross-chat` in the existing clone. If wrong branch or conflicting dirty state, stop and request owner direction; never reset, clean, merge, rebase or switch in a way that could destroy work.

Read:
1. `AGENTS.md`.
2. `docs/agent-memory/tasks/PHASE14_B_PROJECT_DOCUMENT_FACTS_CROSS_CHAT_CONTRACT_2026_11_11.md` IN FULL — immediate approved contract.
3. `docs/agent-memory/CURRENT_HANDOFF.md` (newest sections), `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`, `DECISIONS.md`.
4. Relevant actual code/tests, especially `chatbot/lib/matter-documents/processing/`, `chatbot/lib/project-documents/`, `chatbot/lib/project-facts/`, `chatbot/lib/projects/{context-resolver,project-context}.ts`, `chatbot/components/{project-documents-center,project-workspace-home,immigration-ai-workspace}.tsx`, and the three widget chat routes. Inspect project role/grant APIs/schema as needed. Source and tests outrank stale historic handoffs.

## 2. User-visible outcome to implement
A customer within **Project A** can:
1. Upload synthetic CoE PDF, OSHC DOCX and/or TXT to a Project-level document library; store precise immutable version and provenance, with trustworthy scan state. No false `clean` on storage completion.
2. Automatically produce **candidate** basic information (school/course/campus, course dates, CoE reference, OSHC dates, document-stated visa expiry/type, and name/DOB only where the actual subject is established). Show original document version + page/line locator per candidate. Ambiguous/missing values remain unknown.
3. Review, correct, reject or **batch-confirm** candidates in the Project UI. One clear affirmative customer action may trigger confirmation + Project publication + AI-use grant, but the server must persist those as separate auditable decisions and report partial failure honestly. Client confirmation is not official/legal verification.
4. Open a different **owned Chat in the same Project** and have Fast, Legal Check or Premium reuse **authorized confirmed Project Facts** without re-uploading the document; access short question-relevant document evidence excerpts separately when a detailed file question requires them.
5. Revoke AI-use permission or replace an exact file version: later conversations cannot continue using stale/revoked evidence or dependent facts. Detect conflicting dates instead of silently overwriting.
6. Switch to Project B or standalone Chat and observe **zero automatic Project A data**. An ungranted Project member may not read the uploader's private document/fact merely because both belong to the Project.

## 3. Implementation guidance — keep it integrated and minimal

**A. Project file trust and parser adapter.** Reuse M2 ProjectDocumentAsset/Version/Grant/ProcessingRun/ProjectEvidenceRef, existing S3 exact-VersionId+SHA256+size identity, and Phase12's native PDF/DOCX/TXT processor. Do not replatform storage. M2 `project-documents/evidence.ts` currently parses only text/Markdown/JSON/CSV; enable actual project-evidence extraction for the three agreed formats with bounded run/locators and explicit partial/errors. Exact scan attestation must come from an **authenticated** approved producer matching the immutable object and generation; mere Phase12 legacy clean, client payload, EventBridge JSON or a manually toggled env var is not proof. The production `project-documents/runtime.ts` intentionally has `application: null` and `trustedLiveReadiness: async()=>false`. Implement real composition only to the extent there is genuine, reviewable authority; if an indispensable signed/verified scan producer or privacy/retention approval is absent, keep production DENY, use synthetic injectable proof only in offline fixtures, and list the blocker clearly. Do not fake green live paths.

**B. Extract and persist facts.** Reuse `ProjectFactAssertion` with `originKind: document_extracted`, source-backed `evidenceRef`, existing `propose/confirm/publish/grantAIUse/revokeAIUse/stableProjection` contracts. New candidates are never automatically customer-confirmed or lawyer-verified. Keep subject identity explicitly tied to customer confirmation; don't turn a Project owner into the applicant by default. Add only narrow client-facing orchestration/endpoints and lightweight bilingual Project Home/Documents UI; do not build a second fact table or generalized person/guardian authority system.

**C. Cross-Chat provider wiring.** Derive `projectId` solely from server-persisted ProjectConversation + actor-owned Chat. Reuse `resolveProjectContext()` and `refreshBeforeProvider()` for Fast/Legal Check/Premium. Provide *two* bounded context layers: authorized, fresh, confirmed Project Facts, and separately selected relevant trusted document excerpts. Critical fix: currently `buildProjectContextPacket()` only includes a document-extracted fact if its source reference happened to be among the at-most-four excerpt snippets in this answer. Verify the evidence/source/grant **independently on the server**, so eligible facts are not lost merely because the source excerpt is omitted for token economy. Retain source reference and `customer-confirmed; not independently verified` label. Never fix this by shipping all files or weakening the evidence verification gate.

**D. Guardrails, no extra architecture.** Preserve private member boundaries and exact-version approval, deny-by-default, per-purpose grants, project isolation and chat history authorization, audit/versioning and existing model modes. No SFT, new RAG memory, separate ConversationTurn ledger, new scheduler, framework, broad refactor, payment/professional approval or government submission. All untrusted document text stays data rather than runtime instructions.

## 4. Verification and one stop rule
Use a compact integrated acceptance suite with synthetic files and injected fake scan attestations:
- B1 exact PDF/DOCX/TXT extraction and persistence (or explicit fail-closed when production scan unavailable).
- B2 extract source-linked candidate fields and customer confirm/modify/reject/batch grant.
- B3 same-Project Chat B uses authorized facts without reupload; detailed query can use selected evidence, in all three existing serving paths.
- B4 supersession, conflict, revoked AI grant and stale source prevent future reuse.
- B5 Project B, standalone, revoked member, foreign owner and missing verified scan never receive private data.
- B6 Phase 14-A mobile/desktop and baseline chatbot behavior remain intact.

Run focused Node tests and targeted existing suites, Biome only on changed files, `pnpm build`, `git diff --check`, report TypeScript diagnostics against prior historical 44 (do not claim zero diagnostics if legacy ones persist). You may prepare a guarded disposable PostgreSQL integration runner, but **do not run it against any database** without separate owner approval. Do not call AWS, paid providers or attempt real synthetic S3 writes unless separately authorized. If live trust is blocked, label `LIVE_NOT_VERIFIED / TRUST_DENY` while still delivering reviewable offline integration. Cline must not claim real end-to-end AWS or owner browser PASS.

Make one integrated implementation, one concentrated validation, and at most **one correction pass for genuine blockers** (cross-Project data exposure, permission bypass, invalid provenance, corrupted facts, primary flow broken or build failed). Cosmetic issues and stale unrelated tests are recorded, not an excuse for R1/R2/R3 micro-cycles.

## 5. Deliverables and Git discipline
Leave all changes **uncommitted and unpushed**. Create in the local repository root, not `~/` or `/tmp`:
- `/home/rico/immigration_ai/phase14_b_review.patch` — **full cumulative** tracked plus added source diff (use deliberate `git add -N -- <new file path>` for newly created files; no blanket `git add -A`).
- `/home/rico/immigration_ai/phase14_b_report.md` — changed files, architecture reuse, code/test command results with PASS/FAIL/SKIP, exact real blockers, security/consent limitations, and B1–B6 owner acceptance instructions.
- Calculate and report `sha256sum phase14_b_review.patch` and changed-path inventory; leave generated patch/report untracked and out of the future commit.
- After real implementation is finished, prepend one concise `IMPLEMENTED_PENDING_OWNER_REVIEW` entry to `docs/agent-memory/CURRENT_HANDOFF.md`. Never falsely mark actual browser test, AWS scan, DB migration or lawyer/legal review as passed.

**No commit/push/merge/rebase/reset/clean/deploy; no DB/AWS mutations or secrets.** Stop with your two artifacts and a concise truthful completion report. The owner will submit the cumulative patch for independent ChatGPT review before any source commit or live environment decision.
