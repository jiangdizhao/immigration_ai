# Phase 13 M10 — Consolidated Acceptance Protocol (frozen 2026-11-10)

**Milestone:** M10 — End-to-End Reliability + Lawyer/Education-Agent Pilot
**Milestone type:** acceptance and evidence consolidation. **No feature development.**
**Baseline:** `phase13-m9-integrated-workspace` @ `842e3fd87a5aa081ff45eccef4362b437ea9955f`
**Governing row:** [Study Journey Roadmap](./PHASE13_STUDY_JOURNEY_ROADMAP.md) M10 row
("policy/version regression, de-identified/synthetic scenarios, real-format extraction tests,
multi-school to CoE to 500, staff handoff and self-service; scoped release/security review").
**Prior closeout:** D-P13-034 (`M9_ENGINEERING_ACCEPTED_WITH_LIMITATIONS`).
**Release status:** `LIVE_PRODUCTION_NO_GO`.

This is the **single** formal M10 acceptance protocol. There are no M10.1/M10.2/M10.3
sub-milestones and no per-layer acceptance variants.

---

## 1. Frozen scope

**In scope**

1. Inventory of existing M4–M9 acceptance evidence.
2. Minimal cross-module end-to-end verification using existing offline suites and synthetic fixtures.
3. Focused authorization/reliability checks mapped to eight security points.
4. Professional pilot kit (two synthetic case packets + evaluation rubric).
5. Honest source/legal/extraction coverage reporting.
6. One consolidated Go/No-Go report with separate engineering, security, professional and
   production dimensions.

**Out of scope (prohibited in M10)**

- New Project Workspace, document ingestion, legal-reasoning, review, payment or submission code.
- Remediation of historical M4/M5/M6/M7 blockers.
- Database migration, reset, fixture insertion or database-writing suites.
- Feature-flag activation, provider/AWS/Stripe/email calls, external submissions, deployment.
- Fabricated professional credentials, sign-off, Offer/CoE, receipts or authority.
- Any change to `CURRENT_MILESTONE.md` / `PROJECT_STATE.md` / `DECISIONS.md` recording M10 as
  accepted before the owner's own acceptance.

**Default rule:** no production-code changes. A source correction may only be *proposed* when a
reproducible critical safety or primary-path defect is found, and never implemented
automatically when it would alter business authority, privacy boundaries, migrations or
production behaviour.

---

## 2. Acceptance matrix (four groups, not milestones)

### E1 — School admissions → Student 500 (integrated study journey)

| ID | Assertion | Primary evidence |
|---|---|---|
| E1.1 | ≥3 independent school applications in one Project keep independent identities | `lib/school-admissions-integration/i01-applications.test.ts`; `lib/school-applications/service.test.ts`; E2E-01 (inherited) |
| E1.2 | Application without an Offer stays unverified | `i05-entry-routes`; `lib/student-500/preparation/service.test.ts` |
| E1.3 | Customer-reported / document-backed Offer is never auto-verified | `i04-outcomes`; E2E-07 (inherited, PARTIAL) |
| E1.4 | CoE evidence state honest; missing CoE stays missing | `i04-outcomes`, `i05-entry-routes`, `preparation/service` |
| E1.5 | Student 500 uses only authorized study-context links | `preparation/service.test.ts`, `i08-authorization` |
| E1.6 | Source-grounded GS prep + outstanding requirements; no lawyer approval implied | `m6-2:offline`, `m7:offline`, `review-summary` (professional dimension) |
| E1.7 | Version change invalidates downstream confirmation | `i03-invalidation`; `m8-1:offline` (independent freshness) |

### E2 — Self-service vs managed service

| ID | Assertion | Primary evidence |
|---|---|---|
| E2.1 | Exact package version + manifest digest + version-bound confirmation | `m8-1:offline` |
| E2.2 | Stale/superseded version cannot regain confirmation authority | `m8-1:offline`, `i03-invalidation` |
| E2.3 | Self-service external action stays customer-reported; no fabricated receipt | `i06-self-service`; E2E-08 (inherited) |
| E2.4 | VIP/assignment/consent do not authorize managed submission | `m4-004:offline`, `m4-007:offline` (`SYS-01…05`) |
| E2.5 | Managed readiness never READY without authentic authority; fail-closed | `i07-managed`, `m4-007:offline`, `m4-006:offline` |
| E2.6 | Disabled managed action cannot look like a completed professional service | `i07-managed`, `review-http` professional dimension |

### E3 — Security and reliability (maximum eight points)

| # | Point | Primary evidence |
|---|---|---|
| 1 | Project isolation | `lib/projects/*.test.ts` (isolation/context) |
| 2 | Cross-account access denial | `personal-project-access`, `project-default-access-security`, `projects/http` |
| 3 | Standalone Chat isolation | `lib/workspace/conversation-origin`, `chat-policy`, `stage-chat*` |
| 4 | Staff restrictions / revoked assignment | `project-staff-assignments/*`, `lawyer-workspace/access`, `staff-workspace/*` |
| 5 | Document trust (M2) | `lib/project-documents/*`, `matter-documents/customer-document-provenance`, `matter-documents/service` |
| 6 | Exact-version state | `m8-1/m8-2:offline`, `i03-invalidation` |
| 7 | Source availability honesty (partial ≠ empty) | `lib/review/*.test.ts` |
| 8 | Concurrency / replay / idempotency | `i09-idempotency`, `store-idempotency`, `m8-1` replay cases |

**M8.2 hard gate:** `STAFF_PRIVATE_PACKAGE_AUTHORIZATION_PENDING`. The customer-scoped
observation used during a Staff handoff remains independently unapproved; the runtime authority
port stays `unavailableHandoffAuthority`. M10 must not enable, widen, or declare it safe.

### P1 — Professional pilot

Two synthetic packets (School Admissions; Student 500), an eight-item rubric
(`ACCEPTABLE` / `NEEDS_CORRECTION` / `UNSAFE` / `NOT ASSESSED`), reviewer role/date/scope and
explicit sign-off fields. Until a real reviewer signs, status is
`PROFESSIONAL_PILOT_SIGNOFF_NOT_VERIFIED`.

---

## 3. Minimal test selection

Run only suites that materially support a matrix row, all offline:

- `pnpm test:phase13:{m5-1,m5-2,m5-3,m6-1,m6-2,m7}:offline` — E1.
- `pnpm test:phase13:{m8-1,m8-2,m4-004,m4-006,m4-007}:offline` — E2.
- Targeted `node --import tsx --test …` for E3 files, splitting by required runtime condition:
  server-only modules need `--conditions=react-server`; files importing `react-dom/server` must
  run **without** it.

Rules:

- Do not rerun a suite merely because a historical milestone listed it.
- Do not run `*.postgres.integration.test.ts` or any database-writing suite.
- A guarded skip is **not** a pass. An incorrect invocation (missing `--conditions`) is **not** a
  product failure — it is corrected and recorded.
- Full `pnpm test:unit` is **not** rerun when no product source changes.
- Build/Biome only if source or config changes (documentation-only changes do not justify them).

---

## 4. Verdicts and evidence-reuse rules

Allowed verdicts: `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED`, `NOT APPLICABLE`.

For every row the report must state: scenario ID, intended contract, source/test reference,
execution method, actual observation, verdict, limitations, and whether the evidence is
**newly executed** or **inherited** (with its original scope and date).

- An inherited `PASS` keeps its original scope and date; it never becomes a stronger claim.
- A historical `FAIL`/`PARTIAL` may not be upgraded without actual evidence.
- Offline tests prove only the tested path. Same-account UI observations do not prove
  cross-account or direct-API security.
- A deliberately blocked professional capability is a correct fail-closed outcome, not a failure.

---

## 5. Hard safety gates for this protocol

1. No database read, write, migration, reset or fixture insertion.
2. No browser/E2E run, feature flag, provider, AWS/Stripe/email or external submission.
3. No fabricated professional authority, credential, agreement, payment, Offer/CoE or receipt.
4. No enabling or widening of the M8.2 staff-private-package observation.
5. No commit, push, merge, rebase, reset or deploy.
6. Secrets and `.env.local` never read, printed or modified.

---

## 6. Go/No-Go rubric (four separate dimensions)

| Dimension | Allowed states | Rule |
|---|---|---|
| Engineering reliability | `ENGINEERING_ACCEPTED_WITH_LIMITATIONS` / `ENGINEERING_BLOCKED` / `INSUFFICIENT_EVIDENCE` | Decided by tested-path coverage; documented limits are acceptable. |
| Security & data protection | pass / blocked | Any known unauthorized protected-data read or invalid hard-gate passage is critical failure. Inference never upgrades to PASS. |
| Professional pilot | verified / `NOT VERIFIED` | Only a real reviewer sign-off counts; a prepared kit is not a pilot. |
| Production/commercial release | `LIVE_PRODUCTION_NO_GO` | Cleared only by an explicitly authorized future release decision, never by M10 engineering tests. |

No aggregate score may hide `BLOCKED` or `NOT VERIFIED` items.

---

## 7. Stop criteria

Stop when:

- E1–E3 and P1 have evidence-backed verdicts, with inherited evidence labelled as inherited;
- the professional kit is prepared and any missing sign-off is recorded as `NOT VERIFIED`;
- carried blockers (M8.2, M4 professional authority, M2 trust DENY, M6 PARTIAL, Post-M5
  `E2E_BLOCKED`) are stated exactly as they remain;
- engineering and release verdicts are separate and the release verdict stays NO-GO;
- one report and one hash-verified cumulative patch exist, with nothing committed.

Do not continue to make the table green. Do not open a repair campaign.
