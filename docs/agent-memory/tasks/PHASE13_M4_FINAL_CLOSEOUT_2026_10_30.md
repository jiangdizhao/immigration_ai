# Phase 13 M4 — FINAL ACCEPTANCE & CLOSEOUT (2026-10-30)

**Disposition: `PHASE13 M4 ENGINEERING CLOSED_WITH_BLOCKERS / PRODUCTION NO_GO`**

Final engineering operation for Phase 13 M4. One isolated PostgreSQL environment was created, migrations were applied
exactly once, and the guarded M4-006 integration harness was executed **once**. Installation, identity and privilege
verification all passed; the harness reported **12 of 17 scenarios PASS, 5 FAIL, process exit 1**. Per the owner's
stopping rule, nothing was repaired, rerun, or worked around. This document is the closing record.

- Repository: `/home/rico/immigration_ai`
- Branch: `phase13-study-journey-project-centric`
- HEAD: `3d5467193e161fe4359f2bbe69e3b0507d2fa156` (unchanged)
- Working tree: preserved (77 entries before this document, 78 after — no source file modified in this operation)
- Commits / pushes / deploys / migrations on non-disposable targets / feature flags: **none**

---

## 1. Source verification (before any database operation)

| Item | Expected | Observed | Result |
|---|---|---|---|
| Migration 0044 SHA-256 | `d90ebf497dd049cb4f6fc221d2129639714028849a819e7dbb6e5b32a6146f0e` | identical | PASS |
| Migration 0045 SHA-256 | `1f50752a19df80a538ce50a58e47d852c3373881a133bb3ebe3e556fff8f11ac` | identical | PASS |
| Journal entries / latest idx | 46 / 45 | 46 / `45_phase13_m4_006_professional_review` | PASS |
| Journal head `when` | — | `1793320044169` | recorded |
| HEAD | `3d546719…` | identical | PASS |
| Staged changes | 0 | 0 | PASS |

## 2. Isolated disposable environment

| Property | Value |
|---|---|
| Container | `phase13-m4-final-pg` (labels `phase13.m4.milestone=final`, `phase13.m4.disposable=true`) |
| Container id | `88e0bf858a00cf4d77f03cfd5f3a7ae7c9c21533546343c16a4783d0a5966ce8` |
| Image | `postgres:17`, image id `sha256:82903352d6faf8f8a318bc4353d1cb1db67d4a5ff968d2799b2718e2cb00afa2`, repo digest `postgres@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe`, created `2026-10-21T00:37:20Z` |
| Server version | `17.11 (Debian 17.11-1.pgdg13+2)` |
| Cluster system identifier | `7702277406417649701` (`pg_control_system()`) |
| Bind | `127.0.0.1:55446 → 5432/tcp` (host loopback only) |
| Database | `immigration_ai_phase13_m4_final_test` (owner `phase13_m4_final_migrator`) |
| Migrator role | `phase13_m4_final_migrator` (NOSUPERUSER, NOCREATEDB, NOCREATEROLE) |
| Tester role | `phase13_m4_final_tester` (NOSUPERUSER, NOCREATEDB, NOCREATEROLE, owns 0 relations) |
| Pre-creation conflict check | container name free, port 55446 free, image local, no other target touched |

Credentials were generated locally with a CSPRNG, held only in `/tmp/phase13-m4-final/*.{pw,url,env}` (mode 600, directory
700), never passed on a command line, never echoed, and are **not** reproduced in this document or any artifact.

**No M4-002, M4-003, M4-004, M4-005, staging, production or customer database was read, written, migrated or repurposed.**

## 3. Migration execution (single authorized operation)

- Command: `POSTGRES_URL=<migrator url> pnpm db:migrate --acknowledge-migrations --expect-database=immigration_ai_phase13_m4_final_test`
- Result: **`Migration operation completed.`**, exit **0**. Executed once; no retry.
- Only NOTICEs were emitted (PG 63-byte identifier truncation warnings), no ERROR.
- Sanitized log: `/tmp/phase13-m4-final/migrate.sanitized.log`, SHA-256 `f0b6fb814eb42ed97d0902ba63000f684df989386eddaa10302aca5d09f16e06`.

### Ledger and installation verification

| Check | Expected | Observed | Result |
|---|---|---|---|
| Ledger records | 46 | **46** | PASS |
| Head record | id 46 | `id=46 when=1793320044169` | PASS |
| Head hash | pinned 0045 digest | **`1f50752a19df80a538ce50a58e47d852c3373881a133bb3ebe3e556fff8f11ac`** | PASS (no override used) |
| Head `when` vs journal | `1793320044169` | identical | PASS |
| M4-006 tables | 2 | 2 | PASS |
| M4-006 unique indexes | 4 | 4 | PASS |
| M4-006 CHECK constraints | 12 | 12 | PASS |
| Guard triggers | 2, enabled | `ProfessionalReviewRequest_guard=O`, `ProfessionalReviewRevision_guard=O` | PASS |
| Guard functions | 2 | both present | PASS |
| Public base tables | — | 81 | recorded |
| Tester `public` CREATE | false | false | PASS |
| Tester INSERT on `ServicePaymentCondition` (frozen M4-005) | false | false | PASS |
| Tester INSERT/UPDATE on `ProfessionalReviewRequest` | true | true | PASS |
| Tester SELECT on `drizzle.__drizzle_migrations` | true | true | PASS |
| Tester INSERT on ledger | false | false | PASS |
| Tester owned relations | 0 | 0 | PASS |
| Tester superuser/createdb/createrole | false | false | PASS |

**Migration 0045 is installation-validated**: the marker repair shipped in the prior round genuinely produces an
executable 30-statement migration, and drizzle applies it with the exact pinned content hash.

## 4. Integration suite execution (single run)

- Command: `node --conditions=react-server --import tsx scripts/phase13-m4-006-db-test.ts`
  with `PHASE13_M4_006_DB_URL` (tester), `_EXPECTED_DB`, `_EXPECTED_ROLE`,
  `_EXPECTED_SYSTEM_IDENTIFIER=7702277406417649701`, `_EXPECTED_HOST=172.17.0.6/32`, `_EXPECTED_PORT=5432`.
- `--conditions=react-server` is this repository's documented invocation for server-only modules outside Next.js
  (`package.json` scripts 32–47; `scripts/phase13-m4-005-db-test.ts:141` spawns its child with the same flag).
- Identity expectations were taken from a **read-only preflight observation** of the same endpoint the harness uses; the
  ledger-hash override was deliberately **not** set, so the harness compared against the pinned file digest and matched.
- Watchdog: the harness's own 180 s bounded watchdog; external `timeout 200`.
- **Result: `summary: 12/17 scenarios passed, 5 failed, 0 not executed`, process exit `1`.**
- Sanitized log: `/tmp/phase13-m4-final/harness.sanitized.log`, SHA-256 `26d9c35dc6e01ce7692a431de6724d66987a3af7c09c6d36ce3ddffa29310315` (0 credential strings).

> Recorded for completeness: a first spawn used `pnpm exec tsx …` without the repository's `--conditions=react-server`
> and aborted inside the `server-only` import guard **before** any connection or scenario (0 scenarios, 0 DB sessions),
> producing no data. It is noted because it exposes a real defect in the deliverable's invocation contract:
> **no `test:phase13:m4-006:integration` script is registered** (unlike M4-003/004/005).

### Per-scenario result

| ID | Scenario | Result |
|---|---|---|
| INT-01 | review request survives a new connection | **PASS** |
| INT-02 | immutable history reconstructable | **PASS** |
| INT-03 | concurrent decisions: exactly one winner | **PASS** |
| INT-04 | exact replay creates no duplicate revision | **PASS** |
| INT-05 | changed replay rejected | **PASS** |
| INT-06 | approval bound to the exact target version/hash | **FAIL** — first failure |
| INT-07 | revoked assignment invalidates review validity | **FAIL** |
| INT-08 | real Project/Engagement projection through the snapshot | **PASS** |
| INT-09 | undisclosed resource is not authorized | **PASS** |
| INT-10 | unknown customer-confirmation policy | **PASS** |
| INT-11 | absent production authorities cannot make READY | **PASS** |
| INT-12 | concurrent revision change never becomes permission | **FAIL** |
| INT-13 | synthetic READY stays test-only | **PASS** |
| INT-14 | production composition never READY | **PASS** |
| DB-01 | append-only trigger refuses UPDATE and DELETE | **FAIL** |
| DB-02 | projection trigger refuses revision skip, rebinding and illegal transition | **FAIL** |
| DB-03 | restricted tester cannot DDL or write frozen M4-005 tables | **PASS** |

The coverage guard reported the five failures as `scenario_failed` and forced exit 1 — the harness refused to report
success. Its own success path was therefore never exercised in a passing state.

## 5. First failure and root cause (read-only diagnosis)

**First failure: `INT-06 approval bound to the exact target version/hash` → `integrity_conflict`.**

Chain of evidence:

1. Installed trigger `phase13_m4_006_request_guard` permits exactly these transitions
   (`lib/db/migrations/0045_phase13_m4_006_professional_review.sql`):
   `requested → in_review`; `in_review → {changes_requested, approved, rejected}`; `any → invalidated`.
   Any other transition raises `23514` / `ProfessionalReviewRequest_transition`.
2. `lib/db/professional-review-repository.ts` maps SQLSTATE `23514` to `ProfessionalReviewError("integrity_conflict")`.
3. The harness drove the fixture into `changes_requested` (INT-03 race wrote `request_changes`), then INT-06 attempted
   `changes_requested → approved`, which the frozen contract forbids.
4. Confirmed persisted state: `1:create_request:requested → 2:start_review:in_review → 3:request_changes:changes_requested`,
   head `revision=3 state=changes_requested`, `revision_rows=3`.

**Classification: `HARNESS_SCENARIO_COMPOSITION` — a defect in the test scenario, not in the product.** The database and
repository behaved exactly as designed (fail-closed refusal of an illegal transition).

### Cascading failures

| Scenario | Observed | Cause | Classification |
|---|---|---|---|
| INT-07 | `state changes_requested` | asserts on the approved record INT-06 was supposed to create | `HARNESS_SEQUENCING` |
| DB-01 | `history changed` (final assertion) | expected exactly 4 revision rows; 3 exist. **Its two trigger probes (UPDATE → 23514, DELETE → 23514) ran and passed before this assertion** | `HARNESS_ASSERTION` |
| DB-02 | `head drifted` (final assertion) | expected head `approved`/revision 4; head is `changes_requested`/revision 3. **Its three probes (revision skip, target rebind, illegal transition → 23514) ran and passed before this assertion** | `HARNESS_ASSERTION` |
| INT-12 | `status NOT_READY` (expected `UNKNOWN`) | with no engagement/agreement/disclosure/payment rows, absence reasons short-circuit to NOT_READY before the concurrency check. NOT_READY is *more* conservative than UNKNOWN, so the product is safe; the expectation was wrong | `HARNESS_EXPECTATION` |

**No observed failure represents unsafe product behaviour.** Every refusal observed was the intended fail-closed outcome.

## 6. Evidence that protected state survived the run

| Check | Observed |
|---|---|
| Ledger after suite | 46 records, head `id=46 when=1793320044169`, hash `1f50752a…f11ac` (unchanged) |
| M4-006 history after suite | 3 rows, head `changes_requested`; no mutation from any refused probe |
| Triggers after suite | both still enabled (`O`) |
| Tester sessions after exit | **0** — no leaked connections |
| Fixture residue | 1 Project + 1 review request in the disposable database (append-only history cannot be deleted by design) |
| Non-disposable databases | untouched |

## 7. Milestone capability classification (actual status)

Legend: **I** implemented · **O** offline-validated · **D** database-validated · **L** accepted-with-limitations ·
**U** unverified/blocked.

| Milestone | Classification | Notes |
|---|---|---|
| **M4-002** named-lawyer assignment | **D / L** (unchanged, not re-run) | Prior isolated PostgreSQL acceptance (2026-10-28) stands. This operation applied migrations 0000–0045 to a new disposable database but did not re-run M4-002 scenarios. |
| **M4-003** human messaging + consent | **D / L** (unchanged, not re-run) | Prior isolated acceptance stands. Consent never authorizes protected facts/documents/chats, contracts or professional approvals. |
| **M4-004** contract, signature, disclosure | **I / O / U (positive DB path)** | Offline 61/61 + guard 7/7. In this run only the **absence** paths of the read model were exercised (INT-08/09). No positive engagement/agreement/acceptance/signature/disclosure rows were seeded, so end-to-end positive DB acceptance remains **unverified**. Historically recorded as implemented/uncommitted pending independent review. |
| **M4-005** payment condition | **D / L** (frozen, untouched) | Stays `DATABASE VALIDATED / FUNCTIONAL VALIDATION INCOMPLETE / FEATURE OFF`. Migration 0044 byte-identical (`d90ebf49…6f0e`). Its 6 stale journal-shape assertions (99/101, 11/15) remain unrepaired by instruction; Stage 3B not rerun (29/41 historical). |
| **M4-006** professional review persistence | **D (partial) / U (approval path)** | **Database-validated:** installation (table/index/constraint/trigger/function), cross-connection durability (INT-01), append-only history (INT-02), concurrent CAS single winner (INT-03), exact replay (INT-04), conflicting replay rejected (INT-05), restricted tester (DB-03), and trigger refusals for UPDATE / DELETE / revision-skip / rebind / illegal transition (probes inside DB-01 and DB-02 passed before their assertion failures). **Not database-validated as a passing scenario:** approval persistence at an approved terminal state (INT-06), validity of a persisted approved record after assignment revocation (INT-07), and the post-condition assertions of DB-01/DB-02. |
| **M4-007** managed-handoff readiness | **I / O / D (negative paths only)** | Database-validated: real Project/membership projection, engagement absence, disclosure isolation, unknown customer-confirmation policy, absent authorities, production never READY, synthetic READY tagged `synthetic_test`, production composition UNKNOWN (INT-08/09/10/11/13/14). **Not** validated: concurrency-drift mapping as a passing scenario (INT-12), and any **positive** READY in production composition. |

### Real-world dependencies still absent (production remains NO_GO)

1. Professional-credential verification authority (no registry; production returns `unavailable`).
2. Signature-authority policy (no approved signature verification).
3. Payment-validity authority (no trusted payment source; positives downgrade to UNKNOWN).
4. Application-package provider (no real target/package source).
5. Customer-confirmation policy (production → `policy_unknown` → never a positive).

**Synthetic READY is not production READY.** INT-13's READY is produced only by test-only adapters and is tagged
`evidenceProvenance=synthetic_test`; production composition returns UNKNOWN/NOT_READY (INT-14, INT-11).

**Scope warning about the 17 scenarios:** they do **not** cover a fully positive real-world
payment/signature/credential/package workflow. They cover persistence, concurrency, idempotency, projection, absence
handling, authority-absence conservatism, refusal invariants and privilege boundaries.

## 8. Required before M5 submission authorization

1. Seed a **positive** M4-004 chain (engagement → agreement version → acceptance → signature evidence → disclosure grant)
   in an authorized isolated environment and re-run M4-007 readiness to prove a real positive path.
2. Fix the M4-006 harness scenario composition (approve from `in_review`, not from `changes_requested`; independent
   fixtures per scenario; assertions derived from observed state rather than constants) and register a
   `test:phase13:m4-006:integration` script that includes `--conditions=react-server`.
3. Resolve the five real-provider policies above, with owner-approved authority contracts and evidence formats.
4. Provide a trusted payment-validity source so `paymentValidity` can leave `"untrusted"`.
5. Re-run the complete M4 acceptance set against fresh isolated environments after (1)–(4), including M4-002/003/004
   regression suites, before any submission/handoff feature flag is enabled.
6. Keep every M4 feature flag OFF until then.

## 9. Non-goals honored in this operation

No source/test/harness/grant/fixture change after the failure. No migration retry. No environment reset. No privilege
workaround. No rerun of the suite. No M4-005 Stage 3B execution. No commit, push, deploy, container reset or feature-flag
change. No new repair milestone, and no R1/R2/R3 correction cycle is recommended.

## 10. Artifacts preserved for independent inspection

| Artifact | Location | SHA-256 |
|---|---|---|
| Sanitized harness log | `/tmp/phase13-m4-final/harness.sanitized.log` | `26d9c35dc6e01ce7692a431de6724d66987a3af7c09c6d36ce3ddffa29310315` |
| Sanitized migration log | `/tmp/phase13-m4-final/migrate.sanitized.log` | `f0b6fb814eb42ed97d0902ba63000f684df989386eddaa10302aca5d09f16e06` |
| Container (running, disposable) | `phase13-m4-final-pg` / `88e0bf85…66ce8` | image `sha256:82903352d6fa…` |
| Database | `immigration_ai_phase13_m4_final_test` on `127.0.0.1:55446` | cluster `7702277406417649701` |
| Migration 0045 | `chatbot/lib/db/migrations/0045_phase13_m4_006_professional_review.sql` | `1f50752a19df80a538ce50a58e47d852c3373881a133bb3ebe3e556fff8f11ac` |

The container and database are intentionally **left in place and unmodified** for owner/reviewer inspection. Disposal is
an owner action.

## 11. Final statement

Phase 13 M4 is **administratively closed with blockers**. Migration 0045 and the M4-006 schema are proven installable and
enforced in PostgreSQL; twelve integration scenarios are database-validated, and every observed refusal was the intended
fail-closed behaviour. Five scenarios did not satisfy their assertions because of harness scenario-composition defects
(a forbidden `changes_requested → approved` transition and constants that assumed it succeeded), not because of product
misbehaviour — and that distinction is recorded here rather than converted into an acceptance claim.

**Production remains NO_GO.** Unresolved risks are enumerated in §7–§8 for later owner prioritization.
