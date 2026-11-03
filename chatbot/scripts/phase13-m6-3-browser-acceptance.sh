#!/usr/bin/env bash
# Phase 13 M6.3 - combined database + browser lifecycle (GUARDED, NOT AUTO-RUN).
#
# Sequence (preparation only until the owner authorizes a real run):
#   preflight -> disposable PostgreSQL -> migrate -> seed synthetic account/Project
#   -> real-PostgreSQL acceptance -> loopback Next.js -> Chromium -> stop server
#   -> remove database container and temporary files -> verify cleanup.
#
# The database stays alive for the whole browser run; the server and browser stop
# BEFORE the database is destroyed. Cleanup traps are installed before creation.
#
# Authorization markers: PHASE13_M6_3_DB_AUTHORIZED, PHASE13_M6_3_ALLOW_DB_CREATION,
# PHASE13_M6_3_BROWSER_AUTHORIZED, PHASE13_M6_3_SEED_AUTHORIZED (all 'true').

set -Eeuo pipefail

CONTAINER="phase13-m6-3-pg"
HOST_PORT="55452"
APP_PORT="${PHASE13_M6_3_APP_PORT:-3100}"
DB="immigration_ai_phase13_m6_3_test"
ROLE="m6_3_test_owner"
LABEL_KEY="org.immigration-ai.phase13-m6-3.run"
CHATBOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d /tmp/phase13-m6-3-browser.XXXXXX)"
REPORT="${PHASE13_M6_3_BROWSER_RESULT_LOG:-/tmp/phase13_m6_3_browser_run.sanitized.log}"
RUN_ID="$(openssl rand -hex 8)"
CREATED_ID=""
SERVER_PID=""
SERVER_PGID=""
CLEANED=0
SERVER_STOPPED="not_started"
SERVER_PORT_FREE="not_started"
BROWSER="not_run"
PG_SUITE="not_run"
VERDICT="incomplete"

log() { echo "[m6.3-browser] $*" >&2; }

write_report() {
  {
    echo "# Phase 13 M6.3 combined browser acceptance (sanitized)"
    echo "run_id=$RUN_ID"
    echo "verdict=$VERDICT"
    echo "postgres_suite=$PG_SUITE"
    echo "browser=$BROWSER"
    echo "server_stopped=$SERVER_STOPPED"
    echo "server_port_released=$SERVER_PORT_FREE"
    echo "container_created=$([ -n "$CREATED_ID" ] && echo yes || echo no)"
    echo "cleanup_verdict=${CLEANUP_VERDICT:-not_run}"
    echo "workdir_present=${WORKDIR_PRESENT:-unknown}"
  } > "$REPORT" 2>/dev/null || true
}

cleanup() {
  local status=$?
  if [ "$CLEANED" -eq 0 ]; then
    CLEANED=1
    # 1. Server and browser must stop before the database is destroyed.
    if [ -n "$SERVER_PGID" ]; then
      # Signal only the process group this run created (setsid session leader),
      # so an orphaned `next dev` child cannot survive the parent.
      kill -TERM -- "-$SERVER_PGID" 2>/dev/null ||
        kill -TERM "$SERVER_PGID" 2>/dev/null || true
      for _ in $(seq 1 40); do
        kill -0 "$SERVER_PGID" 2>/dev/null || break
        sleep 0.5
      done
      if kill -0 "$SERVER_PGID" 2>/dev/null; then
        kill -KILL -- "-$SERVER_PGID" 2>/dev/null ||
          kill -KILL "$SERVER_PGID" 2>/dev/null || true
        sleep 1
      fi
      if kill -0 "$SERVER_PGID" 2>/dev/null; then
        SERVER_STOPPED="survives"
      else
        SERVER_STOPPED="yes"
      fi
      if (exec 3<>/dev/tcp/127.0.0.1/"$APP_PORT") 2>/dev/null; then
        SERVER_PORT_FREE="no"
      else
        SERVER_PORT_FREE="yes"
      fi
      if [ "$SERVER_STOPPED" != "yes" ] || [ "$SERVER_PORT_FREE" != "yes" ]; then
        CLEANUP_VERDICT="failed"
        [ "$status" -eq 0 ] && status=21
      fi
    fi
    # 2. Remove only the container this run created.
    if [ -n "$CREATED_ID" ] && docker inspect "$CREATED_ID" >/dev/null 2>&1; then
      docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    fi
    # 3. Independent verification (same checker as the database runner).
    if M63_CONTAINER="$CONTAINER" M63_CREATED_ID="$CREATED_ID" M63_HOST_PORT="$HOST_PORT" \
        bash "$CHATBOT_DIR/scripts/phase13-m6-3-cleanup-check.sh" "$WORKDIR" \
        >"$WORKDIR/cleanup.log" 2>&1; then
      CLEANUP_VERDICT="ok"
    else
      CLEANUP_VERDICT="failed"
      [ "$status" -eq 0 ] && status=21
    fi
    # 4. Every file inside this run's own temporary directory (the directory is a
    #    private `mktemp -d` owned by this script), then the directory itself.
    rm -f "$WORKDIR"/*.log "$WORKDIR"/*.before "$WORKDIR"/*.env "$WORKDIR"/*.txt           "$WORKDIR"/browser.json 2>/dev/null || true
    find "$WORKDIR" -mindepth 1 -delete 2>/dev/null || true
    WORKDIR_PRESENT="yes"
    if rmdir "$WORKDIR" 2>/dev/null; then WORKDIR_PRESENT="no"; fi
    if [ "$WORKDIR_PRESENT" != "no" ]; then
      CLEANUP_VERDICT="failed"
      [ "$status" -eq 0 ] && status=21
    fi
    [ "$CLEANUP_VERDICT" = "ok" ] && [ "$status" -eq 0 ] && VERDICT="passed"
    write_report
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for marker in PHASE13_M6_3_DB_AUTHORIZED PHASE13_M6_3_ALLOW_DB_CREATION PHASE13_M6_3_BROWSER_AUTHORIZED PHASE13_M6_3_SEED_AUTHORIZED; do
  if [ "${!marker:-}" != "true" ]; then
    VERDICT="blocked_pending_owner_authorization"
    log "BLOCKED: ${marker} must be 'true' (owner-authorized run only)"
    exit 78
  fi
done
: "${PHASE13_M6_3_SYNTHETIC_EMAIL:?synthetic email required}"
: "${PHASE13_M6_3_SYNTHETIC_PASSWORD:?synthetic password required}"

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  VERDICT="preflight_conflict_existing_container_preserved"
  log "PREFLIGHT_CONFLICT: $CONTAINER exists; nothing created, nothing deleted"
  exit 11
fi
if (exec 3<>/dev/tcp/127.0.0.1/$HOST_PORT) 2>/dev/null; then
  VERDICT="preflight_conflict_port_in_use"
  log "PREFLIGHT_CONFLICT: port $HOST_PORT in use"
  exit 12
fi
if (exec 3<>/dev/tcp/127.0.0.1/$APP_PORT) 2>/dev/null; then
  VERDICT="preflight_conflict_app_port_in_use"
  log "PREFLIGHT_CONFLICT: app port $APP_PORT in use; refusing to reuse a foreign server"
  exit 12
fi
if ! docker image inspect postgres:17 >/dev/null 2>&1; then
  VERDICT="approved_image_missing_no_pull_allowed"
  log "PREFLIGHT: postgres:17 must already be present locally"
  exit 19
fi
docker ps -a --format '{{.Names}}' | sort > "$WORKDIR/containers.before"
docker volume ls -q | sort > "$WORKDIR/volumes.before"
docker network ls --format '{{.Name}}' | sort > "$WORKDIR/networks.before"
docker images --format '{{.Repository}}:{{.Tag}}' | sort > "$WORKDIR/images.before"

log "preflight ok; creating the disposable container"
SUPERPASS="$(openssl rand -hex 24)"
APPPASS="$(openssl rand -hex 24)"
CREATED_ID="$(docker run -d --rm --name "$CONTAINER" --label "$LABEL_KEY=$RUN_ID" \
  --mount type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=1073741824,tmpfs-mode=1777 \
  -e POSTGRES_PASSWORD="$SUPERPASS" -e POSTGRES_DB=postgres \
  -p "127.0.0.1:$HOST_PORT:5432" postgres:17)"
for _ in $(seq 1 90); do
  docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q \
  -c "CREATE ROLE $ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$APPPASS';"
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $DB OWNER $ROLE;"
URL="postgres://$ROLE:$APPPASS@127.0.0.1:$HOST_PORT/$DB"

cd "$CHATBOT_DIR"
log "container ready; applying migrations 0000-0049 to the disposable database"
POSTGRES_URL="$URL" pnpm exec tsx scripts/db-migration-operator.ts \
  --acknowledge-migrations --expect-database="$DB" >"$WORKDIR/migrate.log" 2>&1 || { VERDICT="migration_failed"; exit 15; }

log "migrations applied; seeding the synthetic account and Project"
SEED_OUT="$(PHASE13_M6_3_SEED_AUTHORIZED=true PHASE13_M6_3_TEST_DATABASE_URL="$URL" \
  PHASE13_M6_3_SEED_EMAIL="$PHASE13_M6_3_SYNTHETIC_EMAIL" \
  PHASE13_M6_3_SEED_PASSWORD="$PHASE13_M6_3_SYNTHETIC_PASSWORD" \
  pnpm exec tsx scripts/phase13-m6-3-seed-synthetic.ts 2>&1)" || {
  VERDICT="synthetic_seed_failed"
  printf '%s\n' "$SEED_OUT" | tail -12 >&2
  exit 16
}
PROJECT_ID="$(printf '%s\n' "$SEED_OUT" | sed -n 's/^PHASE13_M6_3_PROJECT_ID=//p' | tail -1)"
[ -n "$PROJECT_ID" ] || { VERDICT="synthetic_seed_failed"; exit 16; }

log "synthetic seed ready; running the real-PostgreSQL acceptance suite"
set +e
PHASE13_M6_3_DB_INTEGRATION=true PHASE13_M6_3_TEST_ENVIRONMENT_ID=phase13-m6-3-disposable \
PHASE13_M6_3_TEST_DATABASE_ROLE="$ROLE" PHASE13_M6_3_TEST_HOST_PORT="$HOST_PORT" \
PHASE13_M6_3_TEST_SERVER_PORT=5432 PHASE13_M6_3_TEST_DATABASE_URL="$URL" \
POSTGRES_URL="$URL" DATABASE_URL="$URL" \
  pnpm test:phase13:m6-3:db:integration >"$WORKDIR/pg.log" 2>&1
PG_STATUS=$?
set -e
PASSES="$(grep -E '^ℹ pass [0-9]+' "$WORKDIR/pg.log" | awk '{print $3}' | tail -1)"
SKIPS="$(grep -E '^ℹ skipped [0-9]+' "$WORKDIR/pg.log" | awk '{print $3}' | tail -1)"
PG_FAILS="$(grep -E '^✖' "$WORKDIR/pg.log" 2>/dev/null | sed -e 's/[[:space:]]\+/ /g' | sort -u | head -5 | tr '\n' ';' || true)"
PG_SUITE="exit=$PG_STATUS pass=${PASSES:-0} skip=${SKIPS:-unknown} failed=${PG_FAILS:-none}"
if [ "$PG_STATUS" -ne 0 ] || [ "${SKIPS:-1}" != "0" ] || [ "${PASSES:-0}" -lt 8 ]; then
  VERDICT="postgres_acceptance_failed"
  printf '%s\n' "$PG_SUITE" >&2
  exit 17
fi

# Loopback-only Next.js server bound to the disposable database. `AUTH_SECRET` is
# a per-run temporary value for this process only; production auth is untouched.
AUTH_SECRET_TEMP="$(openssl rand -hex 32)"
POSTGRES_URL="$URL" DATABASE_URL="$URL" AUTH_SECRET="$AUTH_SECRET_TEMP" \
AUTH_TRUST_HOST=true NEXTAUTH_URL="http://127.0.0.1:$APP_PORT" \
  setsid pnpm exec next dev --hostname 127.0.0.1 --port "$APP_PORT" \
  >"$WORKDIR/server.log" 2>&1 &
SERVER_PID=$!
SERVER_PGID="$SERVER_PID"
SERVER_READY="no"
for _ in $(seq 1 120); do
  if (exec 3<>/dev/tcp/127.0.0.1/"$APP_PORT") 2>/dev/null; then
    SERVER_READY="yes"
    break
  fi
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 1
done
if [ "$SERVER_READY" != "yes" ]; then
  VERDICT="loopback_server_failed_to_start"
  exit 20
fi

log "starting the loopback-only Next.js server"
set +e
PLAYWRIGHT_JSON_OUTPUT_NAME="$WORKDIR/browser.json" \
PHASE13_M6_3_BROWSER_AUTHORIZED=true PHASE13_M6_3_BROWSER_BASE_URL="http://127.0.0.1:$APP_PORT" \
PHASE13_M6_3_PROJECT_ID="$PROJECT_ID" PHASE13_M6_3_PROJECT_NAME="M6.3 synthetic study journey" \
PHASE13_M6_3_SYNTHETIC_EMAIL="$PHASE13_M6_3_SYNTHETIC_EMAIL" \
PHASE13_M6_3_SYNTHETIC_PASSWORD="$PHASE13_M6_3_SYNTHETIC_PASSWORD" \
  pnpm exec playwright test --config=playwright.phase13-m6-3.config.ts \
  --reporter=list --reporter=json \
  >"$WORKDIR/browser.log" 2>&1
BROWSER_STATUS=$?
set -e
# Machine-readable summary from the JSON reporter; never parsed from coloured text.
BROWSER_JSON="$(M63B_JSON_FILE="$WORKDIR/browser.json" M63B_LOG_FILE="$WORKDIR/browser.log" \
  node - <<'NODEEOF'
const fs = require("node:fs");
function load(file) {
  try {
    return file && fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : null;
  } catch {
    return null;
  }
}
let data = load(process.env.M63B_JSON_FILE);
if (!data) {
  const log = fs.existsSync(process.env.M63B_LOG_FILE)
    ? fs.readFileSync(process.env.M63B_LOG_FILE, "utf8")
    : "";
  const start = log.indexOf('{"config"');
  if (start >= 0) {
    try {
      data = JSON.parse(log.slice(start));
    } catch {
      data = null;
    }
  }
}
if (!data || !data.stats) {
  console.log("unparsable");
} else {
  const s = data.stats;
  console.log(
    `expected=${s.expected ?? "?"} unexpected=${s.unexpected ?? "?"} skipped=${s.skipped ?? "?"} flaky=${s.flaky ?? "?"}`
  );
  const failures = [];
  const walk = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          if (t.status && t.status !== "expected" && t.status !== "skipped") {
            const message = String(t.results?.[0]?.error?.message ?? "no-message")
              .split("\n")
              .filter((line) => line.trim().length > 0)
              .slice(0, 2)
              .join(" | ")
              .replace(/\s+/gu, " ")
              .slice(0, 240);
            failures.push(`${spec.title}::{message}`);
          }
        }
      }
      walk(suite.suites);
    }
  };
  walk(data.suites);
  console.log(`failures=${failures.slice(0, 4).join(" ;; ") || "none"}`);
}
NODEEOF
)"
log "browser suite finished"
BROWSER_JSON_NUM="$(printf '%s\n' "$BROWSER_JSON" | head -1)"
BROWSER="exit=$BROWSER_STATUS ${BROWSER_JSON_NUM:-unparsable}"
EXPECTED_BROWSER_TESTS=2
if [ "$BROWSER_JSON_NUM" != "expected=$EXPECTED_BROWSER_TESTS unexpected=0 skipped=0 flaky=0" ]; then
  BROWSER_STATUS=1
fi
if [ "$BROWSER_STATUS" -ne 0 ]; then
  VERDICT="browser_acceptance_failed"
  BROWSER_DETAIL="$(printf '%s\n' "$BROWSER_JSON" | sed -n '2p')"
  # Sanitized failure evidence survives cleanup for diagnosis and the report.
  tail -160 "$WORKDIR/browser.log" >"${PHASE13_M6_3_BROWSER_FAILURE_LOG:-/tmp/phase13_m6_3_browser_failure.log}" 2>/dev/null || true
  printf '%s\n' "$BROWSER" "$BROWSER_DETAIL" >&2
  exit 18
fi

VERDICT="passed"
exit 0
