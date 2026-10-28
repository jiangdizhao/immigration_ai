# Phase 13 M4-003 PostgreSQL test harness

**Status: proposed; owner approval is pending.** The M4-002 test authorization does not authorize this target. No database, container, role, or approval token is asserted to exist.

## Proposed isolated target

| Property | Exact proposed value |
| --- | --- |
| Host binding | `127.0.0.1` |
| Published port | `127.0.0.1:55433` to container `5432/tcp` |
| Database | `immigration_ai_phase13_m4_003_test` |
| Role | `phase13_m4_003_tester` |
| Container | `phase13-m4-003-pg` |
| Image tag | `postgres:17` |
| Pinned local Docker Image ID | `sha256:82903352d6faf8f8a318bc4353d1cb1db67d4a5ff968d2799b2718e2cb00afa2` |
| Docker label | `immigration-ai.phase13=m4-003-isolated-test` |
| Data directory | `/var/lib/postgresql/data` on tmpfs `rw,nosuid,nodev,size=1g` |
| Approval environment variable | `PHASE13_M4_003_TEST_APPROVAL=RUN_M4_003_POSTGRES_INTEGRATION` |
| Exact connection URL environment variable | `PHASE13_M4_003_TEST_DATABASE_URL` |

These are fail-closed proposed constants. An owner must separately approve this exact identity and provide the approval token and URL in the execution environment before any real-database run. Do not source `.env.local`, `DATABASE_URL`, or a business/production URL.

## Proposed migration and run procedure

1. Obtain separate owner approval for the target above, the disposable database provisioning, and one integration run. Create or verify only the named isolated container, label, pinned image, loopback port, and tmpfs data directory. Do not reuse the M4-002 container or approval.
2. Provision only the named database and dedicated role inside that isolated PostgreSQL 17 instance. Keep credentials in the approved local secret mechanism; do not put them in shell history, logs, source, or this handoff.
3. After separate migration authorization, use the repository's controlled migration procedure to apply the journal through `0042_phase13_m4_003_human_messaging`. The test launcher does not apply migrations or create/reset databases.
4. Before the test child starts, the launcher verifies the full journal shape ends at entry index `42`, tag `0042_phase13_m4_003_human_messaging`, timestamp `1793145662822`; it hashes the checked-in Migration 0042 bytes as `c5a56b63cfd60e28fde4b58cfd72f79212da1c392d7ef15cfb580fcf77f768a7`; then it checks `current_database()`, `current_user`, PostgreSQL major version 17, that the role can log in but is not a superuser and cannot create roles/databases, and that the Drizzle ledger has 43 rows, latest id `43`, matching hash, and matching timestamp. Any mismatch stops before integration tests.
5. The launcher independently inspects Docker and requires the exact container name, running container Image ID, inspected image `Id`, image tag, label, loopback-only port mapping, and exact tmpfs declaration. The local Image ID is pinned independently from registry manifest digests: `RepoDigests` may be `null`, empty, or contain structurally valid registry digests that differ from the local Image ID. No registry manifest digest is pinned unless separately verified and approved. The launcher rejects missing/malformed metadata and any bind, volume, or other mount that overlaps the PostgreSQL data directory. Docker's `--tmpfs` representation may have no corresponding `.Mounts` entry; acceptance requires the exact `HostConfig.Tmpfs` evidence and consistent inspection fields.
6. Only after owner approval and successful preflight may the dedicated integration script run. It creates synthetic append-only fixtures and performs no teardown, `TRUNCATE`, database recreation, or migration application. Keep the disposable instance isolated for the run and handle its later lifecycle only under separate owner authorization.

The offline guard tests exercise only pure parsing and validation functions. They do not invoke Docker, connect to PostgreSQL, or execute SQL. The integration suite is intentionally not run as part of the offline harness task.
