#!/usr/bin/env bash
# Phase 13 M8.1 - disposable PostgreSQL acceptance runner (AUTHORED, NOT AUTO-RUN).
#
# Ownership-safe lifecycle: the created container id is recorded immediately, cleanup
# removes ONLY a container this invocation created (id or unique run label match), and
# cleanup is idempotent on EXIT/INT/TERM. Nothing here touches an existing database.
#
# Authorization gate (both markers required, neither is set in this repository):
#   PHASE13_M8_1_DB_AUTHORIZED=true
#   PHASE13_M8_1_ALLOW_DB_CREATION=true

set -Eeuo pipefail

CONTAINER="phase13-m8-1-pg"
HOST_PORT="55453"
SERVER_PORT="5432"
DB="immigration_ai_phase13_m8_1_test"
ROLE="m8_1_test_owner"
LABEL_KEY="org.immigration-ai.phase13-m8-1.run"
MIN_PASS="8"
CHATBOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d /tmp/phase13-m8-1-db.XXXXXX)"
REPORT="${PHASE13_M8_1_DB_RESULT_LOG:-/tmp/phase13_m8_1_db_run.sanitized.log}"
RUN_ID="$(openssl rand -hex 8)"
CREATED_ID=""
CLEANED=0
STATUS_NOTE="incomplete"
LEDGER="n/a"
SUITE_LINE="n/a"
# Diagnostics budget: bounded output keeps a failing run readable in a terminal.
MAX_DIAG_LINES="${PHASE13_M8_1_MAX_DIAG_LINES:-40}"
SUPERPASS=""
APPPASS=""
URL=""

log() { echo "[m8.1-db] $*" >&2; }

# Redact anything credential-shaped before it can reach the terminal. Connection
# URLs, generated passwords and password fragments are replaced, and every line is
# length-bounded so a stack dump can never flood the console.
redact() {
  local args=(
    -e 's#postgres(ql)?://[^[:space:]"'"'"']*#postgres://<redacted>#g'
    -e 's#[Pp]assword=[^[:space:]]*#password=<redacted>#g'
    -e 's#[Pp]assword:[^[:space:]]*#password:<redacted>#g'
  )
  if [ -n "${URL:-}" ]; then args+=(-e "s#${URL}#<redacted-url>#g"); fi
  if [ -n "${APPPASS:-}" ]; then args+=(-e "s#${APPPASS}#<redacted>#g"); fi
  if [ -n "${SUPERPASS:-}" ]; then args+=(-e "s#${SUPERPASS}#<redacted>#g"); fi
  sed -E "${args[@]}" | cut -c1-200
}

# Bounded, sanitized failure summary. Prints failing test names and error codes only;
# never the URL, credentials, host coordinates or unrelated log content. Always runs
# before cleanup so the work directory still exists.
print_failure_diagnostics() {
  local logfile="${WORKDIR:-}/integration.log"
  if [ ! -f "$logfile" ]; then
    log "diagnostics: no integration log available"
    return 0
  fi
  local names errors
  names="$(grep -E '^(✖|not ok )' "$logfile" 2>/dev/null \
    | grep -vE '^✖ failing tests:' \
    | sed -E 's/^✖ ([0-9]+\) )?//' \
    | awk '!seen[$0]++' | head -n 10 || true)"
  errors="$(grep -E '^[[:space:]]*(AssertionError|AssertionError \[|Error:|PostgresError|SubmissionPackageError|code:|actual:|expected:|[+-] actual|[+-] expected)' "$logfile" 2>/dev/null \
    | awk '!seen[$0]++' | head -n "$((MAX_DIAG_LINES - 10))" || true)"

  log "FAILED: failing tests and error details follow (bounded, sanitized)"
  if [ -z "$names" ]; then
    log "  (no failing test names parsed from the suite output)"
  else
    printf '%s\n' "$names" | while IFS= read -r line; do
      printf '[m8.1-db]   FAIL test: %s\n' "$line" | redact >&2
    done
  fi
  if [ -n "$errors" ]; then
    printf '%s\n' "$errors" | while IFS= read -r line; do
      printf '[m8.1-db]   %s\n' "$line" | redact >&2
    done
  fi
  log "FAILED: end of diagnostics (cap ${MAX_DIAG_LINES} lines; full suite log stays in the disposable work dir)"
}

write_report() {
  {
    echo "# Phase 13 M8.1 disposable PostgreSQL acceptance (sanitized)"
    echo "run_id=$RUN_ID"
    echo "status=$STATUS_NOTE"
    echo "migration_ledger=$LEDGER"
    echo "suites=$SUITE_LINE"
    echo "container_present_after=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER" && echo yes || echo no)"
    echo "port_${HOST_PORT}_listening=$( (exec 3<>/dev/tcp/127.0.0.1/$HOST_PORT) 2>/dev/null && echo yes || echo no)"
  } > "$REPORT" 2>/dev/null || true
}

cleanup() {
  local status=$?
  if [ "$CLEANED" -eq 0 ]; then
    CLEANED=1
    if [ -n "$CREATED_ID" ]; then
      local current_id current_label
      current_id="$(docker inspect -f '{{.Id}}' "$CONTAINER" 2>/dev/null || true)"
      current_label="$(docker inspect -f "{{ index .Config.Labels \"$LABEL_KEY\" }}" "$CONTAINER" 2>/dev/null || true)"
      if [ "$current_id" = "$CREATED_ID" ] || [ "$current_label" = "$RUN_ID" ]; then
        docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
      else
        log "cleanup: container is not identifiable as this run's; not removing"
      fi
    fi
    rm -rf "$WORKDIR" 2>/dev/null || true
    write_report
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "${PHASE13_M8_1_DB_AUTHORIZED:-}" != "true" ] || [ "${PHASE13_M8_1_ALLOW_DB_CREATION:-}" != "true" ]; then
  STATUS_NOTE="blocked_pending_owner_authorization"
  log "BLOCKED: M8.1 database acceptance requires explicit owner authorization"
  exit 78
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  STATUS_NOTE="preflight_conflict_existing_container_preserved"
  exit 11
fi
if (exec 3<>/dev/tcp/127.0.0.1/"$HOST_PORT") 2>/dev/null; then
  STATUS_NOTE="preflight_conflict_port_in_use"
  exit 12
fi
docker image inspect postgres:17 >/dev/null 2>&1 || {
  STATUS_NOTE="approved_image_missing_no_pull_allowed"
  exit 19
}

SUPERPASS="$(openssl rand -hex 24)"
APPPASS="$(openssl rand -hex 24)"
CREATED_ID="$(docker run -d --rm --name "$CONTAINER" --label "$LABEL_KEY=$RUN_ID" \
  --mount type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=1073741824,tmpfs-mode=1777 \
  -e POSTGRES_PASSWORD="$SUPERPASS" -e POSTGRES_DB=postgres \
  -p "127.0.0.1:$HOST_PORT:$SERVER_PORT" postgres:17)"
[ -n "$CREATED_ID" ] || { STATUS_NOTE="container_creation_failed"; exit 13; }

for _ in $(seq 1 90); do
  docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q \
  -c "CREATE ROLE $ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$APPPASS';"
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q \
  -c "CREATE DATABASE $DB OWNER $ROLE;"
ID_ROW="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc \
  "select current_database() || '|' || current_user" | tr -d '[:space:]')"
[ "$ID_ROW" = "$DB|postgres" ] || { STATUS_NOTE="identity_mismatch"; exit 14; }

URL="postgres://$ROLE:$APPPASS@127.0.0.1:$HOST_PORT/$DB"
cd "$CHATBOT_DIR"
POSTGRES_URL="$URL" pnpm exec tsx scripts/db-migration-operator.ts \
  --acknowledge-migrations --expect-database="$DB" >"$WORKDIR/migrate.log" 2>&1 ||
  { STATUS_NOTE="migration_failed"; exit 15; }
LEDGER="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc \
  "select count(*) from drizzle.__drizzle_migrations;" | tr -d '[:space:]')"
[ "$LEDGER" = "52" ] || { STATUS_NOTE="unexpected_migration_ledger"; exit 15; }

set +e
PHASE13_M8_1_DB_INTEGRATION=true PHASE13_M8_1_TEST_ENVIRONMENT_ID=phase13-m8-1-disposable \
PHASE13_M8_1_TEST_DATABASE_ROLE="$ROLE" PHASE13_M8_1_TEST_HOST_PORT="$HOST_PORT" \
PHASE13_M8_1_TEST_SERVER_PORT="$SERVER_PORT" PHASE13_M8_1_TEST_DATABASE_URL="$URL" \
POSTGRES_URL="$URL" DATABASE_URL="$URL" \
  node --conditions=react-server --import tsx --test \
  lib/submission-packages/phase13-m8-1.postgres.integration.test.ts \
  >"$WORKDIR/integration.log" 2>&1
SUITE_STATUS=$?
set -e
PASSES="$(grep -E '^ℹ pass [0-9]+' "$WORKDIR/integration.log" | awk '{print $3}' | tail -1)"
SKIPS="$(grep -E '^ℹ skipped [0-9]+' "$WORKDIR/integration.log" | awk '{print $3}' | tail -1)"
FAILS="$(grep -E '^ℹ fail [0-9]+' "$WORKDIR/integration.log" | awk '{print $3}' | tail -1)"
PASSES="${PASSES:-0}"; SKIPS="${SKIPS:-unknown}"; FAILS="${FAILS:-unknown}"
SUITE_LINE="exit=$SUITE_STATUS pass=$PASSES skip=$SKIPS fail=$FAILS"
if [ "$SUITE_STATUS" -ne 0 ] || [ "$SKIPS" != "0" ] || [ "$PASSES" -lt "$MIN_PASS" ]; then
  STATUS_NOTE="integration_failed_or_skipped"
  # Diagnostics run BEFORE cleanup so the disposable work dir still exists, and they
  # are bounded, redacted and limited to failing test names / error lines.
  print_failure_diagnostics || true
  exit 16
fi
STATUS_NOTE="passed"
exit 0
