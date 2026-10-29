# Phase 13 M4-004 PostgreSQL test harness

**Status: proposed; owner approval is pending.** The M4-002 and M4-003 approvals do not authorize this target. No database, container, role or approval token is asserted to exist, and **no part of this procedure was executed in the M4-004 implementation round**.

## Proposed isolated target

| Property | Exact proposed value |
| --- | --- |
| Host binding | `127.0.0.1` |
| Published port | `127.0.0.1:55444` to container `5432/tcp` |
| Database | `immigration_ai_phase13_m4_004_test` |
| Role | `phase13_m4_004_tester` |
| Container | `phase13-m4-004-pg` |
| Image tag | `postgres:17` |
| Docker label | `immigration-ai.phase13=m4-004-isolated-test` |
| Data directory | `/var/lib/postgresql/data` on tmpfs `rw,nosuid,nodev,size=1g` |
| Approval environment variable | `PHASE13_M4_004_TEST_APPROVAL=RUN_M4_004_POSTGRES_INTEGRATION` |
| Exact connection URL environment variable | `PHASE13_M4_004_TEST_DATABASE_URL` |
| Journal head | index `43`, tag `0043_phase13_m4_004_service_engagement`, 44 ledger rows |
| Pinned Migration 0043 bytes | `4cc2861c545ecc0d7dce1c06899b78172aa8466b0969c10b4af785aa23c06dfe` |

These are fail-closed constants (`scripts/phase13-m4-004-db-test-guard.ts`). An owner must separately approve this exact identity and provide the approval token and URL in the execution environment. Do not source `.env.local`, `POSTGRES_URL`, `DATABASE_URL` or any business/production URL. If the migration file or its journal entry changes, the pinned hash/time must be re-approved and re-pinned; the guard test fails loudly otherwise.

## Proposed procedure (owner-authorized, not executed)

1. Obtain separate owner approval for this target, the disposable database provisioning and exactly one integration run. Create or verify only the named isolated container, label, pinned image, loopback port and tmpfs data directory. Do not reuse the M4-002/M4-003 containers or approvals.
2. Provision only the named database and the dedicated non-superuser role without `CREATEDB`, `CREATEROLE` or `CREATE` on schema `public`. Keep credentials in the approved local secret mechanism; do not put them in shell history, logs, source or handoff documents.
3. After separate migration authorization, use the repository's controlled migration procedure to apply the journal through `0043_phase13_m4_004_service_engagement`. The launcher does **not** apply migrations and does **not** create or reset databases.
4. Run the launcher with the exact approved values:

   ```bash
   cd chatbot
   PHASE13_M4_004_TEST_APPROVAL=RUN_M4_004_POSTGRES_INTEGRATION \
   PHASE13_M4_004_TEST_DATABASE_URL='postgres://phase13_m4_004_tester:<secret>@127.0.0.1:55444/immigration_ai_phase13_m4_004_test' \
   pnpm test:phase13:m4-004:integration
   ```

5. Fail-closed preflight before the child starts (R2-04):
   1. the approval token is exactly `RUN_M4_004_POSTGRES_INTEGRATION`;
   2. the URL is exactly the approved loopback host/port/database/role, with no query, fragment or empty password;
   3. Docker: exact container name, `postgres:17` tag, `immigration-ai.phase13=m4-004-isolated-test` label, single `127.0.0.1:55444 → 5432/tcp` binding, tmpfs data directory with the exact options, no bind/volume mount over the data directory, running, and `container.Image` equal to the inspected image id. The observed image id is printed (not a secret) and should be approve-pinned for later runs;
   4. PostgreSQL: exact `current_database()`/`current_user`, `server_version_num` in `[170000, 180000)`, login allowed, non-superuser, no `CREATEDB`/`CREATEROLE`/`CREATE` on `public`;
   5. Drizzle ledger: 44 rows, latest id 44, latest hash and `created_at` equal to the pinned Migration 0043 bytes/time;
   6. child environment: `POSTGRES_URL` **is set** to the approved URL (the runtime requires it — R2-04 repair), `PHASE13_M4_004_TEST_DATABASE_URL` matches, the runner marker is set, and `DATABASE_URL`, `PGURL`, `POSTGRES_URL_UNPOOLED`, `PHASE13_M4_002_TEST_DATABASE_URL`, `PHASE13_M4_003_TEST_DATABASE_URL` are empty. Any surviving value aborts before spawn.
6. The guarded suite re-checks `current_database()`, `current_user`, PostgreSQL 17, the ledger count and the pinned migration hash, then runs its scenarios. Fixtures are synthetic and append-only (no teardown, `TRUNCATE`, database recreation or migration application).

## Offline coverage in this round

- `pnpm test:phase13:m4-004:offline` — pure policy, scope-specific operator authority, signature/authority ports, disclosure evaluator (incl. resource-owner eligibility and observation fingerprint), HTTP contract, static schema/migration contracts and the R1/R2 correction suites. **Unit-tested.**
- `pnpm test:phase13:m4-004:guard` — approval token, exact URL parsing, Docker container/image identity, database identity/privileges, ledger + pinned Migration 0043 bytes, and child-environment construction/verification. **Unit-tested; no Docker or SQL.**
- `lib/db/service-engagement.integration.test.ts` — 15 guarded scenarios. **SKIPPED (not executed, not passed).**
- Any real-signature, legal-enforceability, professional-authority or protected-resource-content claim remains **NOT VERIFIED**.

## Scenarios the guarded suite now implements (R1 + R2 + R3)

1. Pinned preflight: database/role, PostgreSQL 17, ledger head and Migration 0043 hash.
2. Staff Engagement detail denied; owner detail and owner list keep full metadata (R2-03).
3. Draft authority bound to the exact pre-generated version id; a different id with identical terms is refused (R2-02).
4. Agreement scope mismatch and stale revision refused (canonical terms fixtures).
5. Managed activation requires issue + acceptance + verified evidence; forged payload refused; self-verification refused (R1-04).
6. Signature declared-time boundary (inside 5 minutes accepted, beyond rejected) and pending evidence cannot activate (R1-06c).
7. Recipient Grant list/detail parity across revocation, with no `items`/`hasMore` leak, and the owner audit view retained (R2-01/R1-02).
8. Resource-owner membership revocation: recipient detail is `not_found`, the recipient list is empty and the former owner gets `403` (not `404`) on revoke (R1-03/R2-01/FIX-02).
9. Scope CHECK catalog identity: both installed constraints use the `cardinality` predicate, reject `array_length`, and belong to the expected relations (metadata only).
10. Composite current-agreement FK metadata: `contype='f'`, source/target OIDs, ordered column mapping, `NOT DEFERRABLE`, `ON DELETE RESTRICT ON UPDATE NO ACTION` (metadata only).
11. Idempotent replay returns the original outcome, a changed request with the *same* action conflicts, and concurrent transitions serialize with exactly one winner and a `revision_conflict` loser.
12. Database guard triggers reject direct scope mutation and deletion, and the row is unchanged afterwards.
13. Non-canonical terms payload, mismatched hash, mismatched scope and mismatched mode are all refused; the canonical payload is stored verbatim (FIX-03).
14. Interleaved eligible/ineligible grants page exactly: `limit: 1` returns an authorized row with `hasMore: true`, `limit: 2` returns exactly the two authorized rows (FIX-04).
15. Constraint **behaviour**: the deployed scope CHECK expression (bound to the exact relation OID) rejects `'{}'` with `23514`, and an explicitly constructed equivalent composite FK — verified via `confrelid` to reference the temporary relation — accepts the same-engagement reference and rejects the cross-engagement reference with `23503`, without touching any permanent row.

Fixture workflow (FIX-01): every scenario builds its state through the accepted
M4-002 Option A sequence — a separate synthetic **administrator** proposes, the
Project owner approves, the named lawyer accepts — and asserts that an owner-actor
proposal is refused. Project memberships are created through
`inviteProjectMember` → `acceptProjectMembership` and revoked through
`revokeProjectMembership`, so all synthetic state is produced by supported
contracts and every expected Project revision is derived from the mutations above
it.

Temporary objects (scenario 15) are session-local: the scenario reserves one
connection with `sql.reserve()`, runs every `CREATE/ALTER/INSERT` and violation
assertion on that connection, releases it in `finally`, and never attaches
constraints to or writes into a permanent table.

## Remaining limitation (R1-05 boundary)

The revalidator used in the guarded suite is an in-process test double. A real
resource adapter must still prove a locked or serializable snapshot re-read inside
the same transaction (storage-level version/ETag concurrency) and be separately
authorized per category. TOCTOU is reduced, not eliminated; production keeps the
deny-by-default resolver and no revalidator, and no Fact/Document/Chat content
endpoint is connected.
