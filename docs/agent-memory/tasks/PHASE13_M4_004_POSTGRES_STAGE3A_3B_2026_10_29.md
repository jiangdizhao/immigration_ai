# Phase 13 M4-004 — authorized PostgreSQL Stage 3A/3B execution record

**Recorded:** 2026-10-29, Australia/Sydney
**Branch:** `phase13-study-journey-project-centric`
**Base HEAD (unchanged):** `b64b201536e23e79cd8e9e7be6909328237c40e3`
**Owner authorization:** M4-004 isolated PostgreSQL Stage 3A/3B, one execution round.
**Status:** `STAGE3A VERIFIED / STAGE3B FAILED` — **not accepted, not production-ready.**

## Authorized launcher correction (only authorized source change)

`chatbot/scripts/phase13-m4-004-db-test.ts` read the approval token **value** as an
environment-variable name:

```ts
// before
requireM4_004_IntegrationApproval(process.env[M4_004_TEST_APPROVAL]);
// after
requireM4_004_IntegrationApproval(process.env.PHASE13_M4_004_TEST_APPROVAL);
```

Before the fix the launcher looked for a variable literally named
`RUN_M4_004_POSTGRES_INTEGRATION`, so an approved run always failed closed.
`scripts/phase13-m4-004-db-test-guard.test.ts` gained one focused regression test
(`the launcher reads the approved approval environment variable`) that also asserts
the inverted form can never return; guard suite is 7/7.

## Stage 3A — VERIFIED

| Item | Value |
| --- | --- |
| Container | `phase13-m4-004-pg`, id `4e5b2d24851f…`, label `immigration-ai.phase13=m4-004-isolated-test` |
| Image | `postgres:17`, image id `sha256:82903352d6faf8f8a318bc4353d1cb1db67d4a5ff968d2799b2718e2cb00afa2` (locally present; no pull; unchanged across the run) |
| Port / tmpfs | `127.0.0.1:55444 → 5432/tcp`, tmpfs `/var/lib/postgresql/data:rw,nosuid,nodev,size=1g`, `Mounts=[]` |
| Database / owner | `immigration_ai_phase13_m4_004_test` owned by `phase13_m4_004_migrator` |
| Migration role | `phase13_m4_004_migrator` (login, no superuser/createdb/createrole) — used only for migrations |
| Integration role | `phase13_m4_004_tester` (login, no superuser/createdb/createrole, `public` CREATE denied → `42501`, TEMP allowed) |
| Migration | `db-migration-operator.ts --acknowledge-migrations --expect-database=…`, **exit 0**, `Migration operation completed.`, single run |
| Ledger | **44 rows**, head id `44`, hash `4cc2861c…3c06dfe`, `created_at 1793233341879` (matches journal `when`) |
| Schema | 5 M4-004 tables, composite FK `ServiceEngagement_current_agreement_fk`, 2 scope CHECKs, 5 non-internal guard triggers, 28 indexes |
| Log | `/home/rico/phase13_m4_004_stage3a_authorized_run.log`, SHA-256 `6a0d151782588824d870bedc625de4568a636dfe6f81e0a5e3663f36f1555405` |

Stage 3A invariants were queried **as the restricted tester role**, not as the
migrator or superuser.

## Stage 3B — FAILED (12 pass / 3 fail / 0 cancelled / 0 skipped, exit 1)

Guard preflight **PASSED** (approval token, exact URL, Docker identity, loopback
port, tmpfs, database identity, restricted role, 44-row ledger, pinned 0043 hash,
child environment). The child suite then ran once:

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Pinned Migration 0043 identity | PASS |
| 2 | Assigned lawyer denied Engagement detail | PASS |
| 3 | Draft authority binds exact version id | PASS |
| 4 | Agreement scope mismatch and stale revision | PASS |
| 5 | Managed activation requires issue + acceptance + verified evidence | PASS |
| 6 | Signature timestamp skew boundary and verified activation | **FAIL** (F1) |
| 7 | Grant recipient list/detail after revocation | PASS |
| 8 | Resource Owner membership revocation | PASS |
| 9 | Installed scope CHECK catalog identity | **FAIL** (F2) |
| 10 | Composite current-agreement FK metadata | PASS |
| 11 | Concurrency and idempotency | PASS |
| 12 | Database guard triggers | PASS |
| 13 | Canonical agreement terms at the write boundary | **FAIL** (F3) |
| 14 | Eligible/ineligible grant pagination | PASS |
| 15 | Real constraint behaviour on isolated temp tables | PASS |

Log: `/home/rico/phase13_m4_004_stage3b_authorized_run.log`, SHA-256 `5eabb9630a516f8fee6ffcd6c5d4c8853b7f9308506caffb82a12caf423c4f48`.

### F1 — test expectation mismatch (not a production defect)

Scenario 6, "pending evidence cannot activate a managed service" expected
`state_conflict`; the repository returns **`authority_denied`** from
`assertActivationEligible` (`service-engagement-repository.ts:2206`), the deliberate
fail-closed branch for "no independently verified signature evidence".
`state_conflict` covers the earlier structural preconditions (no current version,
version not issued, no acceptance) — proven in Scenario 5, which passed.
Fix: expectation only.

### F2 — brittle deparsed-text assertion (test-only)

Scenario 9 asserted the CHECK definition matches `/BETWEEN 1 AND 2/`, but
PostgreSQL deparses the predicate as:

```
CHECK (((("scopeCodes" IS NOT NULL) AND ((cardinality("scopeCodes") >= 1) AND
(cardinality("scopeCodes") <= 2)) AND ("scopeCodes" <@ ARRAY[...])))
```

Same brittleness class already removed from the FK assertions in the DBREADY round.
Fix: assert `cardinality` plus explicit `>= 1` / `<= 2` bounds, or drop the textual
bound assertion and rely on Scenario 15 (which passed and proves behaviour).

### F3 — harness cannot capture a synchronous rejection (test-only, plus coverage gap)

`runCreateAgreementVersion` performs the FIX-03 canonical-terms gate **before**
opening a transaction, so it throws **synchronously**
(`service-engagement-repository.ts:1208`). `expectServiceError(promise, code)` only
handles rejected promises, so the throw escaped the assertion and aborted Scenario
13 at its first negative case (reordered payload).

Stated precisely:

- The gate *did* reject the non-canonical reordered payload — that synchronous
  `invalid_request` **is** the gate rejecting it. Behaviour confirmed, assertion not
  recorded.
- Cases (b) hash mismatch, (c) scope mismatch, (d) mode mismatch, (e) not-JSON and
  the positive canonical-acceptance control in Scenario 13 were **not exercised**.
- Canonical acceptance is still evidenced elsewhere: Scenarios 3, 5 and 6 created
  drafts with the same canonical payload and passed.

Fix (test-only): wrap the call in `() => repo.createAgreementVersion(...)` with a
sync-aware helper, then re-run this scenario.

## What is NOT claimed

- M4-004 is **not** accepted and **not** production-ready.
- No retry was performed; the three failures are preserved as evidence.
- The container and database were **left intact** for diagnosis (no deletion, no
  reset, no further migrations, no corrective writes).
- No production business logic, migration SQL, flag or authority configuration was
  modified in this round.

## Recommended next step (requires separate authorization)

One test-only correction round for F1, F2 and F3, then one authorized Stage 3B
re-run against the same isolated target. No production change is indicated by these
three failures.

---

## Stage 3B R1 — evidence-based test-only corrections (2026-10-29)

Applied after independent review of the three failures above. **No production code,
migration, flag or authority was touched**; every change is in the integration test
or in Stage 3A verification tooling.

### F1 — expectation corrected

Scenario "signature timestamp skew boundary and verified managed activation": the
pending-evidence activation expectation changed from `state_conflict` to
**`authority_denied`**, matching `assertActivationEligible` (the fail-closed branch
for missing independently verified evidence). The sibling expectation in the
"managed activation requires …" scenario stays `state_conflict`, because that path
fails earlier on the missing acceptance — as the executed run proved.

### F2 — deparsed-text dependency removed

Scenario "R1-06: the installed scope CHECKs use the cardinality predicate" no longer
asserts `/BETWEEN 1 AND 2/`. It keeps constraint identity, relation binding,
`cardinality`, the `IS NOT NULL` requirement, the permitted scope values and the
`array_length` prohibition, and asserts that a `cardinality(...)` comparison bound is
present without pinning one textual form.

The 1–2 element semantics moved into the executable FIX-DB probe, which now proves:
`{}` rejected, `{school_admissions}` accepted, `{student_500_visa,school_admissions}`
accepted, three codes rejected, and an unknown code rejected — all with SQLSTATE
`23514` and the probe constraint name.

### F3 — harness captures synchronous throws

`expectServiceError()` now accepts a lazy callback (`() => promise`) **or** a promise
and invokes it inside the assertion boundary, so both a synchronous
`ServiceEngagementError` (the FIX-03 canonical-terms gate and UUID check run before
the transaction) and an asynchronous rejection are captured. All five negative cases
in the canonical-terms scenario are now executed:

| case | input | expected |
| --- | --- | --- |
| a | canonical JSON, different key order | `invalid_request` |
| b | canonical bytes, unrelated hash | `invalid_request` |
| c | canonical terms for a different scope | `invalid_request` |
| d | canonical terms for a different service mode | `invalid_request` |
| e | not JSON | `invalid_request` |

followed by the "no draft was created" assertion, the positive canonical control and
the verbatim stored payload/hash assertion. The other five `expectServiceError` call
sites in the suite pass promises and were already proven asynchronous by the executed
run.

### Stage 3A auxiliary SQL issue

Root cause of `ERROR: invalid escape string` (SQLSTATE **22025**): statement 11 of
`/tmp/verify3a.sql` used `ESCAPE '\\'` (two characters) inside a `LIKE` pattern; that
statement also mixed `AND`/`OR` precedence. Because the script ran without
`ON_ERROR_STOP`, the error did not stop it, and the log still recorded
`stage3a_status=PASS`. The `read_ok=0` row was the row-count sum over five freshly
created (empty) tables — correct but ambiguous as a readability signal.

Replacement: `chatbot/scripts/phase13-m4-004-stage3a-verify.sql` — read-only by
construction (SELECT/catalog only, `default_transaction_read_only = on`, explicit
`READ ONLY` transaction), `ON_ERROR_STOP on` so any SQL error aborts non-zero, one
aggregated verdict over 25 checks (identity, role flags, no `public` CREATE, TEMP,
44-row ledger with pinned hash/timestamp and no extra rows, tables, composite FK,
scope CHECKs, guard triggers, per-table readability, DML grants), and an explicit
`STAGE3A_READ_ONLY_VERIFIED` / `STAGE3A_READ_ONLY_FAILED` verdict. **Not executed in
this round** — it requires the separately authorized database step.

### Offline validation after the corrections

| Check | Result |
| --- | --- |
| `pnpm test:phase13:m4-004:offline` | 61 pass / 0 fail |
| `pnpm test:phase13:m4-004:guard` | 7 pass / 0 fail |
| `pnpm test:phase13:m4-003:offline` / `:guard` | 27 pass / 13 pass |
| `pnpm test:phase13:m4-002:guard` | 13 pass |
| integration module load (no env) | 15 skipped, 0 executed, no DB contacted |
| Biome on changed paths | clean |
| `tsc --noEmit` | 0 M4-004 errors; 44 pre-existing |

### Outstanding

Stage 3B has **not** been re-run. The corrected suite must be executed exactly once
against the same isolated target under separate owner authorization, together with
the read-only Stage 3A verification. M4-004 remains **not accepted**.

---

## Stage 3A R1 — authorized read-only verification (2026-10-29) — **FAILED**

One owner-authorized Stage 3A read-only verification was executed against the exact
approved isolated target. One check failed. No retry, no privilege change and no
Stage 3B run followed, per the authorization.

### Correction applied to the verification SQL (the only source change this round)

`chatbot/scripts/phase13-m4-004-stage3a-verify.sql`: check `dml_grant_on_ledger` used
to *require* `INSERT` on the migration ledger. It now requires least privilege —
`SELECT` granted **and** `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` all absent. All 25
checks, `ON_ERROR_STOP`, `default_transaction_read_only = on`, `BEGIN … READ ONLY`, the
single aggregated verdict and the non-zero-exit failure path are preserved; no DDL or
data modification was introduced.

### Result — actual output

```text
db=immigration_ai_phase13_m4_004_test role=phase13_m4_004_tester server_version_num=170011
STAGE3A_READ_ONLY_CHECKS total= 25 passed= 24 failed= dml_grant_on_ledger
STAGE3A_READ_ONLY_FAILED
psql:scripts/phase13-m4-004-stage3a-verify.sql:155: ERROR:  division by zero
```

- Process exit code: **3** (the intentional sentinel aborted the script under
  `ON_ERROR_STOP`; the failure path works as designed and does **not** report PASS).
- Passing checks (24/25): database identity, server major 17, role login flag, no
  superuser / CREATEDB / CREATEROLE, no `CREATE` on `public`, `TEMP` allowed, 44-row
  ledger, pinned ledger head hash `4cc2861c…3c06dfe`, pinned `created_at`
  `1793233341879`, no ledger rows beyond id 44, five M4-004 tables, composite
  `ServiceEngagement_current_agreement_fk`, two scope CHECKs, five guard triggers,
  readable `ServiceEngagement` / `ServiceAgreementVersion` /
  `ServiceAgreementAcceptance` / `ServiceSignatureEvidence` /
  `ProjectResourceDisclosureGrant` / ledger, `UPDATE` on `ProjectMembership`, `INSERT`
  on `ServiceEngagement`.
- Failing check: `dml_grant_on_ledger`.

### Privilege finding (read-only catalog diagnostic, no writes)

```text
role=phase13_m4_004_tester ledger_owner=phase13_m4_004_migrator member_of=(none)
ledger_priv DELETE=true
ledger_priv INSERT=true
ledger_priv REFERENCES=false
ledger_priv SELECT=true
ledger_priv TRIGGER=false
ledger_priv TRUNCATE=false
ledger_priv UPDATE=true
```

The integration tester holds **INSERT / UPDATE / DELETE** on
`drizzle.__drizzle_migrations` (not `TRUNCATE`, and no role inheritance). This is a
genuine over-grant in the isolated-database provisioning, not a test defect: the
test role can rewrite or erase migration history. The check is behaving correctly.

No `GRANT`/`REVOKE` was performed and the check was not relaxed.

### Post-run integrity (unchanged)

| Item | Value |
| --- | --- |
| Ledger rows / head | 44 / id 44, hash `4cc2861c545ecc0d7dce1c06899b78172aa8466b0969c10b4af785aa23c06dfe`, `created_at 1793233341879` |
| M4-004 table row total | 24 (append-only fixtures preserved; nothing truncated) |
| Container | `phase13-m4-004-pg`, running, image `sha256:82903352d6faf8f8a318bc4353d1cb1db67d4a5ff968d2799b2718e2cb00afa2`, label `m4-004-isolated-test`, `127.0.0.1:55444` |
| Migration 0043 source | `4cc2861c…3c06dfe` (unchanged) |
| Migrations re-applied | none |
| Stage 3B | **NOT RUN** (conditional on Stage 3A passing) |

### Artifacts

- `/home/rico/phase13_m4_004_stage3a_readonly_r1.log` — `4e16176a24a444f8f59fce93a0a085de6f650f92469278607d132d62c6319d09`
- `/home/rico/phase13_m4_004_stage3a_readonly_r1.exit` — `55aa31ab3709bf6d51c00c2fd3802cadc6df6af755bb51b98474ba28384010d4`
- `/home/rico/phase13_m4_004_stage3a_readonly_r1_diagnostic.log` — `45b504f3585260978ddc3118bbc147d3346f18100170e863ed546f4922b282cb`

### Required owner decision

The owner must choose one before any further database validation:

1. re-provision the isolated tester grants so `drizzle.__drizzle_migrations` is
   `SELECT`-only for `phase13_m4_004_tester` (separately authorized database change), or
2. explicitly accept the over-grant as a documented, time-bounded test-environment risk
   and record it in the decision ledger.

Only after that decision can the single authorized Stage 3B re-run proceed.

---

## Stage 2/3A R2 — authorized privilege correction + read-only verification (2026-10-29)

### Ledger ACL correction (applied)

Administrator role: `phase13_m4_004_migrator` (ledger owner). One guarded transaction
with pre-assertions (database, role, ledger ownership, 44 rows, head id/hash/timestamp,
`SELECT` must be preserved, no PUBLIC ledger ACL entry) executed exactly:

```sql
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE drizzle.__drizzle_migrations
  FROM phase13_m4_004_tester;
```

- Before: `{migrator=arwdDxtm/migrator, tester=arwd/migrator}` — tester INSERT/UPDATE/DELETE true, SELECT true, TRUNCATE false.
- After: `{migrator=arwdDxtm/migrator, tester=r/migrator}` — tester **SELECT true only**; INSERT/UPDATE/DELETE/TRUNCATE false; `tester_memberships=0`; no PUBLIC entry.
- Test-table DML preserved (all five M4-004 tables: SELECT/INSERT/UPDATE/DELETE true).
- No other privilege, role attribute, ownership or record was changed; no migration re-applied.
- **Disclosure:** the first attempt (capture `…_ledger_acl_correction.log`) rolled back on a defect in the verifier assertion (`aclexplode` returns one row per privilege, and PostgreSQL 17 adds `MAINTAIN`, so the owner shows 8 rows, not 1). The database was proven unchanged after the rollback (ACL, privileges and 44-row ledger identical) and the same single REVOKE was then applied once via `…_ledger_acl_correction_applied.log` (exit 0). No second ACL modification occurred.

### Stage 3A read-only verification — **VERIFIED**

```text
db=immigration_ai_phase13_m4_004_test role=phase13_m4_004_tester server_version_num=170011
STAGE3A_READ_ONLY_CHECKS total= 25 passed= 25 failed= none
STAGE3A_READ_ONLY_VERIFIED
```

Exit code **0**; 25/25; no SQL errors. Log `…_stage3a_readonly_r2.log`.

### Stage 3B guarded integration re-run — **FAILED (14/15)**

Guard preflight PASSED: `M4_004_INTEGRATION_IMAGE_ID: sha256:82903352…cb00afa2`,
`M4_004_INTEGRATION_MIGRATION_SHA256: 4cc2861c…3c06dfe`, approval token present.

```text
ℹ tests 15   pass 14   fail 1   cancelled 0   skipped 0   todo 0
✖ signature timestamp skew boundary and verified managed activation
  AssertionError: Caught error: ServiceEngagementError: not_found
  at service-engagement-repository.ts:1875 → repository.notFound()
  at integration.test.ts:939 (expectServiceError(..., "forbidden"))
```

Exit code **1**. The corrected F1 assertion (pending-evidence activation →
`authority_denied`) now **passes**; the failure is one step later (**F4**).

**F4 diagnosis (test expectation vs. repository contract):**
`runLoadSignatureVerificationTarget` resolves operator eligibility *first* and calls
`notFound()` when the actor is not an active M4-002 operator for the Project
(`repository.ts:1868-1876`). The scenario's "signatory may not verify their own
evidence" step uses `fixture.ownerUserId` — the customer signatory, who is not an
operator — so the deny-by-default operator gate returns `not_found` before any
self-verification rule is reached. The repository behaviour is the intended
existence-hiding contract (same pattern as the R3 revocation corrections), so this is
a **test-expectation defect**, not a production defect. A true self-verification case
would need an actor who is simultaneously an eligible operator and the signer. **No
code was changed.**

### Post-run integrity

Ledger 44 rows, head id 44 / `4cc2861c…3c06dfe` / `created_at 1793233341879`; tester
SELECT-only; container `phase13-m4-004-pg` unchanged (`sha256:82903352…cb00afa2`,
`127.0.0.1:55444`, label `m4-004-isolated-test`); Migration 0043 source unchanged;
M4-004 table rows 24 → 49 (append-only new synthetic fixtures, nothing truncated);
no migration re-applied; no other database contacted.

### Status

`PRIVILEGE CORRECTED / STAGE3A VERIFIED / STAGE3B FAILED`. M4-004 remains **not
accepted**. A separately authorized test-only round (F4) is required before another
single Stage 3B run.

---

## Stage 3B R3 — F4 test-only correction + single re-run (2026-10-29) — **15/15 PASS**

### F4 correction (the only source change)

`chatbot/lib/db/service-engagement.integration.test.ts`, scenario "signature timestamp
skew boundary and verified managed activation": the customer signatory's
`loadSignatureVerificationTarget()` call now expects **`not_found`** instead of
`forbidden`, with a comment recording that `runLoadSignatureVerificationTarget`
resolves M4-002 operator eligibility first and fails closed with `not_found`
(existence-hiding) before any self-verification defence-in-depth branch. No
production code, migration, schema, runtime authority, feature flag or database guard
was touched; the production repository stayed byte-identical (`a64e1c8f…`) and
Migration 0043 stayed `4cc2861c…3c06dfe`.

All other scenario-6 assertions are preserved: skew boundary, pending-evidence
activation denial (`authority_denied`), forged payload rejection, verification
authority binding, and the final verified-signature + managed-activation assertions.

### Offline validation

| Check | Result |
| --- | --- |
| `pnpm test:phase13:m4-004:offline` | 61 pass / 0 fail / 0 skip (exit 0) |
| `pnpm test:phase13:m4-004:guard` | 7 pass / 0 fail (exit 0) |
| Biome on the edited file | clean, no fixes |
| `git diff --check` | clean |

### Stage 3B guarded run — PASS

Guard preflight PASSED: `M4_004_INTEGRATION_IMAGE_ID: sha256:82903352…cb00afa2`,
`M4_004_INTEGRATION_MIGRATION_SHA256: 4cc2861c…3c06dfe`, approval token present,
runner flag verified.

```text
ℹ tests 15   pass 15   fail 0   cancelled 0   skipped 0   todo 0   duration_ms 1172.558042
STAGE3B_R3_EXIT_CODE=0
```

All 15 scenarios executed, including scenario 6 in full (previously it stopped at F4),
scenario 9 (F2 cardinality CHECK) and scenario 13 (F3 canonical-terms boundary).
Log: `/home/rico/phase13_m4_004_stage3b_r3_authorized_run.log` —
`6fe6bd7da2018113cd45a56b0b483591f0ca3c29f57ee954748adcd5567949e7` (1,785 bytes; no
credentials and no connection URL in the log).

### Post-run integrity

Ledger 44 rows, head id 44 / `4cc2861c…3c06dfe` / `created_at 1793233341879`; tester
SELECT-only on the ledger; container `phase13-m4-004-pg` unchanged
(`sha256:82903352…cb00afa2`, label `m4-004-isolated-test`, tmpfs
`rw,nosuid,nodev,size=1g`, `mounts=0`, `127.0.0.1:55444`); Migration 0043 unchanged;
no migration re-applied; M4-004 rows 49 → 74 and engagements 24 → 36 (append-only new
synthetic fixtures; nothing truncated or reset); feature flags OFF; no other database
or external service contacted.

### Status

`STAGE3B EXECUTED / 15 PASS / 0 FAIL / PENDING INDEPENDENT REVIEW`. M4-004 database
validation is now complete; acceptance remains an independent review decision.
