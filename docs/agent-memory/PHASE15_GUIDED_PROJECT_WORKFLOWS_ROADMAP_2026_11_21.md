# Phase 15 — Guided Project Workflows, Durable Project State & Global AI Assistant

**Date:** 2026-11-21 (Australia/Sydney)  
**Owner decision:** Five-milestone Phase-15 plan APPROVED; documentation/branch setup AUTHORISED.  
**Current implementation checkpoint (updated 2026-11-23):** M1 engineering accepted and committed at `6b7c531ee2839e9a955dfd992b5e19a560fa6064`. M2 and M3-01/M3-02 exist only as uncommitted local work and remain subject to owner/relevant browser acceptance; M3 Extended E1–E4 are planning-approved, not implemented or execution-authorized by this update. The original Phase 15 kickoff statements below are historical.   
**Branch:** phase15-guided-project-workflows  
**Base:** phase14-b-project-document-cross-chat @ f23094b3dda90d304db81f99401a44dfc3e3e8ac  
**Release:** LIVE_PRODUCTION_NO_GO remains. A planned engineering milestone is not a live customer capability.

## 1. Why this phase exists

Recent owner screenshots and lawyer/customer-workflow feedback show three fundamental product problems:

1. A Project Home and School Application page expose numerous technical states but do not answer a customer's first question: where am I, what should I do next, why, and who acts?
2. A customer may have already entered school/course/application data, yet a new Chat inside the same Project behaves as if the project is blank. Prompting only with confirmed Project Facts and authorized document excerpts does not amount to full project awareness.
3. One fixed School → Admissions → Student 500 route cannot represent DIY applications, a customer who already has an external Offer or CoE, a visa-only engagement, several simultaneous school applications, or agent-mediated school admissions.

The owner additionally requires the assistant to understand the project as a whole, use current and relevant official school and Australian migration material, answer arbitrary project questions, selectively elicit missing facts only after the user expresses an intent, and—with explicit preview and confirmation—help update real business drafts. The signed-service workflow must serve direct school agents, external Australian first-tier agents and possibly domestic Chinese referral/preparation partners; DIY users must keep a viable separate route. AI should lower the training burden for responsible English-capable domestic staff, without substituting for authority, consent or real-world evidence.

**Phase objective:** One durable, authorized project state drives both the customer workspace and a capable project-wide assistant. The assistant can explain and act on that state (only through authorised, confirmable operations), with a visible, branching work journey and staff/partner workflows. This is not a chatbot-only UI rewrite.

## 2. Five integrated milestones

| Order | Milestone | Primary product outcome | Acceptance owner |
| --- | --- | --- | --- |
| **M1** | Durable Project State & Progress Engine | Project status survives chat closure and reflects authorized business changes and dependencies | Owner + technical reviewer |
| **M2** | Global Project AI Assistant & Official Intelligence | Any new Project Chat can answer open-ended project questions and reason from current records plus relevant official sources | Owner + legal/domain reviewer where material |
| **M3 Extended** | Multi-Workflow AI Interactive Workspace & Confirmed Actions | Shared resizable three-region shell, profile-specific School/Student 500 workflows, grounded overall progress, step-aware AI + dynamic task tools, and confirmed business readback | Owner + UX reviewer |
| **M4** | DIY, Engagement Scope, Partner Routes & School Handoffs | Each school application follows the correct DIY/direct-agent/first-tier-agent route with real forms, roles and receipts | Owner + business/lawyer reviewer |
| **M5** | Domestic Staff Copilot & Integrated Acceptance | Assigned workers can handle normal intake with less re-entry, while the client sees trustworthy progress | Owner + new worker + business/lawyer reviewer |

**M3 planning amendment:** The detailed 2026-11-23 [M3 Extended multi-workflow UI plan](./PHASE15_M3_EXTENDED_MULTI_WORKFLOW_UI_PLAN_2026_11_23.md) governs M3's revised interaction design. It does not supersede M1/M2 technical acceptance boundaries or change M4/M5 ownership.

These are exactly five substantive milestones, NOT dozens of micro-phases. A bounded correction may be accepted within the same milestone when evidence shows a main-path, data-integrity, legal or authorization defect; do not start indefinite cosmetic subprojects.

### M1 — Durable Project State & Progress Engine

**Goal.** Establish a backend-owned, persistent and reproducible account of what the Project and each individual application are trying to achieve, what has happened, what remains, who is responsible, what is blocked, and what evidence supports that conclusion. The state must be correct even with no active chat.

**In scope.**
- Define canonical ownership of project goal, service scope, each School/Admissions/Student 500 application, stage, dependencies, current status, responsibility, missing requirements, authorized next actions, status history, timestamps and provenance. Project-level overview must compose several applications without silently merging their private records.
- Reuse existing Study Journey Project, School Application, Admissions, Student 500, Project Facts, versioned submission packages, review/operation/events and authorization boundaries. Prefer a typed projection/reducer over these records rather than inventing a second mutable source of truth.
- Distinguish draft / user-reported / confirmed / document-supported / external receipt / professionally reviewed; distinguish no data from unavailable data, conflicts, inapplicability, waiting, and blocked. Never equate generated package, agent acknowledgement and school receipt.
- Recompute affected progress/next steps after permitted draft edits, file/version invalidation, partner actions, official requirement changes where evidenced, authorization revocation and staff/customer updates. Preserve idempotency, CAS/concurrency controls, independent per-school identities and readback after restart.
- Expose one permission-aware state and drill-down contract that M2 and M3 can both consume. A valid visa-only or externally obtained Offer/CoE path must not require a platform-created School Application.

**Acceptance.** Synthetic Project A contains two school applications plus a visa matter. With chats closed, change intake date in school A using a normal business route; after readback and process restart, A's dependent package becomes stale, B stays unchanged, actor/waiting status is accurate, and history explains why. Retry the same operation and test concurrent edits. A visa-only Project can mark School Application not applicable and proceed to the actual prerequisites; access revocation changes the next read. No false success when source data or authorization is absent.

**Exit:** M1 engineering evidence + owner review. Does not imply the future assistant, visual route, or live deployment is ready.

### M2 — Global Project AI Assistant & Official Intelligence

**Goal.** On any new conversation inside a Project, answer the user's open-ended questions in the context of the whole authorized Project—not merely the chat transcript or the handful of facts that happened to fit a static prompt.

**In scope.**
- Resolve authenticated actor + persisted ProjectConversation/Chat owner at the server; retrieve from M1 the overview and query-relevant details: school applications, dates, materials and versions, Student 500 status, progress, blockers, event history, assigned responsibility, authorized facts and documents when trusted.
- Use bounded on-demand retrieval rather than placing all raw project data in every prompt. Separate project truth, user assumptions, proposed changes, official rules, and conclusions. Refresh authorization and material state before the provider; preserve existing distinct Fast / Legal Check / Premium contracts and no cross-Project/Standalone/staff-private leakage.
- Support natural questions such as “Which school is waiting?”, “Why ask for the same transcript again?”, “What changed since last week?”, “What if I defer a semester?”, “What can I do while the agent is waiting?”, and “Does current policy affect this pathway?”. Clarify which application only when ambiguity materially affects the answer.
- After the user first states intent/facts, intelligently search/recheck relevant **official** university/CRICOS/education and Australian migration sources, including versions, source dates, commencement, transitional cases and official uncertainty as relevant. Do not interrogate the user on entry. Ask only impactful missing questions, cite actual applicable evidence, and flag unavailable/stale/conflicting sources. A plan or earlier retrieval is not permanent proof of current law.
- Proactively suggest *questions or next actions* within the active interaction, without unsolicited notification loops or unauthorized edits. Offer a precise contextual lawyer consultation/message when domain-specific professional judgment is needed; public advice and a contracted lawyer's response remain separate.
- Persist only the appropriate verified/confirmed state via M1; hypothetical analysis must never mutate the application. M2 can recommend draft changes but actual write-back is gated until M3.

**Acceptance.** A fresh Project Chat, with no previous thread context, correctly answers multi-school status, duplicate document request, deferred intake impact, responsibility and policy questions using source identity. Test with owner-created paraphrases not copied into prompts. Hypothetical “what if” makes no DB writes. Run one official-rule-update scenario and one official-source-unavailable scenario with honest answers; revoked member, unrelated Project and standalone chat do not see private state. Material legal claims require the existing evidence/safety paths.

**Exit:** Owner accepts truthful project-wide assistant behavior in bounded test scope; no assumption that all legal sources are complete or current without real checks.

### M3 Extended — Multi-Workflow AI Interactive Workspace & Confirmed Actions

**Owner-approved M3 scope amendment (2026-11-23):** See the [complete M3 Extended UI, workflow, interface and E1–E4 delivery plan](./PHASE15_M3_EXTENDED_MULTI_WORKFLOW_UI_PLAN_2026_11_23.md). The original M3 intent—guided Project journey plus explicitly confirmed AI-assisted business changes—remains; the main interaction is redesigned following the lawyer/business owner's **school-application example**, and **Student 500 Visa Application receives an independent first-class Workflow Profile**, not copied School steps. This is **not** a sixth Phase-15 milestone.

**Goal.** One shared **Project Header + Left Step Rail + Centre Step-aware AI Chat + Right Dynamic Task Workspace** interaction for School Application, Student 500-only and genuinely combined Projects. A keyboard/pointer-accessible **draggable divider** adjusts centre/right widths, with an appropriate mobile alternative. The top-right persistent progress bar and **“View Project Progress”** action open real, grounded progress/dependency details without displacing current work. The M3-02 Journey projection may feed the rail and detailed progress view, but must no longer monopolize the central work surface.

**In scope.**
- Introduce conditional, versioned **Workflow Profiles**, not a single School→Admissions→500 checklist. School stages may include starting point, real course search/compare, academic/language/financial preparation, documents and pre-submission. Student 500 stages independently cover applicant/visa context, genuine CoE/study evidence, GS, financial/conditional supporting materials, pre-lodgement and external status; they are **product templates** whose applicability depends on trusted facts and current official requirements. An existing external Offer/CoE, visa-only route or two parallel schools must remain valid.
- Reuse M1 \`phase15.project-state.v1\` and existing business services; add only necessary confirmed Project Goal, conditional task/progress projection and source-revision contracts. Overall \`completed / applicable\` metrics must be justified by authoritative task eligibility/completion, with explicit unknown/inapplicable/unavailable labels; **never hard-code “4/12” or fabricate a percentage**.
- Reuse M2's authorized Project Context and Fast/Default/Premium native research. Add a bounded, server-validated **active step + exact business target** overlay and structured, source-grounded research candidates or modification proposals where needed. Do not degrade open-ended Agentic Search to a static page catalog.
- The right panel changes **by workflow + step + selected business matter + actual capability**: customer onboarding form; official school/course discovery, filters, favorites and comparison; actual Admissions/Student 500/GS fields; permitted document/version and review views; proposed edits with their targets and impact. Disabled Project Document and professional/partner capabilities stay honestly unavailable.
- The AI may propose a specific business-field change, but only **preview + explicit authenticated confirmation + existing service CAS/revision/idempotency + persistent readback** can save it. No guessed identity, cross-school mutation, lawyer approval or external submission.
- Retain the approved M3-01 Composer/Premium reliability work and reuse the M3-02 deterministic journey/status code. Maintain Step Chat continuity and avoid losing drafts, messages or the selected matter when resizing, switching steps or Projects.

**Delivery increments (inside M3, each separately commissioned and reviewed):**
- **M3-E1 — Universal three-region UI shell:** one resizable shell works for both School and Student 500 projects, with dynamic-right-panel infrastructure and mobile adaptation. Read-only and no new database migration.
- **M3-E2 — Workflow Profiles & Task Progress:** real conditional School/Student 500 step definitions, composite/Offer/CoE/visa-only routes, truthful top-right progress and initial authorized task panels; minimum justified M1 extensions.
- **M3-E3 — Contextual AI & Confirmed Actions:** current-step context, grounded school search/compare and typed proposals; authorized School and Student 500 draft field changes with target/revision confirmation, readback and UI synchronization; minimum justified M2/business-service extensions.
- **M3-E4 — Integrated Acceptance:** authenticated browser and isolated PostgreSQL tests for School-only, Student 500-only, combined, alternative routes, mobile splitter, cross-chat continuity, user edits, conflicts, unavailable sources and legitimate source/citation behavior.

**Acceptance.** Both Project types use the same responsive interaction framework **without** sharing a compulsory step checklist; the correct right-side tool appears for the selected target. All known progress/counts come from M1 and are consistent across header, rail, AI and task panel; incomplete coverage is labeled, not made numeric by guess. School A/B remain independent; visa-only/external CoE bypass fictitious School requirements. At least one genuinely confirmed School draft update and one genuinely confirmed Student 500 draft update produce authorized persistent readback (where accepted business capability permits); cancellation, stale changes, revoked access and wrong-target proposals never mutate data. Current-law and school-search assertions retain real sources. Do not claim file, lawyer or external operations the system cannot perform.

**Exit:** Owner-reviewed UI + genuine isolated-DB workflow action acceptance + separately recorded browser/model evidence; full M3 E1–E4 is not complete merely because the E1 shell or the old M3-02 graph exists. \`LIVE_PRODUCTION_NO_GO\` remains until a separate release decision.

### M4 — DIY, Engagement Scope, Partner Routes & School Handoffs

**Goal.** Model how a **specific application** is served and passed between parties. Contracted services and partner resources must not be assumed for DIY users.

**In scope.**
- Distinguish independent service engagement per scope/application: DIY school application with optional visa-only engagement; signed Managed school service; our direct school representation; or use of an external Australian first-tier school agent. A domestic Chinese partner can participate in *prior* student intake and document preparation alongside the latter two contracted channels.
- A dedicated partner registry records organization type, school representation, valid period and school/channel-specific stamped application form/version. Each application references its approved route, materials and delivery target; an applicant may pursue different schools via different channels. Reuse M4/M5/M8 engagement/package/handoff sources with actual permission checks, not an uncontrolled partner database.
- Draft creation, preparation and internal review may proceed without a universal “partner + lead lawyer double signature”. Never silently equate ordinary School admission review with a mandatory lawyer legal opinion. Signatures, sharing, explicit external transfer, professional advice and contract obligations require per-action scope and accountable authority. Precise external-form stamping and approval rules remain subject to business-owner confirmation; no assumed grant.
- Record the exact package revision, form revision, actor, recipient and evidence for each transition: prepared → sent to first-tier agent → agent acknowledged → school acknowledged → actual school outcome. These are not equivalent statuses. Direct representation and DIY paths have their own valid submission/receipt transitions; no fabricated receipts.
- DIY users can follow published school instructions, prepare drafts and log external proof without seeing contractual partner resources. Converting DIY to Managed requires a confirmed contract/scope/consent before sharing old drafts.

**Acceptance.** With desensitized examples from the business owner, run direct-agent School A and first-tier-agent School B, including one domestic intake partner. A visa-engaged customer self-manages school applications without being blocked. A user asks “Has the school received it?” when only the agent's acknowledgement exists; response says exactly that the agent received it and the school receipt is unverified. Wrong/expired form, wrong recipient, withdrawn grant and unsigned disclosure all block the affected external action only.

**Dependency still pending:** Business owner/lawyer must confirm actual stamped-form acquisition workflow, authorized signatures, precise external-handoff rules, and provide one anonymized sample of each channel before those exact rules are frozen. Phase 15 planning may proceed without inventing that answer.

### M5 — Domestic Staff Copilot & Integrated Acceptance

**Goal.** AI-assisted staff can carry out routine document collection and school application preparation with lower experience demands, while escalation, authorizations and client visibility remain reliable.

**In scope.**
- Role- and assignment-scoped staff queue: needs verification, waiting for student, ready for team, and requires business/lawyer escalation. Show relevant original material beside AI-extracted/proposed values, differences, freshness, source location and client consent.
- Draft bilingual outreach, missing-document requests, status follow-ups and handoff summaries. Human sends through an authorised channel after checking; student response updates the precise Project/application tasks and de-duplicates reminders. Do not grant staff broad member-wide access or lawyer authority merely because they are partners.
- Run three consolidated end-to-end journeys: (a) DIY school selection, official research and confirmation, (b) multiple schools + Student 500 or external Offer/CoE, (c) domestic intake → internal preparation → Australian partner/direct delivery and actual receipts.
- Baseline and compare time to next action, redundant questions, manual re-entry, minutes per correct package, rework, field correctness, missed exceptions and harmful unauthorized steps. The owner/business reviewer defines reasonable targets before comparing. The scenario is passed only if the novice worker knows when to escalate and can finish a correct handoff.

**Acceptance.** One responsible English-capable novice runs anonymized synthetic tasks without expert coaching and produces an accurate reviewable package, with less duplicate work than baseline. Client home and a fresh Project chat reflect relevant changes. All paths test privacy, role access, impersonation, cross-project separation, accidental legal conclusion, absent partner receipt and cancellation. Record separately what was verified offline, in a disposable PG database, in browser, by staff/lawyer, and in AWS.

**Exit:** Integrated engineering + user/business acceptance report; *separate* owner release/production authorization required.

## 3. Cross-cutting engineering and legal invariants

1. **Truthful state:** a persisted source-of-truth and reproducible derived progress; do not create a second mutable AI-owned status database, imaginary deadlines, receipt, lawyer approval, or universal linear workflow.
2. **Scoped privacy:** current actor, Project, individual Chat ownership, application, service engagement, document version and grants determine access. Authorized Project-wide awareness is not unlimited access to raw customer or partner material; one Project cannot read another.
3. **Mode preservation:** existing Fast/Legal Check/Premium serving, legal evidence/checker boundaries and bounded provider contracts remain distinct unless separately approved after evidence. Existing premium direct research is not forcibly routed into Default's local RAG.
4. **Honest knowledge:** official/current school and immigration sources have provenance, dates and applicability conditions; uploaded content and customer-reported facts are not law. Unknown/uncertain data remain explicit, subject to professional review where required.
5. **Consent and writes:** AI suggestions are not edits. Preview + explicit authorized human confirmation + idempotent transaction + readback are required before material draft changes or disclosure. Distinguish user fact confirmation from lawyer approval and external receipt.
6. **Conditional workflows:** DIY, Managed, already-offered, already-CoE, visa-only, parallel schools and foreign/domestic partner involvement are independent dimensions. A step is required only if its business/legal prerequisites actually apply.
7. **Fail closed on existing gates:** Phase 13/14 limitations remain, including trusted Project Documents DENY without authenticated clean-scan production issuer, M4 professional/contract authority gaps, M6 legal coverage PARTIAL, M8 staff-private-package permission pending, and Post-M5 E2E limitations. Implementation or flag change alone is NOT an authorization to clear them.
8. **No silent external operations:** No real school, agent, immigration, payment, document transfer, lawyer message or governmental submission without a separately approved authenticated action and required consent.
9. **No unnecessary rewrites:** Reuse current Next.js/Drizzle/PostgreSQL 17, FastAPI, Project foundation, School Admissions, Student 500, Project Facts, Policy/Education Intelligence, Case/Review and existing account/billing flows. Do not replatform the backend or replace legal inference architecture to implement UX.
10. **Verification truth:** unit PASS ≠ PostgreSQL PASS ≠ browser PASS ≠ staff pilot PASS ≠ production release. Fixed 5 milestones, bounded tests and explicit carryover blockers; no endless task fragmentation.

## 4. Scope & authorization at this planning checkpoint

- **Authorized now:** Create the Phase-15 branch and write/update repository planning, state, decision and handoff documentation. Owner reviews and locally synchronizes.
- **NOT authorized now:** Codex/Cline implementation, issuing the M1 implementation prompt, source changes, schema/migration creation or application, data writes, feature flag changes, paid provider calls, real customer materials, partner/Stripe operations, AWS or production rollout.
- After owner inspection, only the owner's separate instruction will authorize an M1 implementation task packet/prompt and subsequent execution. Later milestones are gated on the owner accepting preceding evidence; they are not pre-authorized merely by this roadmap.
- Base branch is a recorded planning starting point, not a claim that Phase 14-B production trusted file operations are accepted. A future engineering start should recheck Git ref, actual code/tests, local dirty worktree and production restrictions.

## 5. Repository authority, validation and review procedure

- Primary authority: [AGENTS.md](../../AGENTS.md), [DECISIONS.md](./DECISIONS.md), and this Phase-15 plan. This roadmap is a **product/milestone contract**, not executable Codex instructions.
- Baselines: [Phase 13 roadmap](./PHASE13_STUDY_JOURNEY_ROADMAP.md), [M5 school admissions integrated plan](./PHASE13_M5_SCHOOL_ADMISSIONS_INTEGRATED_PLAN_2026_10_30.md), [M10 acceptance report](./PHASE13_M10_CONSOLIDATED_ACCEPTANCE_REPORT_2026_11_10.md), [Phase 14-B contract](./tasks/PHASE14_B_PROJECT_DOCUMENT_FACTS_CROSS_CHAT_CONTRACT_2026_11_11.md).
- Relevant source families to inspect when implementation is separately commissioned: chatbot/lib/{projects,workspace,school-applications,school-admissions,student-500,project-facts,project-documents}; chatbot/components/{immigration-ai-workspace,project-workspace-home}; legal-service/app/services/project_context.py and schemas/query.py. File paths are navigation hints, not proof that a given capability has passed live acceptance.
- Normal implementation workflow *later*: owner-approved bounded M1 scope → coding-agent patch/tests, no autonomous push → independent review → owner local/isolated validation → owner-approved commit/push → independent remote SHA check → explicit milestone acceptance. Follow the actual repo state and migration/test target guard; do not assume old handoff prose is current.
- Current Phase-15 status must always be the newest dated section of CURRENT_MILESTONE, CURRENT_HANDOFF and PROJECT_STATE. Historical “not started” or “pending commit” narratives from older branches are snapshots, not live status.
