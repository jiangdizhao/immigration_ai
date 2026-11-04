#!/usr/bin/env bash
# Phase 13 M7 - disposable PostgreSQL acceptance runner (owner-authorized, one run).
#
# Ownership-safe lifecycle:
#   * a unique run identity is generated and applied as a container label;
#   * the created container id is recorded immediately after creation;
#   * cleanup removes a container ONLY when this invocation created it (id or run
#     label match), so a pre-existing container is never deleted on a name/port clash;
#   * cleanup is idempotent and runs on EXIT/INT/TERM.
#
# Authorization gate (both markers required):
#   PHASE13_M7_DB_AUTHORIZED=true
#   PHASE13_M7_ALLOW_DB_CREATION=true

set -Eeuo pipefail

CONTAINER="phase13-m7-pg"
HOST_PORT="55451"
SERVER_PORT="5432"
DB="immigration_ai_phase13_m7_test"
ROLE="m7_test_owner"
LABEL_KEY="org.immigration-ai.phase13-m7.run"
MIN_PASS="19"
CHATBOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d /tmp/phase13-m7-db.XXXXXX)"
REPORT="${PHASE13_M7_DB_RESULT_LOG:-/tmp/phase13_m7_db_run.sanitized.log}"
RUN_ID="$(openssl rand -hex 8)"
CREATED_ID=""
CLEANED=0
REMOVAL="not_applicable"
CLEANUP_VERDICT="not_run"
CLEANUP_DETAIL="not_run"
WORKDIR_PRESENT="yes"
STATUS_NOTE="incomplete"
LEDGER="n/a"
SUITE_LINE="n/a"

log() { echo "[m7-db] $*" >&2; }

container_is_ours() {
  local current_id current_label
  current_id="$(docker inspect -f '{{.Id}}' "$CONTAINER" 2>/dev/null || true)"
  current_label="$(docker inspect -f "{{ index .Config.Labels \"$LABEL_KEY\" }}" "$CONTAINER" 2>/dev/null || true)"
  if [ -n "$CREATED_ID" ] && [ "$current_id" = "$CREATED_ID" ]; then
    return 0
  fi
  [ "$current_label" = "$RUN_ID" ]
}

write_report() {
  local exit_code=$1
  {
    echo "# Phase 13 M7 disposable PostgreSQL acceptance (sanitized)"
    echo "run_id=$RUN_ID"
    echo "exit_code=$exit_code"
    echo "status=$STATUS_NOTE"
    echo "container_created=$([ -n "$CREATED_ID" ] && echo yes || echo no)"
    echo "container_removed=${REMOVAL:-not_applicable}"
    echo "container_present_after=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER" && echo yes || echo no)"
    echo "port_${HOST_PORT}_listening=$( (exec 3<>/dev/tcp/127.0.0.1/$HOST_PORT) 2>/dev/null && echo yes || echo no)"
    echo "migration_ledger=$LEDGER"
    echo "suites=$SUITE_LINE"
    echo "cleanup_verdict=${CLEANUP_VERDICT:-not_run}"
    echo "cleanup_detail=${CLEANUP_DETAIL:-not_run}"
    echo "workdir_present=${WORKDIR_PRESENT:-yes}"
  } > "$REPORT" 2>/dev/null || true
}

cleanup() {
  local status=$?
  if [ "$CLEANED" -eq 0 ]; then
    CLEANED=1
    REMOVAL="not_applicable"
    if [ -n "$CREATED_ID" ]; then
      if container_is_ours; then
        log "cleanup: removing the container created by this run"
        docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
      else
        log "cleanup: the created container is no longer identifiable; not removing"
      fi
      if docker inspect "$CREATED_ID" >/dev/null 2>&1 ||
        docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
        REMOVAL="survives"
      else
        REMOVAL="removed"
      fi
    fi

    CLEANUP_VERDICT="failed"
    CLEANUP_DETAIL="not_run"
    if M7_CONTAINER="$CONTAINER" M7_CREATED_ID="$CREATED_ID" M7_HOST_PORT="$HOST_PORT" \
      bash "$CHATBOT_DIR/scripts/phase13-m7-cleanup-check.sh" "$WORKDIR" \
      >"$WORKDIR/cleanup.log" 2>&1; then
      CLEANUP_VERDICT="ok"
      CLEANUP_DETAIL="$(tr '\n' ' ' < "$WORKDIR/cleanup.log")"
    else
      CLEANUP_DETAIL="$(tr '\n' ' ' < "$WORKDIR/cleanup.log" 2>/dev/null || echo unavailable)"
    fi
    [ "$REMOVAL" = "survives" ] && CLEANUP_VERDICT="failed"

    # Preserve sanitized diagnostics BEFORE the temporary directory is destroyed:
    # test names and error text only, never a connection URL or credential.
    if [ -f "$WORKDIR/integration.log" ]; then
      sed -E 's#postgres://[^ ]*#postgres://<redacted>#g' "$WORKDIR/integration.log" \
        >"${REPORT}.diagnostics" 2>/dev/null || true
    fi

    # Temporary credential/log/inventory files first, then the directory itself.
    rm -f "$WORKDIR"/*.log "$WORKDIR"/*.env "$WORKDIR"/*.txt \
      "$WORKDIR"/*.before "$WORKDIR"/*.during 2>/dev/null || true
    WORKDIR_PRESENT=yes
    if rmdir "$WORKDIR" 2>/dev/null; then WORKDIR_PRESENT=no; fi

    write_report "$status"

    if [ "$CLEANUP_VERDICT" != "ok" ]; then
      log "CLEANUP_FAILED: $CLEANUP_DETAIL"
      if [ "$status" -eq 0 ]; then
        STATUS_NOTE="cleanup_failed_resource_survives"
        write_report "21"
        status=21
      fi
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ---------- authorization gate ----------
if [ "${PHASE13_M7_DB_AUTHORIZED:-}" != "true" ] || [ "${PHASE13_M7_ALLOW_DB_CREATION:-}" != "true" ]; then
  STATUS_NOTE="blocked_pending_owner_authorization"
  log "BLOCKED: M7 database acceptance requires owner authorization"
  exit 78
fi

# ---------- preflight (never destructive) ----------
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  STATUS_NOTE="preflight_conflict_existing_container_preserved"
  log "PREFLIGHT_CONFLICT: container $CONTAINER already exists and will NOT be deleted"
  exit 11
fi
if (exec 3<>/dev/tcp/127.0.0.1/"$HOST_PORT") 2>/dev/null; then
  STATUS_NOTE="preflight_conflict_port_in_use"
  log "PREFLIGHT_CONFLICT: port $HOST_PORT is in use; nothing created, nothing deleted"
  exit 12
fi
if ! docker image inspect postgres:17 >/dev/null 2>&1; then
  STATUS_NOTE="approved_image_missing_no_pull_allowed"
  log "PREFLIGHT: postgres:17 is not present locally; this runner never pulls"
  exit 19
fi
docker ps -a --format '{{.Names}}' | sort > "$WORKDIR/containers.before"
docker volume ls -q | sort > "$WORKDIR/volumes.before"
docker network ls --format '{{.Name}}' | sort > "$WORKDIR/networks.before"
docker images --format '{{.Repository}}:{{.Tag}}' | sort > "$WORKDIR/images.before"
log "preflight ok: name and port free; inventory captured"

# ---------- disposable container, labelled with this run's identity ----------
SUPERPASS="$(openssl rand -hex 24)"
APPPASS="$(openssl rand -hex 24)"
CREATED_ID="$(docker run -d --rm --name "$CONTAINER" \
  --label "$LABEL_KEY=$RUN_ID" \
  --mount type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=1073741824,tmpfs-mode=1777 \
  -e POSTGRES_PASSWORD="$SUPERPASS" -e POSTGRES_DB=postgres \
  -p "127.0.0.1:$HOST_PORT:$SERVER_PORT" postgres:17)"
[ -n "$CREATED_ID" ] || { STATUS_NOTE="container_creation_failed"; exit 13; }
log "created container id=${CREATED_ID:0:12}... run_id=$RUN_ID"

ready=0
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" -eq 1 ] || { STATUS_NOTE="database_not_ready"; exit 13; }

docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q \
  -c "CREATE ROLE $ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$APPPASS';"
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q \
  -c "CREATE DATABASE $DB OWNER $ROLE;"

# ---------- identity guard BEFORE any migration ----------
ID_ROW="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc \
  "select current_database() || '|' || current_user" | tr -d '[:space:]')"
[ "$ID_ROW" = "$DB|postgres" ] || { STATUS_NOTE="identity_mismatch"; exit 14; }
SUPER="$(docker exec "$CONTAINER" psql -U postgres -tAc \
  "select rolsuper from pg_roles where rolname='$ROLE';" | tr -d '[:space:]')"
[ "$SUPER" = "f" ] || { STATUS_NOTE="test_role_is_superuser"; exit 14; }

URL="postgres://$ROLE:$APPPASS@127.0.0.1:$HOST_PORT/$DB"

# ---------- controlled migrations 0000-0050 ----------
cd "$CHATBOT_DIR"
POSTGRES_URL="$URL" pnpm exec tsx scripts/db-migration-operator.ts \
  --acknowledge-migrations --expect-database="$DB" >"$WORKDIR/migrate.log" 2>&1 \
  || { STATUS_NOTE="migration_failed"; exit 15; }
LEDGER="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc \
  "select count(*) from drizzle.__drizzle_migrations;" | tr -d '[:space:]')"
[ "$LEDGER" = "51" ] || { STATUS_NOTE="unexpected_migration_ledger"; exit 15; }
log "migration ledger: $LEDGER (0000-0050)"

# ---------- M7 dedicated real-PostgreSQL suite ----------
log "running the M7 guarded integration suite"
set +e
PHASE13_M7_DB_INTEGRATION=true \
PHASE13_M7_TEST_ENVIRONMENT_ID=phase13-m7-disposable \
PHASE13_M7_TEST_DATABASE_ROLE="$ROLE" \
PHASE13_M7_TEST_HOST_PORT="$HOST_PORT" \
PHASE13_M7_TEST_SERVER_PORT="$SERVER_PORT" \
PHASE13_M7_TEST_DATABASE_URL="$URL" \
POSTGRES_URL="$URL" \
DATABASE_URL="$URL" \
  pnpm test:phase13:m7:db:integration >"$WORKDIR/integration.log" 2>&1
SUITE_STATUS=$?
set -e

# ---------- false-PASS guard: exit 0 with skips or too few passes is NOT a pass ----------
PASSES="$(grep -E '^ℹ pass [0-9]+' "$WORKDIR/integration.log" | awk '{print $3}' | tail -1)"
SKIPS="$(grep -E '^ℹ skipped [0-9]+' "$WORKDIR/integration.log" | awk '{print $3}' | tail -1)"
FAILS="$(grep -E '^ℹ fail [0-9]+' "$WORKDIR/integration.log" | awk '{print $3}' | tail -1)"
PASSES="${PASSES:-0}"; SKIPS="${SKIPS:-unknown}"; FAILS="${FAILS:-unknown}"
SUITE_LINE="exit=$SUITE_STATUS pass=$PASSES skip=$SKIPS fail=$FAILS"
log "integration: $SUITE_LINE"
if [ "$SUITE_STATUS" -ne 0 ]; then STATUS_NOTE="integration_failed"; exit 16; fi
if [ "$SKIPS" != "0" ]; then STATUS_NOTE="false_pass_guard_skipped_tests"; exit 17; fi
if [ "$PASSES" -lt "$MIN_PASS" ]; then STATUS_NOTE="false_pass_guard_too_few_passes"; exit 17; fi
if [ "$FAILS" != "0" ]; then STATUS_NOTE="integration_failed"; exit 16; fi

STATUS_NOTE="passed"
exit 0
