# Phase 13 M10 — Consolidated Acceptance Report

**Milestone:** M10 — End-to-End Reliability + Lawyer/Education-Agent Pilot
**Type:** acceptance and evidence consolidation (no feature development)
**Baseline:** `phase13-m9-integrated-workspace` @ `842e3fd87a5aa081ff45eccef4362b437ea9955f`
**Status:** `M10_ACCEPTANCE_EVIDENCE_PREPARED_PENDING_OWNER_REVIEW`
**Release:** `LIVE_PRODUCTION_NO_GO`

---

## 1. Verified branch and HEAD

Executed before any edit:

```
branch:  phase13-m9-integrated-workspace
HEAD:    842e3fd87a5aa081ff45eccef4362b437ea9955f
origin:  842e3fd87a5aa081ff45eccef4362b437ea9955f   (HEAD == origin)
status:  clean
```

```
842e3fd docs(phase13): record M9 closeout and M10 handoff
a6b0b77 fix(phase13): close M9 integrated UX with limitations
ab618ea feat(phase13): complete M9-B review workspace with limitations
f531dae feat(phase13): complete M9-A customer workspace with limitations
```

`a6b0b77` is exactly the 9-file M9-C correction set I delivered (235 insertions / 10 deletions),
committed verbatim; `842e3fd` is the owner's closeout documentation. D-P13-034 governs the
handed-off state: `M9_ENGINEERING_ACCEPTED_WITH_LIMITATIONS / LIVE_PRODUCTION_NO_GO`.

---

## 2. Scope and methodology

M10 evaluated the integrated system; it did not extend it.

Method, in order:

1. Verified the frozen baseline and preserved the clean worktree.
2. Read the roadmap M10 row, `CURRENT_HANDOFF`, `CURRENT_MILESTONE`, `PROJECT_STATE`,
   `DECISIONS` (D-P13-032/033/034), the frozen M9 contract, and the Post-M5 E2E final
   independent closeout (E2E-01…18 + M4 ledger).
3. **Mapped each acceptance assertion to existing tests before executing anything**
   (evidence-first, per protocol §3–4).
4. Executed only the offline suites that materially support a matrix row.
5. Recorded exact commands, exit codes and counts; separated newly executed from inherited.
6. Prepared the professional pilot kit; recorded the absent sign-off honestly.
7. Produced this report, the protocol document and one hash-verified cumulative patch.

**No production or test source was modified.** Two reproducible test failures were found and are
reported with a narrow, unapplied remediation recommendation.

---

## 3. Prior evidence inventory (inherited, not re-run)

| Milestone | Inherited verdict | Date / source | Scope limits carried forward |
|---|---|---|---|
| M4 | `M4_ENGINEERING_CLOSED_WITH_BLOCKERS` | M4 closeout + Post-M5 review | INT-06 formally failed; payment 12 functional failures not replayed; professional/payment/provider authority deny-only |
| M5.1 / M5.2 / M5.3 | Engineering accepted with limitations | M5 closeouts 2026-10-30…31 | Internal engineering only; no real school submission |
| Post-M5 E2E | **`E2E_BLOCKED`** | Post-M5 final independent closeout 2026-10-31 | E2E-06 Offer lifecycle **FAIL/OPEN** (harness `case.outcomes` vs `outcomeHistory`); E2E-07 **PARTIAL/OPEN POSITIVE**; E2E-13 mobile/feature-OFF **not canonically accepted**; E2E-15/16/17/18 PARTIAL |
| M6 Student 500 | Engineering closed with source limitations | M6 closeout | Legal coverage **PARTIAL**; `UNKNOWN`/`HUMAN_CHECK` retained |
| M7 GS / complex | Accepted deterministic + source-grounded prep | M7 closeout | GS draft ≠ lawyer-approved statement |
| M8 self-service | PostgreSQL + self-service evidence | M8 evidence handoff | Incomplete automated browser journeys not claimed |
| M8 managed | Authority constrained | M8 evidence | Genuine credential/agreement/payment/provider unverified |
| M8.2 staff observation | **PENDING independent security approval** | D-P13-033/034 | `STAFF_PRIVATE_PACKAGE_AUTHORIZATION_PENDING` |
| M9 | `M9_ENGINEERING_ACCEPTED_WITH_LIMITATIONS` | D-P13-034 2026-11-10 | C1–C3 scoped PASS; B2 positive Staff browser **NOT VERIFIED** |

Inherited results keep their original dates and scopes. Nothing above was upgraded by M10.

---

## 4. E1 — School admissions → Student 500: findings

Execution: `pnpm test:phase13:m5-1:offline` (62), `m5-2:offline` (94), `m5-3:offline` (30),
`m6-1:offline` (101), `m6-2:offline` (65), `m7:offline` (34). **386/386 pass, 0 fail, 0 skip**,
exit 0, offline (no database contacted).

| ID | Assertion | Evidence (new unless noted) | Observation | Verdict | Limitation |
|---|---|---|---|---|---|
| E1.1 | ≥3 independent school applications keep independent identities | `i01-applications` "I-01 three applications in one Project keep independent cases and identities"; `school-applications/service` "three independent school applications coexist under one authorized Project"; E2E-01 inherited | Three applications coexist with independent cases/identities; a second case for the same application is refused | **PASS** | Offline fixtures, not a persistent browser campaign |
| E1.2 | Application without Offer stays unverified | `i05-entry-routes`; `preparation/service` "an Offer-only admission case never becomes a verified CoE" | No fictitious application created; Offer-only never promoted to CoE | **PASS** | — |
| E1.3 | Customer-reported Offer never auto-verified | `i04-outcomes` "customer-reported Offer transitions keep history and one current row"; "a document-backed CoE is attached evidence, not verification" | Offers stay customer-reported; a document attachment is evidence, not verification | **PASS** (offline) | Inherited E2E-07 stays **PARTIAL/OPEN** for a clean authorized `document_backed_unverified` positive; inherited E2E-06 Offer v1→v2 lifecycle stays **FAIL/OPEN** (harness defect) |
| E1.4 | Missing CoE stays explicitly missing | `i05-entry-routes` "existing Offer and CoE cases create no fictitious application"; "a claimed exception is never promoted to verified eligibility" | Absent CoE is never invented; a claimed exception is not promoted | **PASS** | No real institutional CoE exists to test |
| E1.5 | Student 500 uses only authorized study-context links | `preparation/service` "an unauthorized admission case is unavailable, not silently unlinked"; `i08-authorization` | Unauthorized context is unavailable, never silently linked | **PASS** | — |
| E1.6 | Source-grounded GS prep, outstanding requirements, no lawyer approval | `m6-2:offline`, `m7:offline` 34; `review-summary` professional dimension | Requirements resolved from the versioned manifest; GS draft carries no approval; review dimension reports professional `unsupported`/`unavailable` | **PASS** (offline) | Legal coverage PARTIAL (§8); a GS draft is not a lawyer statement |
| E1.7 | Version change invalidates downstream confirmation | `i03-invalidation` (5 cases incl. "recovery: stale v1 is superseded by an authorized v2 reconfirmation"); `m8-1` "three independent school packages keep independent freshness" | Changed/revoked references stale both modules and block reconfirmation; a superseded version cannot retain confirmation | **PASS** | — |

**E1 verdict: `PASS` (offline), carrying two inherited limitations unchanged** — the Offer v1→v2
lifecycle has never been proven (E2E-06 harness defect), and no real Offer/CoE/school receipt
exists anywhere in this system. E1 proves contract and fail-closed behaviour, not institutional
outcomes.

---

## 5. E2 — Self-service vs managed service: findings

Execution: `m8-1:offline` **40/41** (exit 1), `m8-2:offline` **45/46** (exit 1),
`m4-004:offline` 61/61, `m4-006:offline` 34/34, `m4-007:offline` 34/34 (all exit 0). Offline only.

### 5.1 Self-service

| ID | Assertion | Evidence | Observation | Verdict |
|---|---|---|---|---|
| E2.1 | Exact version + digest + version-bound confirmation | `m8-1` A/B/D cases | Packages bind exact target versions, manifest digests and version-bound confirmations | **PASS** |
| E2.2 | Stale/superseded version cannot regain authority | `m8-1` freshness cases; `i03-invalidation` | Superseded versions stay non-authoritative; reconfirmation needs new authorization | **PASS** |
| E2.3 | Self-service external action stays customer-reported, no fabricated receipt | `i06-self-service` (2 cases); E2E-08 inherited `FIRST_REPORTED_PASS` | Acknowledgement required; decision recorded at an exact version; nothing fabricated | **PASS** (offline) |

Read together with §5.3: one assertion in each M8 suite fails, and both failures are the same
stale migration-head metadata assertion — not business logic. Every self-service substantive
assertion passes.

### 5.2 Managed service — expected fail-closed

| ID | Assertion | Evidence | Observation | Verdict |
|---|---|---|---|---|
| E2.4 | VIP / assignment / consent never authorize managed submission | `m4-004` (61), `m4-007` `SYS-01…05` | No valid engagement blocks; revoked/absent assignment blocks; messaging consent ≠ resource disclosure; unsigned signature blocks; payment must be genuinely satisfied | **PASS** |
| E2.5 | Managed readiness never READY without authentic authority | `i07-managed` "I-07 managed readiness never returns READY without M4 authorities"; `m4-007` | Readiness does not become READY; only an explicitly synthetic, test-only path can | **PASS** |
| E2.6 | Disabled managed action never looks like a completed professional service | `m4-006` (34), `review-http` professional dimension, M9-C owner B4 observation | Professional review stays `unavailable`/deny-all; UI disables with a stated reason | **PASS** |

**E2 managed verdict: `BLOCKED` — the contractually correct outcome.** Managed submission is
fail-closed because no authentic professional authority, credential, signature, agreement,
payment or provider exists. A `BLOCKED` managed path is not an engineering failure, and it must
never be reported as a completed professional service.

### 5.3 The two failures — precise finding

| File | Line | Assertion | Actual | Expected |
|---|---|---|---|---|
| `lib/db/m8-submission-package-migration-order.test.ts` | 104 | head advanced 0051→0052 | `0053_phase13_m9_a_project_conversation_stage` | `0052_phase13_m8_2_submission_authorization` |
| `lib/db/m8-2-authorization-migration-order.test.ts` | 217 | "0052 is the current migration head" | same | same |

**Classification: stale test metadata, not a product defect.** The journal is correctly ordered;
`0053` legitimately follows `0052` (M9-A's purely additive Project-conversation-stage migration,
itself covered by `lib/db/migration-0053-order.test.ts`, which passes). Every other assertion in
both files passes.

**Why no M9 agent saw it:** both files are excluded from `test:unit` and are reachable only via
`pnpm test:phase13:m8-1:offline` / `m8-2:offline`. M9-A/B/C validated with `test:unit` only, so
these two scripts have been red since `0053` landed in M9-A.

**Recommended narrow remediation (deliberately NOT applied in M10):** replace the head-pinning
assertion with an order-preserving one (`0052` follows `0051`, and any later tag follows `0052`),
or pin the head and update it with each migration. Separately, consider adding both files to
`test:unit` so a future migration cannot silently break an offline acceptance script. Both are
owner decisions; M10 changes no source or test code.

---

## 6. E3 — Security and reliability: findings

All offline. Three invocations were required because the suites need different runtime conditions
(server-only modules need `--conditions=react-server`; `personal-project-access` renders with
`react-dom/server` and must run **without** it). My first attempt mixed them, which produced an
*invocation* failure I corrected — recorded in §9 rather than reported as a product failure.

| # | Point | Evidence (new) | Observation | Verdict | Confidence |
|---|---|---|---|---|---|
| 1 | Project isolation | `projects/context-resolver`, `projects/project-context`, `projects/chat-policy` | Context resolution refuses foreign/absent Project context; chat policy is Project-bound | **PASS** | Directly tested (offline) |
| 2 | Cross-account access | `personal-project-access` (14), `projects/http`, `project-default-access-security` | Non-member and foreign-Project access is refused; default access is deny-by-default | **PASS** | Offline negative tests only — no new adversarial direct-API campaign |
| 3 | Standalone Chat isolation | `workspace/conversation-origin`, `chat-policy`, `stage-chats-http`, `stage-chat-repository` | Project origin is distinguishable; standalone conversations are not Project-scoped; stage chats are owner-bound | **PASS** | Offline; M9 C2 reused for the same-account UI observation |
| 4 | Staff restrictions | `project-staff-assignments/{policy,http,schema-contract}`, `lawyer-workspace/{access,queue}`, `staff-workspace/*` | Assignment grants only explicitly allowed resources; revoked/unassigned staff are refused; disclosure stays DENY | **PASS** | Offline. Positive staff browser remains **NOT VERIFIED** (B2) |
| 5 | Document trust (M2) | `project-documents/{service,http,evidence}`, `matter-documents/{customer-document-provenance,service}` (68) | Untrusted/unavailable content is not served; provenance is enforced; `documentsTrust: "unavailable"` in the submission view | **PASS** | Offline. Production ingestion/preview remains **DENY** |
| 6 | Exact-version state | `m8-1`, `m8-2`, `i03-invalidation` | Superseded versions cannot regain confirmation or review authority | **PASS** | Offline (see §5.3 metadata caveat) |
| 7 | Source availability honesty | `review/{summary,composition,http,client}` (33) | Partial/unreadable sources report `partial`/`unavailable`, never a verified empty list | **PASS** | Offline; M9-C owner observation agrees |
| 8 | Concurrency / replay | `i09-idempotency`, `student-500/store-idempotency`, `m8-1` D, `school-applications/service` CAS | Deterministic replay, 409 on changed payload, one winner on concurrent write, stale revision loses | **PASS** | Offline; inherited E2E-11/12 real HTTP/PG evidence also exists |

**E3 verdict: `PASS` for every tested path — with three explicit limits.** (a) These are offline
suites; the inherited real-HTTP/PostgreSQL campaign (E2E-11/12 `INTERNAL PASS`) and the M9 C2
same-account UI observation are the only non-offline security evidence, and neither is a fresh
adversarial cross-account run. (b) `STAFF_PRIVATE_PACKAGE_AUTHORIZATION_PENDING` remains open:
the M8.2 customer-scoped observation is still independently unapproved and the runtime authority
port is still `unavailableHandoffAuthority`. (c) A security PASS proves the tested path only; it
is not proof of the absence of access-control defects.

---

## 7. Professional pilot kit (P1)

**Status: `PROFESSIONAL_PILOT_SIGNOFF_NOT_VERIFIED`.** No lawyer or education agent has reviewed
anything. Nothing below is an approval; no name, signature or opinion has been invented. Both
packets are synthetic and contain no client data. Where a real institutional artifact would be
required, the field is marked as unavailable because it cannot be produced without trusted
external evidence.

### Packet A — School Admissions (synthetic, `M10-PILOT-A`)

| Field | Content |
|---|---|
| Applicant background | Fictional offshore applicant; bachelor's completed 2024; IELTS 6.5 self-reported (unverified); intends postgraduate study |
| Candidate courses/schools | Three fictional applications: `SYN-APP-1` (Master of IT, Course A), `SYN-APP-2` (Master of Data Science, Course B), `SYN-APP-3` (Graduate Diploma, Course C) |
| Preparation state | Versioned packages per application: `SYN-APP-1` v2 current / v1 superseded; `SYN-APP-2` v1 current; `SYN-APP-3` draft only |
| Offer / CoE evidence state | `SYN-APP-1`: no Offer → unverified; `SYN-APP-2`: customer-reported Offer → explicitly not verified; `SYN-APP-3`: no evidence |
| Missing institutional requirements | English test report (unverified), financial capacity (absent), GS statement (draft only), institution-specific documents (unknown) |
| AI-generated preparation | Deterministic preparation package + outstanding-requirement list; no lawyer approval; source/uncertainty labels attached |
| Source provenance | Per item: owning workflow, exact version, digest prefix, `verified` / `unverified` / `unknown` |
| Proposed next actions | Evidence the claimed Offer; supply authorised documents; regenerate after changes; request human review only where authority exists (currently unavailable) |
| Not available | Real Offer/CoE letters, school correspondence, institutional verification |

### Packet B — Student 500 (synthetic, `M10-PILOT-B`)

| Field | Content |
|---|---|
| Study purpose | Fictional applicant seeking a Master's to move into data analytics |
| Education background | Bachelor's 2024; transcripts self-reported (unverified) |
| English evidence | IELTS 6.5 claimed; no verified test report |
| Financial evidence | Not provided; no genuine funds evidence exists |
| Onshore/offshore | Offshore |
| GS draft | Deterministic draft from customer-confirmed facts only; labelled draft; not lawyer-approved |
| Missing / conflicting requirements | English evidence, financial capacity, genuine-student intent detail; one conflicting date between the self-reported transcript and the claimed completion |
| Source date / coverage | Manifest `m6-legal-manifest-2026-11-04-r2`; coverage **PARTIAL**; uncovered items must stay `UNKNOWN` / `HUMAN_CHECK` |
| Human-check conditions | Any eligibility conclusion, any date-sensitive assertion, any coverage claim |
| Not available | Verified legal status, authentic provider confirmation, real Offer/CoE |

### Evaluation rubric (per packet)

Reviewer role: ____________________  Review date: __________  Scope reviewed: ____________________

| # | Dimension | ACCEPTABLE | NEEDS_CORRECTION | UNSAFE | NOT ASSESSED |
|---|---|---|---|---|---|
| 1 | Factual accuracy | ☐ | ☐ | ☐ | ☐ |
| 2 | Material omissions | ☐ | ☐ | ☐ | ☐ |
| 3 | Legal/admissions source reliability | ☐ | ☐ | ☐ | ☐ |
| 4 | Evidence completeness | ☐ | ☐ | ☐ | ☐ |
| 5 | Unsafe or misleading claims | ☐ | ☐ | ☐ | ☐ |
| 6 | Workflow practicality | ☐ | ☐ | ☐ | ☐ |
| 7 | Adequacy of human-review escalation | ☐ | ☐ | ☐ | ☐ |
| 8 | Suitable for a controlled pilot (this case) | ☐ | ☐ | ☐ | ☐ |

Comments: ______________________________________________

Reviewer sign-off: ______________________  Date: __________

**None of the above is completed.** Preparing a packet is not a pilot, and M10 claims no
professional opinion exists.

---

## 8. Legal, source and extraction coverage limits

No coverage percentage is invented. Everything below is measured from repository files or is
explicitly `NOT MEASURED`.

| Metric | Numerator | Denominator | Method | Scope | Source | Outcome |
|---|---|---|---|---|---|---|
| M6 registered source identities | 21 `sourceId:` entries | — | `grep -c 'sourceId:'` | `official-source-manifest.ts` | `lib/student-500/official-source-manifest.ts` (version `m6-legal-manifest-2026-11-04-r2`) | 21 identities registered |
| M6 entries with a non-null `verifiedAt` | 2 | 21 | `grep -c 'verifiedAt: "'` | same | same | 2 |
| M6 entries explicitly `verifiedAt: null` | 3 | 21 | `grep -c 'verifiedAt: null'` | same | same | 3 (the rest carry no `verifiedAt` field) |
| M6 verification-basis mix | `text_and_provision_retrieved` 2, `register_listing_observed` 1, `declared_by_repository` 3 | — | `grep -oE 'verificationBasis: "[a-z_]+"'` | same | same | Identity/listing-level verification dominates |
| M6 legal coverage level | — | — | Manifest's own contract: only `text_and_provision_retrieved` with a real `textSha256` may support a legal conclusion; the file states Register text endpoints were not machine-readable in the authoring environment | Student 500 screening | same | **PARTIAL** — unchanged; `UNKNOWN`/`HUMAN_CHECK` retained |
| M2 production document trust | — | — | Constant inspection | Submission view | `lib/submission-packages/service.ts` (`documentsTrust: "unavailable"`) | **DENY / unavailable** |
| M2 real-format extraction quality | — | — | — | Real customer files | — | **NOT MEASURED** — no trusted ingestion corpus exists and none may be created in M10 |
| Synthetic extraction / parsing coverage | — | — | Existing offline suites only | Synthetic fixtures | `matter-documents`, `project-documents` suites | Tests pass; this does **not** prove trustworthy processing of real files |
| M8 package freshness/integrity assertions | 40 | 41 | `pnpm test:phase13:m8-1:offline` | Offline fixtures | see §5.3 | 1 stale-metadata failure only |

**Consequence for E1/E2:** no Student 500 eligibility conclusion may be certified by this system
at present. Source coverage is partial, the document trust path is closed, and no verified
professional authority exists. Those are deliberate, documented states — not M10 defects.

---

## 9. Commands actually executed

All commands were run from `/home/rico/immigration_ai/chatbot` unless stated otherwise. **No
PostgreSQL connection was made; no browser was launched; no provider was called.** Every result
below is newly executed in this M10 session.

### E1 — study journey

| Command | Exit | Tests | Pass | Fail | Skip | DB contacted |
|---|---|---|---|---|---|---|
| `pnpm test:phase13:m5-1:offline` | 0 | 62 | 62 | 0 | 0 | No (offline) |
| `pnpm test:phase13:m5-2:offline` | 0 | 94 | 94 | 0 | 0 | No |
| `pnpm test:phase13:m5-3:offline` | 0 | 30 | 30 | 0 | 0 | No |
| `pnpm test:phase13:m6-1:offline` | 0 | 101 | 101 | 0 | 0 | No |
| `pnpm test:phase13:m6-2:offline` | 0 | 65 | 65 | 0 | 0 | No |
| `pnpm test:phase13:m7:offline` | 0 | 34 | 34 | 0 | 0 | No |

### E2 — service modes

| Command | Exit | Tests | Pass | Fail | Skip | DB contacted |
|---|---|---|---|---|---|---|
| `pnpm test:phase13:m8-1:offline` | **1** | 41 | 40 | **1** | 0 | No |
| `pnpm test:phase13:m8-2:offline` | **1** | 46 | 45 | **1** | 0 | No |
| `pnpm test:phase13:m4-004:offline` | 0 | 61 | 61 | 0 | 0 | No |
| `pnpm test:phase13:m4-006:offline` | 0 | 34 | 34 | 0 | 0 | No |
| `pnpm test:phase13:m4-007:offline` | 0 | 34 | 34 | 0 | 0 | No |

### E3 — security

| Command | Exit | Tests | Pass | Fail | Skip | DB contacted |
|---|---|---|---|---|---|---|
| `node --conditions=react-server --import tsx --test` 13 project/staff/chat isolation files | 0 | 112 | 112 | 0 | 0 | No |
| `node --import tsx --test lib/projects/personal-project-access.test.ts` (no `react-server`, it uses `react-dom/server`) | 0 | 14 | 14 | 0 | 0 | No |
| `node --conditions=react-server --import tsx --test` 5 document-trust files | 0 | 68 | 68 | 0 | 0 | No |
| `node --conditions=react-server --import tsx --test` 4 review files | 0 | 33 | 33 | 0 | 0 | No |
| `node --conditions=react-server --import tsx --test` 7 staff/lawyer/observation files | 0 | 32 | 32 | 0 | 0 | No |

**Totals: 861 assertions executed, 859 pass, 2 fail (both the same stale metadata assertion), 0
skipped.**

### Invocation corrections made (recorded, not hidden)

1. First E3 batch omitted `--conditions=react-server` → `lib/projects/context-resolver.test.ts`
   failed at import with `server-only`. Not a product failure; re-ran with the flag.
2. Adding `--conditions=react-server` then broke `lib/projects/personal-project-access.test.ts`
   (`react-dom/server is not supported in React Server Components`). Not a product failure;
   split into two invocations by condition.

### Deliberately NOT executed

`*.postgres.integration.test.ts` (all), `test:phase13:*:db:integration`, Playwright/browser
suites, `pnpm test:unit` (no product source changed), `pnpm build` (documentation-only change),
any provider/AWS/Stripe/email call, any migration or database command.

---

## 10. Consolidated PASS / FAIL / BLOCKED / NOT VERIFIED matrix

| Group | Row | Verdict | Evidence origin |
|---|---|---|---|
| E1.1 | Three independent school applications | **PASS** | New (offline) + inherited E2E-01 |
| E1.2 | No-Offer application unverified | **PASS** | New (offline) |
| E1.3 | Customer-reported Offer not auto-verified | **PASS** | New (offline); inherited E2E-07 **PARTIAL**, E2E-06 **FAIL/OPEN** |
| E1.4 | Missing CoE stays missing | **PASS** | New (offline) |
| E1.5 | Authorized study-context links only | **PASS** | New (offline) |
| E1.6 | Source-grounded GS prep, no lawyer approval implied | **PASS** | New (offline) |
| E1.7 | Version change invalidates downstream | **PASS** | New (offline) |
| E1 (group) | Integrated study journey | **PASS (offline) with inherited limits** | — |
| E2.1 | Exact version + digest + bound confirmation | **PASS** | New (offline) |
| E2.2 | Superseded version cannot regain authority | **PASS** | New (offline) |
| E2.3 | Self-service stays customer-reported, no receipt | **PASS** | New (offline) + inherited E2E-08 |
| E2 self-service (group) | Customer path | **PASS (offline)** | — |
| E2.4 | VIP/assignment/consent ≠ managed authority | **PASS** | New (offline) |
| E2.5 | Managed readiness never READY without authority | **PASS** | New (offline) |
| E2.6 | Disabled managed never looks completed | **PASS** | New (offline) + M9-C owner B4 |
| E2 managed (group) | Professional submission | **BLOCKED (fail-closed, correct)** | Authority absent by design |
| E3.1 | Project isolation | **PASS** | New (offline) |
| E3.2 | Cross-account access denial | **PASS (offline only)** | New (offline) |
| E3.3 | Standalone Chat isolation | **PASS** | New (offline) + inherited M9 C2 |
| E3.4 | Staff restrictions | **PASS (offline)**; positive staff browser **NOT VERIFIED** | New (offline) |
| E3.5 | Document trust | **PASS (offline)**; production trust **DENY** | New (offline) |
| E3.6 | Exact-version state | **PASS** | New (offline) |
| E3.7 | Source availability honesty | **PASS** | New (offline) |
| E3.8 | Concurrency / replay | **PASS** | New (offline) + inherited E2E-11/12 |
| E3 hard gate | M8.2 staff private package observation | **BLOCKED — `STAFF_PRIVATE_PACKAGE_AUTHORIZATION_PENDING`** | Unapproved |
| T1 | `m8-1` migration-head assertion | **FAIL (stale test metadata)** | New |
| T2 | `m8-2` migration-head assertion | **FAIL (stale test metadata)** | New |
| P1 | Lawyer/education-agent pilot | **NOT VERIFIED** | No reviewer |
| R1 | Production/commercial release | **NO-GO** | Unchanged |
| R2 | Post-M5 Offer lifecycle (E2E-06) | **FAIL / OPEN** | Inherited, not upgraded |
| R3 | Mobile/feature-OFF browser acceptance (E2E-13) | **NOT VERIFIED** | Inherited, not upgraded |
| R4 | Real payment functional replay (M4-005 12 cases) | **NOT VERIFIED** | Inherited, not replayed |
| R5 | Real Offer / CoE / school receipt | **NOT APPLICABLE (none exists)** | No external evidence |

Nothing here is aggregated into a single score. `BLOCKED` and `NOT VERIFIED` rows are carried as
such.

---

## 11. Critical risks and deferred debt

| # | Risk / debt | Severity | Impact | Recommended handling |
|---|---|---|---|---|
| 1 | **M8.2 staff-private-package observation independently unapproved** | Critical (security) | Blocks any staff access to customer-private packages; the path is currently unreachable because the authority port is unavailable | Keep `unavailableHandoffAuthority`; obtain an independent security review before enabling |
| 2 | **No authentic professional authority** (credentials, agreement, signature, payment, provider) | Critical (business/legal) | Managed service cannot legitimately operate; professional review stays deny-all | Separate commercial/legal workstream; not an engineering fix |
| 3 | **M2 document trust DENY** | Critical (privacy) | Real uploaded documents cannot be trusted, scanned, previewed or fed to AI | Separate document-trust programme with real-format evidence |
| 4 | **M6 legal coverage PARTIAL** | High (legal accuracy) | No Student 500 eligibility can be certified; `UNKNOWN`/`HUMAN_CHECK` retained | Source verification programme; not measurable offline |
| 5 | **Offer v1→v2 lifecycle never proven** (E2E-06 harness defect) | High | Offer replacement/expiry behaviour unverified before customer exposure | Fix harness (`outcomeHistory`), then re-run that one scenario |
| 6 | **Two stale migration-head assertions** (§5.3) | Low (test hygiene) | Two offline acceptance scripts read as red; no product impact | Narrow 2-assertion update + consider adding both files to `test:unit` (owner decision) |
| 7 | **No positive staff browser proof** (B2) | Medium | Staff workspace positive path never observed end-to-end | Requires a legitimate, already-authorised synthetic staff fixture; do not fabricate one |
| 8 | **No real payment/refund/receipt lifecycle replay** (M4-005 12 cases) | High | Managed financial authority unproven | Rebuild/rerun that suite when a payment authority exists |
| 9 | **Cross-account security rests on offline negative tests** | Medium | No fresh adversarial direct-API campaign at M10 baseline | Schedule a bounded adversarial API run if a release is contemplated |
| 10 | **Extraction quality unmeasured for real files** | High | Cannot claim production document reliability | Measure only with an approved corpus; `NOT MEASURED` for now |

Explicitly **not** debt in M10's view: fail-closed `BLOCKED` professional/payment/document paths.
They are correct behaviour under the current frozen contracts.

---

## 12. Engineering verdict

**`ENGINEERING_ACCEPTED_WITH_LIMITATIONS`.**

- E1, E2 self-service and all eight E3 points pass on the tested paths: **859 of 861 executed
  assertions pass**, with zero skips.
- The two failures are one stale migration-head metadata assertion duplicated across two suites.
  They prove a test-maintenance gap, not a defect in the product's migration order, package
  authority or authorization behaviour.
- E2 managed is `BLOCKED` exactly as its contract requires.
- No new product defect was found, and **no source change was made**.

This verdict is about engineering integration at the frozen baseline. It is **not** a security
certification, a legal-accuracy certification, a professional-approval signal or a release
approval.

---

## 13. Professional pilot status

**`PROFESSIONAL_PILOT_SIGNOFF_NOT_VERIFIED`.**

Two synthetic packets and an eight-item rubric are prepared (§7). No lawyer or education agent
has reviewed them; no feedback, rating or sign-off exists; nothing has been sent to any external
party. Preparing the kit is not completing the pilot, and M10 stops here rather than waiting for
a reviewer.

---

## 14. Release Go/No-Go recommendation

**`LIVE_PRODUCTION_NO_GO` — NO-GO recommended, unanimously across all four release dimensions.**

| Dimension | State | Basis |
|---|---|---|
| Engineering reliability | Accepted with limitations | §12: 859/861 offline assertions; two stale-metadata failures |
| Security and data protection | Not releasable | M8.2 hard gate `PENDING`; cross-account evidence offline-only; M2 trust DENY |
| Professional pilot | `NOT VERIFIED` | No reviewer sign-off |
| Production/commercial | **NO-GO** | No authentic professional authority, no trusted document pipeline, partial legal coverage, no payment/contract evidence, no external provider, no operational sign-off |

M10 does not clear this, and passing engineering tests must never clear it. A future GO requires,
for the exact release scope: an approved M8.2 security review, verified professional authority and
credential handling, a trusted document pipeline, sufficient legal-source coverage with
date-aware provenance, real payment/contract evidence, external-provider readiness and explicit
operational/incident ownership. None exists today.

---

## 15. Owner approval still required

Outstanding owner actions (none of which M10 may perform):

1. **Review this report and the patch** (`~/phase13_m10_review.patch`, §16).
2. **Decide the two stale-assertion findings** — apply the narrow metadata fix and/or add the two
   M8 offline files to `test:unit`.
3. **Decide whether to keep the compiled M10 protocol as the formal acceptance record.**
4. **Schedule or decline the professional pilot.** If declined or pending, the status stays
   `PROFESSIONAL_PILOT_SIGNOFF_NOT_VERIFIED`.
5. **Record the M10 closeout** in `CURRENT_MILESTONE.md`, `PROJECT_STATE.md` and `DECISIONS.md`.
   M10 deliberately did not write an accepted verdict there.
6. **Commit/push decision** — M10 made no commit.

### Bounded owner acceptance guide (three activities, ≤1 hour total)

**Activity 1 — Integrated customer journey (reuse existing synthetic data).**
Open synthetic Project A (`#5401f8c8`). Visit School applications → one application's preparation
package → Student 500 preparation context → Project documents → Lawyer review. Confirm: versions
and digests are visible, a superseded version offers no current authority, AI check says *not
integrated*, professional review is disabled with a reason, and any unreadable source is labelled
rather than shown as empty. Do not regenerate documents or rewrite applications.

**Activity 2 — Service-mode outcome (no new fixtures).**
Confirm one Self-Service outcome against the historical M8 evidence (exact version + bound
confirmation + customer-reported classification) and one Managed outcome that stays fail-closed
(readiness not READY, professional action disabled). Do not attempt to create staff authorization,
a lawyer credential, an agreement or a payment.

**Activity 3 — Professional evaluation (optional, external).**
If a lawyer or education agent is available, present the two synthetic packets from §7 and record
their real ratings and comments in the rubric. If not available, mark `NOT VERIFIED` and stop —
the owner decides separately whether to schedule the pilot.

---

## 16. Patch identity and Git state

Cumulative patch relative to `842e3fd87a5aa081ff45eccef4362b437ea9955f`:

```
branch:            phase13-m9-integrated-workspace
HEAD:              842e3fd87a5aa081ff45eccef4362b437ea9955f   (unchanged; nothing committed)
files changed:     2   (1 new, 1 modified)
insertions:        188
deletions:         0
git diff --check:  clean
patch:             ~/phase13_m10_review.patch
patch size:        14,189 bytes
patch entries:     2 diff headers
reverse-apply:     verified (`git apply --check --reverse`)
SHA-256:           849fd98c33c9cbdd3bb430e215f03a8728c69743468038714ec25ccd0a151a97
```

| Path | Status | Lines added |
|---|---|---|
| `docs/agent-memory/PHASE13_M10_CONSOLIDATED_ACCEPTANCE_PROTOCOL_2026_11_10.md` | **new** (169 lines) | 169 |
| `docs/agent-memory/CURRENT_HANDOFF.md` | modified | 19 |

The new file was included with a narrow `git add -N -- <path>`; nothing else was staged. **No
product source, test code, configuration, migration or `package.json` change is in this patch** —
M10 changed documentation only. `CURRENT_MILESTONE.md`, `PROJECT_STATE.md` and `DECISIONS.md` are
deliberately untouched.

**No commit, push, merge, rebase, reset, branch change, deploy or migration was performed.**
