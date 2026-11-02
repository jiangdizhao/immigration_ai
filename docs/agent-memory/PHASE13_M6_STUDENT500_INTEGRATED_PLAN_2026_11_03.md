# Phase 13 M6 — Student 500 Legal Intelligence & Application Preparation MVP

**Owner decision:** 2026-11-03 (Australia/Sydney)  
**Status:** PLAN_APPROVED / INTEGRATED_CONTRACT_RECORDED / IMPLEMENTATION_NOT_STARTED / LIVE_PRODUCTION_NO_GO  
**Implementation branch:** phase13-m6-student500-application  
**Starting source:** phase13-m5-school-admissions @ ed39eefa9f963a546da9a366d820073d19a00556  
**Work shape:** exactly TWO integrated implementation deliveries (M6.1, M6.2) plus ONE consolidated engineering acceptance (M6.3). No schema/API/UI/prompt micro-milestone chain.

## 1. Product objective and scope decision

Build a usable **Student 500 application preparation MVP inside an existing Study Journey Project**. The user should be able to establish a visa application context; connect genuine current school/CoE or alternative evidence, even without creating a new school application; obtain source-aware and date-aware legal/checklist guidance; collect authorized facts and supporting evidence; see unresolved/conditional requirements; draft applicant-grounded GS material; save and revise an application-preparation record; and understand the next action and why the package is **not** yet authorized for formal submission.

This is an **explicit bounded overlap with the existing M7 plan** to bring forward the first customer-usable workflow. It is NOT a renumbering of M0–M10:
- **M6** remains responsible for Student 500 legal intelligence, Schedule 1/2 and instruments, temporal applicability, tailored official requirements, change detection and dependent-task invalidation; it now additionally includes a **basic preparatory workflow and provisional GS first draft**.
- **M7** remains the later deep preparation/coverage milestone: comprehensive branch coverage, sophisticated GS iteration, lawyer edits, broader application/evidence validation and human workflow improvements. Avoid reimplementing the M6 basics.
- **M8** remains the exact-version submission-authorization/human-execution milestone; no ImmiAccount or third-party submission in M6.
- **M9–M10** retain final unified workspace, pilot and release/readiness roles. Do not prematurely claim them done.

The prior M4 ENGINEERING_CLOSED_WITH_BLOCKERS and Post-M5 E2E_BLOCKED remain unchanged; they are not automatic prerequisites for drafting new M6 code, but **any reused path with an actual unresolved security/authority dependency must fail closed**. M5 INTERNAL_ENGINEERING_ACCEPTED_WITH_LIMITATIONS remains valid. No historic test is silently changed to PASS.

## 2. Mandatory reuse and architectural boundaries

Reuse rather than rebuild:
- M1 Project and owner/member/private-Chat authorization; derive project identity on the server from persisted association. Personal Project access is not professional authority.
- M2 Project fact assertions, confirmation/AI-use grants, exact-version evidence/locator, conflicts/revocation, authorized Project context; **existing Project Document live-trust gates remain DENY where not verified**. Do not borrow a legacy conversation file or fabricate scan-clean/AI consent.
- M3 education/CRICOS/institution/course/intake provenance and currentness. Education catalog entries and admission claims are not visa eligibility.
- M5 school application, Offer/CoE conditional branches and per-school evidence versions. Offer, CoE, customer report, extracted PDF and authoritative confirmation remain distinct; a valid existing CoE path must not require a new school application.
- Phase 12 / legal-service official source retrieval, Schedule-aware reasoning and Policy Intelligence where applicable; do not create a parallel unverified legal knowledge universe.
- M4 role/engagement/review/consent/payment contracts where truly needed, with existing fail-closed behavior and no mock approvals.
- Current main-area Project Workspace UX. School admissions and Student 500 are separate business workflows in the same Project; do not cram visa forms into the narrow navigation rail or create another isolated website.

Use the minimum **new Student500 application/version/requirement mapping schema and APIs** required by real product behavior. Prefer existing source/provenance and state contracts. Any new migrations are authored and tested in an expressly authorized isolated synthetic PostgreSQL DB only; production/local business DB migration requires a separate owner decision. Avoid touching Stripe VIP, Phase 6 checker freeze, legacy matter/session boundaries, and unrelated AWS systems.

## 3. M6.1 — one integrated Legal Intelligence + Application Entry delivery

**Customer-visible exit:** In the Project main area, a customer can create/open a persistent Student 500 preparation record, select the relevant applicant/onshore-offshore/time context, see a sourced preliminary pathway and conditional evidence requirements, and return later without losing state.

Single coherent end-to-end deliverable (schema + API + backend applicability + UI + focused tests in one task):
1. Student 500 application identity distinct from Chat, SchoolApplication and LegalMatter; Project authorization, ownership, idempotency, version/CAS and clear self vs managed *preparation* labeling, with no claimed professional status.
2. Applicant/visa context: proposed application date or as-of date, place of application, current/previous visa and material refusal/condition history, intended study/CoE or sourced exception, dependants/age and conditionally relevant circumstances. Unknown is a first-class state; never infer missing immigration history.
3. A versioned rule/requirement resolver using authoritative Australian official sources. Cover Migration Act/Regulations Schedule 1 and Schedule 2, relevant instruments, Home Affairs guidance and transitional/effective-date logic. Each material outcome carries source identity, provision/URL, as-of/effective date and applicability reason. Do not hardcode current thresholds/deadlines from memory or treat the uploaded July 2026 compilation as the sole current authority.
4. Condition-based checklist and screening (e.g. identity, study evidence, Genuine Student, financial capacity, English, OSHC, health/character, family/minors, onshore restrictions, bridging/refusal complications). These are **candidate requirements selected by applicable rules**, not a universal checklist. If official checklist/status cannot be established, show UNKNOWN / HUMAN_CHECK, not COMPLETE.
5. Main-area bilingual Student 500 Project surface with source/provenance, next action and honest status; usable even when Project Documents, professional adapters or actual submission are unavailable.

M6.1 acceptance: an applicant with existing credible CoE can start without fabricating a school application; Offer-only/no-CoE cannot become submission-ready; at least onshore/offshore and current/legacy as-of contexts select different applicable checks where supported; missing law or stale source fails closed; Project A/B and member private-chat isolation hold.

## 4. M6.2 — one integrated application preparation closure delivery

**Customer-visible exit:** The M6.1 application can be worked on across sessions: facts and authorized evidence are connected, gaps/conflicts surfaced, a preliminary GS draft and versioned application summary saved, and the next preparation action shown.

One coherent deliverable (not separate fact, document, AI, form and renderer task chains):
1. Reuse M2 field-level applicant facts, source-linked evidence and explicit authorizations; link existing school/CoE records where justified, with manual safe entry for unavailable connectors. Unconfirmed/self-reported/extracted facts remain labeled and cannot silently promote to verified.
2. Requirement-to-evidence coverage and conflict/missing/uncertain diagnostics. Separate answered, document-backed, independently verified, customer confirmed, AI-access-authorized, and professionally reviewed where applicable.
3. Fact-grounded provisional GS **first draft**, user-editable and versioned, with source/fact dependency and uncertainty disclosure. No invented autobiographical claims or automatic lawyer-approved status. Comprehensive lawyer GS revision remains M7.
4. Versioned visa preparation record/summary and material-change invalidation: changing facts, documents, dates, legal rules or applicable evidence reopens only affected checks/drafts/requirements; preserve audit and earlier versions.
5. Save, reopen, update and export/inspect a **preparation draft** and action list. Do not imply it is the government's exact ImmiAccount submission form, a valid submitted application, an official checklist completion certificate, or a verified lawyer opinion.
6. Keep M5 SchoolAdmissions state independent; multiple school paths in one Project must not contaminate the selected Student 500 context.

M6.2 acceptance: authorized evidence can be reused where actually available; denied Project-document trust remains unavailable and honestly displayed; GS draft is editable, fact-based and not approved; contradictory/withdrawn facts block false completeness; changed inputs invalidate dependent outcomes; workflow persists and resumes.

## 5. M6.3 — one consolidated engineering acceptance, no feature work

Run one bounded integrated offline gate against reviewed code and an owner-authorized disposable PostgreSQL database, using synthetic cases only. Include:
- Standard student case with confirmed route and sourced CoE; existing CoE with no new school application; Offer without CoE; currently incomplete school application.
- Onshore/offshore and historical/current as-of variants, including cases needing conditional review (refusal, restrictive visa condition, underage, dependants or complex status). Confirm uncertainty and human escalation rather than pretending all branches are final legal advice.
- Source dates and regulation/instrument revision changes; selective reopening of impacted requirements; official checklist unavailable.
- Project A/B and same-Project member isolation, denied/revoked grants, hidden-conflict suppression, exact evidence provenance, replay/CAS and concurrent operations.
- Browser-facing basic Project → visa preparation → save → reopen → GS provisional draft flow; verify bilingual labels and navigation without treating this as full production E2E.
- Preserve existing M5, Legal Service, Stripe and standalone chat behavior through targeted regression. Record historical TypeScript diagnostics separately; do not call existing baseline failures new regressions.

Review *actual* cumulative code/diff, tests and database evidence separately from a coding agent's report. Mark partial/unrun tests accurately. One owner-host run and one independent review per integrated implementation delivery; M6.3 is one consolidated acceptance, not a standing third-party provider or production-release campaign.

## 6. Engineering economics and stop rules

- **Exactly M6.1 + M6.2 + M6.3.** Do not create M6.1a/b/c, separate discovery/prompt/UI/schema acceptance gates, or recurring speculative R2–R5 loops.
- Each implementation task is one bounded cross-layer Coding Model packet with a real customer-visible exit; internals may be organized by the coding agent, but are not independently gated or recursively decomposed.
- Fix only demonstrated blocking defects: material incorrect legal applicability, unsupported material legal conclusions, private data/permission disclosure, audit/data integrity, idempotency/corruption or broken core journey. Cosmetic issues, generic refactors, speculative performance tweaks and unproven edge cases go to a DEFERRED register.
- One focused verification run and independent review per delivery, then commit/push and verify remote SHA before next delivery. Do not require all prior M4/Post-M5 failures to be "green" before coding M6.
- Do not run paid/live model evaluation, real customer data, actual government/school interfaces, existing production DB migration, AWS deployment or flag activation without explicit new owner authorization.
- Accepted M6 engineering does **not** grant M7/M8 completion, law-firm professional authorization, an official visa decision, live production or formal submission.

## 7. First next action, not yet authorized by this documentation

Once the owner syncs the new branch and explicitly dispatches M6.1, inspect current schemas and source contracts, then issue **one** cohesive M6.1 implementation packet grounded in this plan. No source code or DB change is made by recording this plan. M6.2 is dispatched only after M6.1 evidence and remote commit are reviewed; M6.3 after M6.2. Preserve the current unrelated uncommitted M4/Post-M5 test assets in the owner's original working tree.

**Canonical related records:** AGENTS.md; docs/agent-memory/{DECISIONS,CURRENT_HANDOFF,CURRENT_MILESTONE,PROJECT_STATE,PHASE13_STUDY_JOURNEY_ROADMAP}.md; M5 integrated plan/closeout; M4 and Post-M5 final blocker closeouts; Phase 13 UX/P1 implementation commits d16e6b6 and ed39eef.
