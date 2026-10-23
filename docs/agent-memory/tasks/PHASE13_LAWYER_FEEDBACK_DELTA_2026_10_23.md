# Phase 13 — Lawyer Feedback Delta (23 October 2026)

**Record:** `P13-LAWYER-FEEDBACK-2026-10-23-01`  
**Status:** FEEDBACK CAPTURED — REQUIRES OWNER AND DOMAIN REVIEW; **NOT** approved law, publication authorization, or accepted requirements template.  
**Related milestone:** M0-003-R2 workflow design; reconcile at M0-004 review; do not enlarge M1 scope.  
**Record purpose:** Preserve source-linked professional feedback separately from both the provisional V0.1 baseline and the M0-003 technical design.

## 1. Source identity and provenance

- **Annotated source:** `Study_Journey_School_and_Student500_Facts_Documents_Lawyer_Review_V0.1_2026-10-22.pdf`, 15 pages, annotated copy supplied in the ChatGPT Project on 2026-10-23.
- **SHA-256 of the annotated copy inspected:** `2862b28209ef2097567f6396a2cb09bcface56ad2cf2ba7eb68e2b56e4686496`.
- **Important source distinction:** A separate same-named file mounted in the workspace had SHA-256 `f05c2efe594cceaf3967f26f58b4b110016ea964657d5f8212de464027701445` and **did not** contain these visible comments. Do not assume that the same-named Git `doc/` PDF is the annotated source without verifying its hash.
- **Source pages:** PDF printed page **02** (five numbered answers), **06** (fees versus tuition held for others), **09** (OSHC and GS comments). Text and page placement were visually inspected.
- **Attribution:** comments supplied by the project owner as feedback from the lawyer friend. Individual signer, role/capacity, exact review date/time and formal approval have not been independently verified. Preserve the original annotated PDF under a distinct dated, access-controlled source path if/when the owner separately approves adding it to the repository; do not silently overwrite V0.1.
- **Authority:** lawyer suggestions/experience are not in themselves legislation, Home Affairs policy, institutional rules, verified bank-account compliance advice or the lawyer's signed approval of all checklist items.

## 2. Feedback captured verbatim, with interpretation boundaries

| ID | PDF page / source target | Lawyer comment (as visible in annotated PDF) | Interpretation / decision status |
|---|---|---|---|
| LF-01 | p.02 question 1 (which base intake fields may be deferred) | `1. 好像没有` | Ambiguous informal answer; ask whether *none* may be deferred and which fields are essential at intake versus pre-submission. **Do not** convert all base fields into hard blockers for AI draft/export. |
| LF-02 | p.02 question 2 (what needs lawyer review) | `2. 理论上所有文件我们都需要看到正本，但实际操作中，需要对合作伙伴的信任` | Propose document authenticity/original sighting as an independently evidenced verification dimension, including reliance on an identified trusted partner. Whether every document must be seen in original form is **not** accepted as a universal gate. |
| LF-03 | p.02 question 3 (financial/English sufficiency) | `3. 都有法律instruments 来定` | Require citation to the specific applicable instrument/source version, date, fact conditions and qualified review; this is not a numeric threshold or waiver decision. |
| LF-04 | p.02 question 4 (early lawyer involvement) | `4. 有被拒，被拒想重新申请，学习计划很奇怪，有未来移民计划，有澳洲亲戚...` | Create **candidate** early professional-review prompts for material visa refusal/reapplication, inconsistencies or unusual study trajectory. Migration aspirations and relatives in Australia **must not automatically be treated as adverse findings**, prohibited grounds, or a refusal prediction. A human considers relevance and actual authoritative criteria. |
| LF-05 | p.02 question 5 (self-service / managed liability notices) | `5. 需要考虑` | No approval of disclaimers/terms. Owner and lawyer must draft and review real customer notices separately before external release. |
| LF-06 | p.06 adjacent to OUT-04 school payments | `如果和缴费联系起来，则至少需要两种账号：1. 公司可以收取的服务费等 2. 公司代收的学费等不属于公司的钱` | Distinguish **firm revenue/professional service fee** and **client/third-party money held for school tuition/deposits**. “账号” may involve account/ledger segregation; this text alone does not conclusively settle the required number/type of regulated bank accounts or custody classification. Financial/legal confirmation pending. |
| LF-07 | p.09 visually adjacent to VD-03 OSHC | `中国公民无豁免` | Treat as a proposed OSHC nationality-exception assessment, not automatically a published legal rule. Verify exact official exception basis, applicant facts, applicability/effective dates and legal review. **Do not** extrapolate to financial- or English-evidence exemptions. |
| LF-08 | p.09 visually adjacent to VD-04 GS | `可以准备更详细的单个综合的GS` | Support a versioned comprehensive GS **working draft** feeding separately versioned official, question-by-question GS answers. A comprehensive narrative is not automatically a substitute for online-form answers or an authorized optional attachment. Current question limits/format must be verified from the actual authoritative form/source. |

## 3. Proposed technical changes, not approved requirements

### 3.1 Financial ownership and custody (`LF-06`)

Keep the M0-003-R1 model for professional fees (`PaymentEvent → PaymentAllocation → ServiceFeeObligation`) separate from a proposed third-party-funds tracking path. Distinguish **payer, legal/beneficial owner, payee/beneficiary, receiving account classification, payment purpose, institution, evidence of actual receipt, authorized disbursement, refund/reversal and reconciliation**. Recording a screenshot never proves cleared funds.

Support **customer pays school directly** as a non-custody path with a verified external receipt, distinct from **company actually receives and forwards third-party tuition**. Do not count tuition as firm service-fee revenue, do not reuse VIP/Stripe settlement, do not auto-move money. A separate custody/accounting/legal decision must establish whether the firm may receive and hold such funds, what account structure/control is required, applicable licensing/trust obligations and how refunds are handled. No legal bank/trust classification is selected by this feedback.

### 3.2 Provenance and professional evidence review (`LF-02`, `LF-03`)

Keep separate dimensions for (a) malware/scan clearance, (b) successful OCR/extraction, (c) document authenticity/original sighting or partner attestation and partner verification basis, and (d) evidence sufficiency under the **applicable source/instrument**. Each verification should bind named actor/capability, time, document version/hash, verification method, partner identity where relied on, and its limits. Scan-clean does **not** mean original verified or requirement satisfied. AI may flag uncertainty but cannot impersonate a human original sighting.

### 3.3 Early professional-reasoning trigger (`LF-04`)

Define source-backed, explainable, non-determinative suggestions for professional review: past refusal/cancellation and subsequent reapplication, material gaps/inconsistencies in proposed course progression, relevant deadline/status complexities, etc. A trigger is not a legal conclusion, refusal probability or mandatory hard gate unless a **reviewed applicable** professional/legal rule provides that gate. Do not encode age, nationality, family ties or future migration aspiration alone as a negative assessment.

### 3.4 OSHC conditional applicability (`LF-07`)

Keep `VD-03` as a generic candidate item with scoped exception logic. For a China-national applicant, the annotation suggests no ordinary nationality-based OSHC exemption, but it must be **source verified and professionally reviewed** with correct date and any other applicable conditions before a template can be published. Do not conflate with `VD-06` finances or `VD-07` English proof. No static unconditional country blacklist/whitelist or automatic legal certification.

### 3.5 Two GS artifacts (`LF-08`)

1. `ComprehensiveGSWorkingDraftVersion`: detailed chronology, course choice, future benefits, family/work/economic facts, citations/claims, conflicts, revisions; explicitly **internal working material**, not an approved official form or automatically submitted attachment.
2. `OfficialGSAnswerSetVersion`: actual applicable question IDs, per-question answer versions and source constraints, provenance back to working draft/facts and reviewed materials, writer/editor/approver/customer confirmations, hashes; managed package approval binds exact submitted answers.

A later material fact/source edit creates new affected revisions and invalidates applicable exact-version review. Keep optional extra narrative/attachment as **separately authorized per-case** use, not automatic.

## 4. Actionable review/decision register

| ID | Follow-up / acceptance evidence | Responsible authority | Target |
|---|---|---|---|
| LF-D01 | Clarify LF-01: which intake answers can be deferred without blocking unrelated AI preparation | Owner + lawyer/agent | M0-004 / product intake |
| LF-D02 | Approve original/partner evidence verification policy, partner identity/attestation and audit limits | Lawyer + owner | M0-004; implement in M2/M4 |
| LF-D03 | Identify the actual applicable legislative instruments and rules for finance/English sufficiency | Lawyer + source-review agent | M0-004 decision list; before operative templates |
| LF-D04 | Review and source-ground early lawyer involvement triggers and customer notices | Lawyer + owner | M0-004; implement in M4/M7 |
| LF-D05 | Approve self-service disclosure and professional responsibility boundaries | Lawyer + owner | Before real customer live release |
| LF-D06 | Decide direct tuition payments vs company-held funds, custody law/accounting, account controls, permitted entities, refunds and reconciliation | Lawyer + owner + finance/accountant | Before any company-held tuition feature; design options M0-003/M0-004 |
| LF-D07 | Confirm OSHC exception analysis including nationality, current source, legal temporal applicability and qualified signoff | Lawyer + legal-source reviewer | Before Student-500 operative rule publication |
| LF-D08 | Confirm official GS answer format/word limits and any supplemental narrative use; review dual-artifact approvals | Lawyer + owner | M0-003/M0-004; before managed case activation |
| LF-D09 | Preserve original annotated PDF with unique date, hash, confidentiality/access classification and signer/reviewer provenance once approved | Owner/records administrator | Prior to formal evidence acceptance |

## 5. Integration boundaries

- **M0-003-R2:** Map comments to the existing school/Student-500 workflow design and state diagrams; do not rewrite accepted R1 TaskPlanner, deterministic gates, project-scoped authority, transactional outbox or exact-version approval unless required to resolve a specific inconsistency. R2 remains **AWAITING INDEPENDENT REVIEW** as of this record.
- **M0-004:** Record final technical choices and unresolved professional/financial matters separately. Accepted technical platform contracts do not approve source matrices. Owner's explicit M0-004 decision remains a prerequisite to M1.
- **M1:** No expansion; establish only Project, membership, new Project-chat association and scoped authorization.
- **M2:** Candidate document authenticity/partner attestation and versioned evidence fields; scoped fact/requirement representations. No automatic official-law approval.
- **M4–M5:** Scoped assigned professionals, per-service engagement terms and payment evidence; university deposit/tuition may be direct-to-school or controlled third-party fund path only after owner/counsel/finance approval.
- **M6–M8:** OSHC applicability, source-temporal rules, two-stage GS drafting and exact-question answer approvals, early professional-review candidates and package gates.
- **Outside this task:** production trust-account setup, payment collection, migration, official policy verification, legal signoff, changing uploaded PDF or modifying the pending local R2 file.

## 6. Strict status semantics

- `CAPTURED`: text and page/source verified against the annotated PDF.
- `PROPOSED_TECHNICAL_DESIGN`: may be discussed/implemented only after corresponding owner technical approval.
- `LAWYER_REVIEW_PENDING`: professional scope, source applicability, evidence sufficiency or customer disclosures unresolved.
- `OWNER_FINANCE_PRIVACY_PENDING`: financial custody, contract terms, records/retention or account design unresolved.
- `PUBLISHED_RULE`: **none from this feedback**.
- `M0_003_R2_ACCEPTED`: **not claimed**; independent review of the local revised document is still necessary.

**Evidence hygiene:** retain the original annotations; don't rewrite, impersonate the lawyer, claim they signed the whole checklist, infer universal legal requirements or silently blend advice into operative checklists. Record each eventual review decision with person/capacity, time, cited source and template revision.
