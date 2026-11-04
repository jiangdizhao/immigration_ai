#!/usr/bin/env bash
# Phase 13 M7 - one consolidated disposable PostgreSQL + Chromium acceptance run.
#
# Sequence: preflight -> disposable PostgreSQL (tmpfs, loopback) -> migrations
# 0000-0050 -> synthetic account/Project -> real-PostgreSQL M7 suite -> loopback
# Next.js -> Chromium -> stop server -> destroy database -> verify cleanup.
#
# The database outlives the browser run; server and browser stop BEFORE the database
# is destroyed. Cleanup traps are installed before anything is created and run on
# EXIT/INT/TERM. Only resources created by this run are ever removed.
#
# Authorization markers (all required):
#   PHASE13_M7_DB_AUTHORIZED=true
#   PHASE13_M7_ALLOW_DB_CREATION=true
#   PHASE13_M7_BROWSER_AUTHORIZED=true
#   PHASE13_M7_SEED_AUTHORIZED=true
#   PHASE13_M7_SYNTHETIC_EMAIL / PHASE13_M7_SYNTHETIC_PASSWORD (synthetic only)

set -Eeuo pipefail

CONTAINER="phase13-m7-pg"
HOST_PORT="55451"
APP_PORT="${PHASE13_M7_APP_PORT:-3101}"
DB="immigration_ai_phase13_m7_test"
ROLE="m7_test_owner"
LABEL_KEY="org.immigration-ai.phase13-m7.run"
CHATBOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d /tmp/phase13-m7-browser.XXXXXX)"
REPORT="${PHASE13_M7_BROWSER_RESULT_LOG:-/tmp/phase13_m7_browser_run.sanitized.log}"
FAILURE_LOG="${PHASE13_M7_BROWSER_FAILURE_LOG:-/tmp/phase13_m7_browser_failure.log}"
RUN_ID="$(openssl rand -hex 8)"
CREATED_ID=""
SERVER_PID=""
SERVER_PGID=""
CLEANED=0
SERVER_STOPPED="not_started"
SERVER_PORT_FREE="not_started"
BROWSER="not_run"
BROWSER_DETAIL="none"
PG_SUITE="not_run"
SEED_PROJECT="none"
VERDICT="incomplete"
CLEANUP_VERDICT="not_run"
CLEANUP_DETAIL="not_run"
WORKDIR_PRESENT="yes"

log() { echo "[m7-browser] $*" >&2; }

write_report() {
  {
    echo "# Phase 13 M7 consolidated browser acceptance (sanitized)"
    echo "run_id=$RUN_ID"
    echo "verdict=$VERDICT"
    echo "seed_project=$SEED_PROJECT"
    echo "postgres_suite=$PG_SUITE"
    echo "browser=$BROWSER"
    echo "browser_detail=$BROWSER_DETAIL"
    echo "server_stopped=$SERVER_STOPPED"
    echo "server_port_${APP_PORT}_released=$SERVER_PORT_FREE"
    echo "container_created=$([ -n "$CREATED_ID" ] && echo yes || echo no)"
    echo "container_present_after=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER" && echo yes || echo no)"
    echo "port_${HOST_PORT}_listening=$( (exec 3<>/dev/tcp/127.0.0.1/$HOST_PORT) 2>/dev/null && echo yes || echo no)"
    echo "cleanup_verdict=${CLEANUP_VERDICT:-not_run}"
    echo "cleanup_detail=${CLEANUP_DETAIL:-not_run}"
    echo "workdir_present=${WORKDIR_PRESENT:-unknown}"
  } > "$REPORT" 2>/dev/null || true
}

cleanup() {
  local status=$?
  if [ "$CLEANED" -eq 0 ]; then
    CLEANED=1
    # 1. Server and browser stop before the database is destroyed. Only the process
    #    group this run created is signalled.
    if [ -n "$SERVER_PGID" ]; then
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
    fi

    # 2. Remove only the container this run created.
    if [ -n "$CREATED_ID" ]; then
      current_id="$(docker inspect -f '{{.Id}}' "$CONTAINER" 2>/dev/null || true)"
      current_label="$(docker inspect -f "{{ index .Config.Labels \"$LABEL_KEY\" }}" "$CONTAINER" 2>/dev/null || true)"
      if { [ -n "$current_id" ] && [ "$current_id" = "$CREATED_ID" ]; } ||
        [ "$current_label" = "$RUN_ID" ]; then
        docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
      fi
    fi

    # 3. Sanitized failure evidence survives the temporary directory.
    if [ -f "$WORKDIR/browser.log" ]; then
      sed -E 's#postgres://[^ ]*#postgres://<redacted>#g' "$WORKDIR/browser.log" |
        tail -160 >"$FAILURE_LOG" 2>/dev/null || true
    fi

    # 4. Independent cleanup verification before anything else is deleted.
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

    # 5. Temporary browser output, logs, credentials and the directory itself.
    rm -rf "$WORKDIR/browser-output" 2>/dev/null || true
    rm -f "$WORKDIR"/*.log "$WORKDIR"/*.json "$WORKDIR"/*.env "$WORKDIR"/*.txt \
      "$WORKDIR"/*.before 2>/dev/null || true
    WORKDIR_PRESENT=yes
    if rmdir "$WORKDIR" 2>/dev/null; then WORKDIR_PRESENT=no; fi

    if [ "$SERVER_STOPPED" = "survives" ] || [ "$SERVER_PORT_FREE" = "no" ]; then
      CLEANUP_VERDICT="failed"
      CLEANUP_DETAIL="${CLEANUP_DETAIL} server_survives"
    fi
    [ "$WORKDIR_PRESENT" = "no" ] || [ "$CLEANUP_VERDICT" = "failed" ] || CLEANUP_VERDICT="failed"

    write_report "$status"
    if [ "$CLEANUP_VERDICT" != "ok" ] && [ "$status" -eq 0 ]; then
      log "CLEANUP_FAILED: $CLEANUP_DETAIL"
      VERDICT="cleanup_failed_resource_survives"
      write_report "21"
      status=21
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ---------- authorization gate ----------
for marker in PHASE13_M7_DB_AUTHORIZED PHASE13_M7_ALLOW_DB_CREATION \
  PHASE13_M7_BROWSER_AUTHORIZED PHASE13_M7_SEED_AUTHORIZED; do
  if [ "${!marker:-}" != "true" ]; then
    VERDICT="blocked_pending_owner_authorization"
    log "BLOCKED: $marker must be true for this run"
    exit 78
  fi
done
if [ -z "${PHASE13_M7_SYNTHETIC_EMAIL:-}" ] || [ -z "${PHASE13_M7_SYNTHETIC_PASSWORD:-}" ]; then
  VERDICT="blocked_missing_synthetic_credentials"
  log "BLOCKED: synthetic email and password are required (never real credentials)"
  exit 78
fi

# ---------- preflight (never destructive) ----------
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  VERDICT="preflight_conflict_existing_container_preserved"
  log "PREFLIGHT_CONFLICT: $CONTAINER exists and will NOT be deleted"
  exit 11
fi
for port in "$HOST_PORT" "$APP_PORT"; do
  if (exec 3<>/dev/tcp/127.0.0.1/"$port") 2>/dev/null; then
    VERDICT="preflight_conflict_port_in_use"
    log "PREFLIGHT_CONFLICT: port $port is in use; nothing created, nothing deleted"
    exit 12
  fi
done
if ! docker image inspect postgres:17 >/dev/null 2>&1; then
  VERDICT="approved_image_missing_no_pull_allowed"
  log "PREFLIGHT: postgres:17 is absent locally; this runner never pulls"
  exit 19
fi
docker ps -a --format '{{.Names}}' | sort > "$WORKDIR/containers.before"
docker volume ls -q | sort > "$WORKDIR/volumes.before"
docker network ls --format '{{.Name}}' | sort > "$WORKDIR/networks.before"
docker images --format '{{.Repository}}:{{.Tag}}' | sort > "$WORKDIR/images.before"
mkdir -p "$WORKDIR/browser-output"
log "preflight ok: names and ports free; inventory captured"

# ---------- disposable PostgreSQL (tmpfs, loopback, no volumes) ----------
SUPERPASS="$(openssl rand -hex 24)"
APPPASS="$(openssl rand -hex 24)"
CREATED_ID="$(docker run -d --rm --name "$CONTAINER" --label "$LABEL_KEY=$RUN_ID" \
  --mount type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=1073741824,tmpfs-mode=1777 \
  -e POSTGRES_PASSWORD="$SUPERPASS" -e POSTGRES_DB=postgres \
  -p "127.0.0.1:$HOST_PORT:5432" postgres:17)"
[ -n "$CREATED_ID" ] || { VERDICT="container_creation_failed"; exit 13; }
log "created container id=${CREATED_ID:0:12}... run_id=$RUN_ID"
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
[ "$ID_ROW" = "$DB|postgres" ] || { VERDICT="identity_mismatch"; exit 14; }
URL="postgres://$ROLE:$APPPASS@127.0.0.1:$HOST_PORT/$DB"

cd "$CHATBOT_DIR"
log "applying migrations 0000-0050 to the disposable database"
POSTGRES_URL="$URL" pnpm exec tsx scripts/db-migration-operator.ts \
  --acknowledge-migrations --expect-database="$DB" >"$WORKDIR/migrate.log" 2>&1 ||
  { VERDICT="migration_failed"; exit 15; }
LEDGER="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc \
  "select count(*) from drizzle.__drizzle_migrations;" | tr -d '[:space:]')"
[ "$LEDGER" = "51" ] || { VERDICT="unexpected_migration_ledger"; exit 15; }
log "migration ledger: $LEDGER"

log "seeding the synthetic account and Project"
SEED_OUT="$(PHASE13_M7_SEED_AUTHORIZED=true PHASE13_M7_TEST_DATABASE_URL="$URL" \
  PHASE13_M7_SEED_EMAIL="$PHASE13_M7_SYNTHETIC_EMAIL" \
  PHASE13_M7_SEED_PASSWORD="$PHASE13_M7_SYNTHETIC_PASSWORD" \
  pnpm exec tsx scripts/phase13-m7-seed-synthetic.ts 2>&1)" || {
  VERDICT="synthetic_seed_failed"
  printf '%s\n' "$SEED_OUT" | tail -8 >&2
  exit 16
}
PROJECT_ID="$(printf '%s\n' "$SEED_OUT" | sed -n 's/^PHASE13_M7_PROJECT_ID=//p' | tail -1)"
[ -n "$PROJECT_ID" ] || { VERDICT="synthetic_seed_failed"; exit 16; }
SEED_PROJECT="$PROJECT_ID"

log "running the real-PostgreSQL M7 suite inside the same environment"
set +e
PHASE13_M7_DB_INTEGRATION=true PHASE13_M7_TEST_ENVIRONMENT_ID=phase13-m7-disposable \
PHASE13_M7_TEST_DATABASE_ROLE="$ROLE" PHASE13_M7_TEST_HOST_PORT="$HOST_PORT" \
PHASE13_M7_TEST_SERVER_PORT=5432 PHASE13_M7_TEST_DATABASE_URL="$URL" \
POSTGRES_URL="$URL" DATABASE_URL="$URL" \
  pnpm test:phase13:m7:db:integration >"$WORKDIR/pg.log" 2>&1
PG_STATUS=$?
set -e
PG_PASSES="$(grep -E '^ℹ pass [0-9]+' "$WORKDIR/pg.log" | awk '{print $3}' | tail -1)"
PG_SKIPS="$(grep -E '^ℹ skipped [0-9]+' "$WORKDIR/pg.log" | awk '{print $3}' | tail -1)"
PG_FAILS="$(grep -E '^ℹ fail [0-9]+' "$WORKDIR/pg.log" | awk '{print $3}' | tail -1)"
PG_SUITE="exit=$PG_STATUS pass=${PG_PASSES:-0} skip=${PG_SKIPS:-unknown} fail=${PG_FAILS:-unknown}"
log "postgres suite: $PG_SUITE"
if [ "$PG_STATUS" -ne 0 ] || [ "${PG_SKIPS:-1}" != "0" ] || [ "${PG_PASSES:-0}" -lt 19 ]; then
  VERDICT="postgres_acceptance_failed"
  exit 17
fi

# ---------- loopback-only Next.js server on the disposable database ----------
# AUTH_SECRET is a per-run temporary value for this process only; production auth
# configuration is untouched.
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
log "loopback server ready on 127.0.0.1:$APP_PORT"

# ---------- Chromium acceptance ----------
set +e
PLAYWRIGHT_JSON_OUTPUT_NAME="$WORKDIR/browser.json" \
PHASE13_M7_PLAYWRIGHT_OUTPUT="$WORKDIR/browser-output" \
PHASE13_M7_BROWSER_AUTHORIZED=true PHASE13_M7_BROWSER_BASE_URL="http://127.0.0.1:$APP_PORT" \
PHASE13_M7_PROJECT_ID="$PROJECT_ID" PHASE13_M7_PROJECT_NAME="M7 synthetic study journey" \
PHASE13_M7_SYNTHETIC_EMAIL="$PHASE13_M7_SYNTHETIC_EMAIL" \
PHASE13_M7_SYNTHETIC_PASSWORD="$PHASE13_M7_SYNTHETIC_PASSWORD" \
  pnpm exec playwright test --config=playwright.phase13-m7.config.ts \
  --reporter=list --reporter=json >"$WORKDIR/browser.log" 2>&1
BROWSER_STATUS=$?
set -e
BROWSER_JSON="$(M7B_JSON_FILE="$WORKDIR/browser.json" M7B_LOG_FILE="$WORKDIR/browser.log" \
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
let data = load(process.env.M7B_JSON_FILE);
if (!data) {
  const log = fs.existsSync(process.env.M7B_LOG_FILE)
    ? fs.readFileSync(process.env.M7B_LOG_FILE, "utf8")
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
            failures.push(`${spec.title}::${message}`);
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
BROWSER_JSON_NUM="$(printf '%s\n' "$BROWSER_JSON" | head -1)"
BROWSER="exit=$BROWSER_STATUS ${BROWSER_JSON_NUM:-unparsable}"
BROWSER_DETAIL="$(printf '%s\n' "$BROWSER_JSON" | sed -n '2p')"
EXPECTED_BROWSER_TESTS=3
if [ "$BROWSER_JSON_NUM" != "expected=$EXPECTED_BROWSER_TESTS unexpected=0 skipped=0 flaky=0" ]; then
  BROWSER_STATUS=1
fi
log "browser suite: $BROWSER"
if [ "$BROWSER_STATUS" -ne 0 ]; then
  VERDICT="browser_acceptance_failed"
  printf '%s\n' "$BROWSER" "$BROWSER_DETAIL" >&2
  exit 18
fi

VERDICT="passed"
exit 0
