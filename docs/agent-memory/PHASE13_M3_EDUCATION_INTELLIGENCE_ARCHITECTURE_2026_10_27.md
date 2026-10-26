# Phase 13 M3 — Education Intelligence Architecture & Implementation Plan

Date: 2026-10-27 (Australia/Sydney)
Branch: phase13-study-journey-project-centric
Design baseline: 6e502c8fb8b94b8a99efac96b60ef4786def566b (M2 offline acceptance docs)
Status: ARCHITECTURE FROZEN / M3-001 READY FOR CODEX / M3 CODE NOT IMPLEMENTED
Authority: User explicitly requested immediate architecture design, repository recording and dispatch without a separate design-approval round. This freezes technical direction only: NOT professional/legal approval, admissions-rule approval, migration approval, real-source acquisition approval, deployment approval, or public activation.

## 1. Product aim and frozen boundaries

Deliver a source-grounded Australian international-education intelligence layer for future Study Journey projects: discover registered institutions and courses; distinguish provider, course, delivery location and particular intake; preserve official source provenance, history and uncertainty for fees, entry prerequisites, dates and availability; later support explainable *possible option* matching. Compare representative ELICOS, VET, undergraduate, coursework master's and research-degree cases. The aim is reliable decision-support, NOT an admission determination or an automated application.

Non-negotiable:
1. CRICOS registration is evidence about a registered provider/course as recorded at the observed time; it does NOT itself establish a currently available intake, current application deadline, the applicant's eligibility, an Offer, a CoE or visa eligibility.
2. Institutional course/admissions/fee/intake pages are independently versioned claims; a government discovery index and a school's programme details are not interchangeable.
3. Unknown, stale, withdrawn, conflicting, unpublished and not-applicable are different conditions. Unknown must never silently become false or satisfied; contradictory official observations require surfaced uncertainty, not a chosen winner by model intuition.
4. Education catalog records are public/general domain knowledge, separate from personal Project Facts, Project Documents, LegalMatter and Phase 12 Policy Intelligence; a Project may eventually reference catalog IDs only via existing authenticated/authorized Project operations. No private facts leak into the public index.
5. Standalone chats, M1 Project membership/Chat ownership, M2 fact publication/AI-use grants, Phase 12 documents, Fast/Default/Premium, VIP/Stripe, lawyer review, policy publication and existing AWS services remain unchanged unless separately authorized.
6. The existing Policy Intelligence source-first automated-publication contract is **not** an admissions-fact accuracy contract. Reuse bounded fetch/snapshot/provenance/observability patterns, never blindly reuse its legal publication semantics for mutable fees/deadlines.
7. No invented CRICOS record, course code, admission deadline, fee, country rule, institution endorsement, scholarship, entry decision or student-visa advice in production. Test fixtures must unmistakably identify themselves as synthetic.

## 2. Source governance (official discovery is not uniform authority)

Primary source families and recommended roles:
- CRICOS government register — identity/registration and its displayed provider/course/location fields: https://cricos.education.gov.au/ ; course search: https://cricos.education.gov.au/course/coursesearch.aspx . Do not assert undocumented bulk API/export availability.
- Study Australia — government-backed discovery/navigation and course search: https://www.studyaustralia.gov.au/ and https://search.studyaustralia.gov.au/courses . Its summary/discovery data does not supersede a current school-specific admissions page.
- Institution-controlled official pages/catalogues — detailed admissions criteria, campus delivery, intake application opening/closing dates, published international tuition and course-specific exceptions. A specific course URL and publication version/as-of time are mandatory for attributing an actual claim.
- Sector regulator/official agency pages, such as TEQSA/ASQA, may inform registration context when relevant; they are not blanket replacements for CRICOS or provider admissions rules.
- Third-party rankings, aggregators, agent marketing, AI summaries and user-uploaded school PDFs are discovery/untrusted input unless separately established as authorized official evidence. Never promote them to "institution official" solely because a school is named.

Authority is claim-specific, NOT a single global rank: CRICOS for what it actually registers, official institution admissions/fees/intake publications for corresponding institution decisions, Study Australia primarily for discovery. Record official-source conflicts rather than silently picking one. First milestone is strictly fixture-backed/offline; no live scraping, API assumptions, HTTP requests, robots/TOS bypass or scheduled jobs.

## 3. Canonical bounded domain model (M3 contracts, not yet DB tables)

3.1 Identity (all with generated opaque internal ID plus distinct external IDs):
- EducationProvider: providerId, normalized displayName, observed legalName/aliases, CRICOS provider code when evidenced, provider category/status if supported; source refs. CRICOS code is an external identifier, not a name-derived surrogate.
- EducationCourse: courseId, providerId, course title, qualification level/sector, CRICOS course code if evidenced, institution course code if evidenced, study-field taxonomy where supported. Provider/course code pair must be checked for collisions; title alone never identifies a course.
- EducationDelivery: deliveryId, courseId, institution campus/site/location identity, state/city, offered mode and delivery-specific status if evidenced. A course may have multiple locations; never merge by city text alone.
- EducationIntake: intakeId, deliveryId, term/period/year/startDate if evidenced, application deadline/window, offer status and source details. Programme availability and particular intake availability are separate; no invented next intake.
- EducationSource: sourceId, sourceFamily, authorityName, originalURL, canonicalURL, allowed-host evaluation, source scope, language, access mode, retrieval policy. One institution can have many distinct source URLs.
- EducationSnapshot: snapshotId, sourceId, retrievedAt, observedAt, sourcePublishedAt/effectiveFrom/effectiveTo only if observed, contentSHA256, declared parserVersion, response metadata if accessible, bounded provenance/excerpt/locator, acquisition outcome. Immutable; identical content hash permits idempotent new observation metadata without erasing history.
- EducationFieldObservation: observationId, target entity type/id, fieldKey, typed value/unit/currency, sourceSnapshotId, source locator/excerpt, observedAt, source date applicability, extractionMethod and validation status. Provenance remains field-level. Store values as candidates even before verified admission use; absent field is not a fabricated zero/false.
- EducationFieldResolution: candidate observation set, effective status (known / unknown / stale / conflicted / withdrawn / not_applicable), resolvedValue only when supported, sourceRefs, assessmentAt, reason codes. Resolution is deterministic; it must not invent missing values.
- Future ProjectEducationInterest (not M3-001): authorized Project reference to course/delivery/intake IDs and catalog snapshot/version, without copying or auto-sharing private Chat/Fact content.

3.2 Cross-cutting invariants:
- Identity scope: institution course code, CRICOS code, campus and intake are separately optional and separately verified; unresolved identity matches remain ambiguous. Never fuzzy-merge across schools.
- Time scope: retrievedAt, observedAt, provider-publication date, academic start date, deadline, effective date and project decision date are different fields. Preserve original timezone / local-date semantics; never construct an exact deadline from an approximate month.
- Monetary scope: fee type (total/program/annual/semester/unit), AUD/other currency, international/domestic audience, year/period and inclusions must be sourced. A generic fee without basis is not comparable. No automated FX conversion masquerading as provider fee.
- Admissions scope: prerequisites may depend on course, intake, applicant pathway, language-test alternative and campus; conditional text stays conditional. International availability and registration are distinct.
- Evidence scope: snapshot raw content is untrusted; model extraction proposes candidates but cannot assert verified source applicability. Fields are independently validated and can be retracted or superseded without rewriting snapshots.
- Source conflicts: do not expose a single "verified" projection if two currently applicable trusted observations materially disagree. Retain all provenance, mark conflicted, and optionally require human review.
- Security: HTTPS allowlists, redirect/DNS/private-IP validation and bounded response body/time budgets must be designed before a live adapter. First packet is offline. No user-uploaded content fed to ingestion as official material.

## 4. Deterministic query and matching contract (to implement later)

A catalog read returns per-course scoped field resolutions and evidence/status summaries; it never returns an unverifiable merged "best course" row.
A Project option request is read-only and requires an authenticated, currently authorized Project. Resolve only M2 stableProjection().authorizedForAI and only those facts relevant to matching. No raw/hidden/superseded/revoked facts or other members' private chats. Recheck current Project authorization before model/provider emission.
For each explicitly sourced applicant criterion and school criterion, use three-valued outcomes: matches / does_not_match / unknown, with not_applicable when justified and explicit evidence references. Missing facts prompt clarification; missing official rules prompt research/human check. Hard eligibility and actual admission are never derived from an arbitrary weighted score. An optional soft ranking may explain preferences but cannot turn unknown hard requirements into PASS.
Possible match result: candidate identity, observed course/delivery/intake, supporting and conflicting fields, missing applicant facts, sources/timestamps, reasons, human-verification caveat. No promises or submitted/approved statuses; M5 implements application state later.

## 5. Reuse versus isolation

Reuse concepts, not mutable tables:
- Existing Policy Intelligence: chatbot/lib/policy-intelligence/{contracts,pipeline,repository,read-service,currentness,source-first,editorial-core}. Borrow immutable snapshot/version, source identity, currentness-vs-publication separation and bounded diagnostics; do NOT make education depend on policy editor, policy feed, policy sync, legal analyzer/verifier or source-first legal publication.
- Existing Phase 13: chatbot/lib/db/schema.ts (Project entities), chatbot/lib/projects/context-resolver.ts, chatbot/lib/workspace/context-resolver.ts, chatbot/lib/project-facts and lib/project-requirements. Preserve separate explicit customer confirmation/publication/AI grants and actor-scoped ownership; M3 catalog is not ProjectFact assertion or ProjectDocument evidence.
- Existing next/legal-service paths: untouched for M3-001; research/AI matching comes after grounded store/read model and independent regression.
- Existing security: adapt only proven bounded URL fetching/SSRF controls in future M3-003 with its own authority/host list and automated tests. Never transplant code merely due to similar names.

## 6. Data flow and publication semantics

Phase A, source discovery: curated allowlisted source definitions with scope and access-policy evidence; no public availability dependency on crawler success.
Phase B, source capture: allowed fetch/curated operator snapshot -> immutable bytes/hash/metadata -> field candidate extraction with exact locator.
Phase C, normalize/resolve: provider/course/delivery/intake identity; scoped per-field provenance, conflict, freshness and applicability; all unresolved values remain explicitly unknown/conflicted/stale.
Phase D, curated read model: show known facts and dated sources; corrections/retractions are versioned. Previously vetted facts do not silently disappear if a newer source fails parsing, but are explicitly flagged stale/unconfirmed where warranted. No evergreen "valid" claim without field-specific recency.
Phase E, optional Project matching: authorized stable facts -> tri-valued comparison -> explainable options/missing facts -> user/human decision; NEVER auto-create school applications, Project requirements, lawyer approvals, external submissions or payment actions.

Freshness policy: field family and source-specific configurable windows, explicit no-basis/unknown if not chosen. Registration, intake, price and deadlines have different refresh needs. A passing crawl or 200 response does not prove material correctness. Store last successful verification and latest attempted acquisition separately.

## 7. M3 bounded delivery packets and gates

- M3-001 — OFFLINE SOURCE/IDENTITY CONTRACT AND SYNTHETIC FIXTURES (ACTIVE NEXT): Pure TS domain contracts, source identity/canonicalization, provenance/field-resolution helpers, fixture corpus and focused tests. No DB migration, no network, no public APIs, no model calls, no policy integration. See task packet under tasks/PHASE13_M3_001_OFFLINE_SOURCE_CONTRACT_AND_FIXTURES_2026_10_27.md.
- M3-002 — DURABLE CATALOG: after review of M3-001 actual types, add isolated Education* tables/repositories with immutable snapshot/observation lineage, idempotent persistence and additive migration (next migration number must be derived from LIVE repo journal, not assumed); only identity-guarded disposable PostgreSQL. No normal/staging/prod migration.
- M3-003 — OPERATOR-CURATED OFFICIAL SOURCE ACQUISITION: bounded allowlisted approved-source adapters + explicit terms/access review + structured import/dry-run, history, HTTP failure diagnostics, no new policy-editor dependencies. First real source fetch is separately approved and tested; no unattended production crawler.
- M3-004 — RESOLVED READ MODEL AND EXPLAINABLE OPTIONS: field-status projection, provenance/unknown/stale/conflict, read-only tri-valued matching against precisely authorized Project facts in an injected offline harness; no school-application writes, no staff/lawyer determinations.
- M3-005 — INTEGRATION / MILESTONE ACCEPTANCE: curated source comparison across ELICOS/VET/undergraduate/coursework-master/research; representative multi-location/multi-intake and deadline/fee conflicts, duplicate IDs, stale/withdrawn, school vs CRICOS disagreement, permission and no-fabrication checks. Public/UI activation and production only by distinct release authorization.

Deliver each packet as a coherent task; do not create dozens of gates. Fast offline acceptance is the goal, but true authorization/integrity regressions block.

## 8. Minimum acceptance matrix (no fake source facts)

1. Different institutions with same human-readable course name never merge.
2. Same programme at different delivery locations/intakes retains distinct scoped fields.
3. Provider CRICOS identifier and course CRICOS identifier never interchange.
4. Date source publication, observation and application deadline are never conflated.
5. Missing fees, deadlines, admissions rules and intakes remain UNKNOWN, never zero or fabricated.
6. Currency, international audience and fee time basis must match before fee comparison.
7. Conflicting institutional announcements from different snapshots return CONFLICTED or STALE with provenance rather than arbitrary winner.
8. A newer observation doesn't silently erase previously published sourced information; historical value is available, currentness is separate.
9. Unsupported/custom URLs and untrusted excerpts are never treated as official solely through a textual label.
10. Project A/member private fact cannot appear in Project B/other member/Standalone or public catalog; no M2 fact grant bypass.
11. School admissions matching is tri-valued and non-conclusive; it cannot set admitted/Offer/CoE/visa approval.
12. At least 5 synthetic fixtures represent ELICOS, VET, undergraduate, coursework master's and research; all are marked SYNTHETIC and use reserved example-domain URLs, not real school claims.
13. No network, AWS, paid model, production DB or unapproved migration occurs in M3-001.

## 9. Readiness & unresolved professional decisions

M2 remains OFFLINE ACCEPTED_WITH_LIMITATIONS, production Project Document path NO_GO. M3 approval to author design and perform bounded offline code does not resolve GuardDuty provenance, document consent/retention, user/guardian authority, school admission criteria, business engagement or lawyer signoff. Those gates retain their later milestone owners.
Source-adapter access policy, canonical CRICOS course/provider key details, per-field freshness intervals, provider-specific legal/marketing representations, and actual programme data must be evidenced during later packets rather than guessed now.

## 10. Operator / handoff workflow

ChatGPT freezes architecture/packet and independently reviews Codex cumulative patch; Codex implements ONLY the bounded packet and reports diffs/tests/skips; owner tests on Ubuntu and commits/pushes; ChatGPT verifies remote SHA and writes acceptance checkpoint before advancing. No automatic merge/rebase/force push, AWS, DB mutations outside approved disposable test, production release or live paid model invocation.

References: AGENTS.md; PHASE13_STUDY_JOURNEY_ROADMAP.md; PHASE13_UI_PRODUCT_BLUEPRINT_2026_10_24.md; M2 acceptance matrix; Australian Department of Education official CRICOS register, Study Australia source directories and official institution pages as applicable. Official source URLs are *source-family identification*, not a claim that any specific current programme has been checked.
