#!/usr/bin/env bash
# Phase 13 M8.1 - ONE consolidated disposable PostgreSQL 17 + Chromium acceptance run.
#
# Sequence: authorization gate -> preflight (never destructive) -> disposable
# PostgreSQL 17 (tmpfs, loopback) -> migrations 0000-0051 -> synthetic customers,
# Projects, M5.1 school application + package and M6.2 GS draft -> loopback-only
# Next.js with the M8.1 feature flag enabled for THIS process only -> Chromium
# journeys (school, student 500, invalidation, security/truthful state) -> stop
# server -> destroy database -> independent cleanup verification.
#
# The database outlives the browser run. Cleanup traps are installed before anything
# is created and run on EXIT/INT/TERM; only resources created by this run are removed.
#
# Authorization markers (all required, none set in this repository):
#   PHASE13_M8_1_DB_AUTHORIZED=true
#   PHASE13_M8_1_ALLOW_DB_CREATION=true
#   PHASE13_M8_1_SEED_AUTHORIZED=true
#   PHASE13_M8_1_BROWSER_AUTHORIZED=true
#   PHASE13_M8_1_SYNTHETIC_EMAIL / PHASE13_M8_1_SYNTHETIC_PASSWORD (synthetic only)

set -Eeuo pipefail

CONTAINER="phase13-m8-1-pg"
HOST_PORT="55453"
APP_PORT="${PHASE13_M8_1_APP_PORT:-3102}"
DB="immigration_ai_phase13_m8_1_test"
ROLE="m8_1_test_owner"
LABEL_KEY="org.immigration-ai.phase13-m8-1.run"
EXPECTED_BROWSER_TESTS=5
MAX_DIAG_LINES="${PHASE13_M8_1_MAX_DIAG_LINES:-40}"
CHATBOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d /tmp/phase13-m8-1-browser.XXXXXX)"
REPORT="${PHASE13_M8_1_BROWSER_RESULT_LOG:-/tmp/phase13_m8_1_browser_run.sanitized.log}"
FAILURE_LOG="${PHASE13_M8_1_BROWSER_FAILURE_LOG:-/tmp/phase13_m8_1_browser_failure.log}"
RUN_ID="$(openssl rand -hex 8)"
CREATED_ID=""
SERVER_PID=""
SERVER_PGID=""
CLEANED=0
SERVER_STOPPED="not_started"
SERVER_PORT_FREE="not_started"
BROWSER="not_run"
BROWSER_DETAIL="none"
SEED_PROJECT="none"
VERDICT="incomplete"
CLEANUP_VERDICT="not_run"
CLEANUP_DETAIL="not_run"
WORKDIR_PRESENT="yes"
SUPERPASS=""
APPPASS=""
URL=""

log() { echo "[m8.1-browser] $*" >&2; }

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

# Bounded, sanitized browser failure summary: failing spec titles and the first error
# lines only. Never the database URL, credentials or unrelated log content.
print_browser_failure_diagnostics() {
  local logfile="$WORKDIR/browser.log"
  [ -f "$logfile" ] || { log "diagnostics: no browser log available"; return 0; }
  local names errors
  names="$(grep -E '^\s+[0-9]+\) \[chromium\]|^\s+✘|^\s+×' "$logfile" 2>/dev/null \
    | awk '!seen[$0]++' | head -n 5 || true)"
  errors="$(grep -E '^\s+(Error|AssertionError|TimeoutError|expect\(|at )' "$logfile" 2>/dev/null \
    | awk '!seen[$0]++' | head -n "$((MAX_DIAG_LINES - 5))" || true)"
  log "FAILED: failing browser journeys follow (bounded, sanitized)"
  if [ -z "$names" ]; then
    log "  (no failing spec titles parsed)"
  else
    printf '%s\n' "$names" | while IFS= read -r line; do
      printf '[m8.1-browser]   FAIL %s\n' "$line" | redact >&2
    done
  fi
  if [ -n "$errors" ]; then
    printf '%s\n' "$errors" | while IFS= read -r line; do
      printf '[m8.1-browser]   %s\n' "$line" | redact >&2
    done
  fi
  log "FAILED: end of diagnostics (cap ${MAX_DIAG_LINES} lines)"
}

write_report() {
  {
    echo "# Phase 13 M8.1 consolidated Chromium acceptance (sanitized)"
    echo "run_id=$RUN_ID"
    echo "verdict=$VERDICT"
    echo "seed_project=$SEED_PROJECT"
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
    # 1. Browser and server stop BEFORE the database is destroyed.
    if [ -n "$SERVER_PGID" ]; then
      kill -TERM -- "-$SERVER_PGID" 2>/dev/null || kill -TERM "$SERVER_PGID" 2>/dev/null || true
      for _ in $(seq 1 40); do
        kill -0 "$SERVER_PGID" 2>/dev/null || break
        sleep 0.5
      done
      if kill -0 "$SERVER_PGID" 2>/dev/null; then
        kill -KILL -- "-$SERVER_PGID" 2>/dev/null || kill -KILL "$SERVER_PGID" 2>/dev/null || true
        sleep 1
      fi
      if kill -0 "$SERVER_PGID" 2>/dev/null; then SERVER_STOPPED="survives"; else SERVER_STOPPED="yes"; fi
      if (exec 3<>/dev/tcp/127.0.0.1/"$APP_PORT") 2>/dev/null; then
        SERVER_PORT_FREE="no"
      else
        SERVER_PORT_FREE="yes"
      fi
    fi

    # 2. Only a container this run created is removed (id or unique label match).
    if [ -n "$CREATED_ID" ]; then
      local current_id current_label
      current_id="$(docker inspect -f '{{.Id}}' "$CONTAINER" 2>/dev/null || true)"
      current_label="$(docker inspect -f "{{ index .Config.Labels \"$LABEL_KEY\" }}" "$CONTAINER" 2>/dev/null || true)"
      if { [ -n "$current_id" ] && [ "$current_id" = "$CREATED_ID" ]; } ||
        [ "$current_label" = "$RUN_ID" ]; then
        docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
      else
        log "cleanup: container is not identifiable as this run's; not removing"
      fi
    fi

    # 3. Sanitized failure evidence survives the temporary directory.
    if [ -f "$WORKDIR/browser.log" ]; then
      redact < "$WORKDIR/browser.log" | tail -160 >"$FAILURE_LOG" 2>/dev/null || true
    fi

    # 4. Phase A: Docker inventory comparison and process/port checks WHILE the
    #    inventory still exists. The work directory is intentionally not checked here.
    CLEANUP_A="failed"
    CLEANUP_A_DETAIL="not_run"
    if M81_CONTAINER="$CONTAINER" M81_CREATED_ID="$CREATED_ID" \
      M81_HOST_PORT="$HOST_PORT" M81_APP_PORT="$APP_PORT" \
      M81_SERVER_PID="$SERVER_PID" \
      bash "$CHATBOT_DIR/scripts/phase13-m8-1-cleanup-check.sh" "$WORKDIR" inventory \
      >"$WORKDIR/cleanup-inventory.log" 2>&1; then
      CLEANUP_A="ok"
      CLEANUP_A_DETAIL="$(tr '\n' ' ' < "$WORKDIR/cleanup-inventory.log")"
    else
      CLEANUP_A_DETAIL="$(tr '\n' ' ' < "$WORKDIR/cleanup-inventory.log" 2>/dev/null || echo unavailable)"
    fi

    # 5. Temporary browser output, logs, credentials and the directory itself.
    rm -rf "$WORKDIR/browser-output" 2>/dev/null || true
    rm -f "$WORKDIR"/*.log "$WORKDIR"/*.json "$WORKDIR"/*.env "$WORKDIR"/*.txt \
      "$WORKDIR"/*.before 2>/dev/null || true
    WORKDIR_PRESENT=yes
    rmdir "$WORKDIR" 2>/dev/null && WORKDIR_PRESENT=no

    # 6. Phase B: independent verification that the work directory is gone, and that
    #    no container, port or Next.js process of this run survived.
    CLEANUP_B="failed"
    CLEANUP_B_DETAIL="not_run"
    if M81_CONTAINER="$CONTAINER" M81_CREATED_ID="$CREATED_ID" \
      M81_HOST_PORT="$HOST_PORT" M81_APP_PORT="$APP_PORT" \
      M81_SERVER_PID="$SERVER_PID" M81_WORKDIR="$WORKDIR" \
      bash "$CHATBOT_DIR/scripts/phase13-m8-1-cleanup-check.sh" - final \
      >/tmp/phase13_m8_1_cleanup_final.$$ 2>&1; then
      CLEANUP_B="ok"
      CLEANUP_B_DETAIL="$(tr '\n' ' ' < /tmp/phase13_m8_1_cleanup_final.$$)"
    else
      CLEANUP_B_DETAIL="$(tr '\n' ' ' < /tmp/phase13_m8_1_cleanup_final.$$ 2>/dev/null || echo unavailable)"
    fi
    rm -f /tmp/phase13_m8_1_cleanup_final.$$ 2>/dev/null || true

    CLEANUP_DETAIL="${CLEANUP_A_DETAIL} | ${CLEANUP_B_DETAIL}"
    if [ "$CLEANUP_A" = "ok" ] && [ "$CLEANUP_B" = "ok" ] && \
      [ "$SERVER_STOPPED" != "survives" ] && [ "$SERVER_PORT_FREE" != "no" ] && \
      [ "$WORKDIR_PRESENT" = "no" ]; then
      CLEANUP_VERDICT="ok"
    else
      CLEANUP_VERDICT="failed"
    fi

    write_report
    if [ "$CLEANUP_VERDICT" != "ok" ] && [ "$status" -eq 0 ]; then
      log "CLEANUP_FAILED: $CLEANUP_DETAIL"
      VERDICT="cleanup_failed_resource_survives"
      write_report
      status=21
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ---------- authorization gate ----------
for marker in PHASE13_M8_1_DB_AUTHORIZED PHASE13_M8_1_ALLOW_DB_CREATION \
  PHASE13_M8_1_SEED_AUTHORIZED PHASE13_M8_1_BROWSER_AUTHORIZED; do
  if [ "${!marker:-}" != "true" ]; then
    VERDICT="blocked_pending_owner_authorization"
    log "BLOCKED: $marker must be true for this run"
    exit 78
  fi
done
if [ -z "${PHASE13_M8_1_SYNTHETIC_EMAIL:-}" ] || [ -z "${PHASE13_M8_1_SYNTHETIC_PASSWORD:-}" ]; then
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

# ---------- disposable PostgreSQL (tmpfs, loopback, no volume) ----------
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
log "applying migrations 0000-0051 to the disposable database"
POSTGRES_URL="$URL" pnpm exec tsx scripts/db-migration-operator.ts \
  --acknowledge-migrations --expect-database="$DB" >"$WORKDIR/migrate.log" 2>&1 ||
  { VERDICT="migration_failed"; exit 15; }
LEDGER="$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc \
  "select count(*) from drizzle.__drizzle_migrations;" | tr -d '[:space:]')"
[ "$LEDGER" = "52" ] || { VERDICT="unexpected_migration_ledger"; exit 15; }
log "migration ledger: $LEDGER"

# ---------- synthetic customers, Projects and real application records ----------
log "seeding synthetic customers, M5.1 package and M6.2 GS draft"
SEED_OUT="$(POSTGRES_URL="$URL" DATABASE_URL="$URL" \
  PHASE13_M8_1_SEED_AUTHORIZED=true PHASE13_M8_1_TEST_DATABASE_URL="$URL" \
  PHASE13_M8_1_SEED_EMAIL="$PHASE13_M8_1_SYNTHETIC_EMAIL" \
  PHASE13_M8_1_SEED_PASSWORD="$PHASE13_M8_1_SYNTHETIC_PASSWORD" \
  node --conditions=react-server --import tsx scripts/phase13-m8-1-seed-synthetic.ts 2>&1)" || {
  VERDICT="synthetic_seed_failed"
  printf '%s\n' "$SEED_OUT" | redact | tail -8 >&2
  exit 16
}
read_marker() { printf '%s\n' "$SEED_OUT" | sed -n "s/^$1=//p" | tail -1; }
PROJECT_ID="$(read_marker PHASE13_M8_1_PROJECT_ID)"
OUTSIDER_PROJECT_ID="$(read_marker PHASE13_M8_1_OUTSIDER_PROJECT_ID)"
OUTSIDER_EMAIL="$(read_marker PHASE13_M8_1_OUTSIDER_EMAIL)"
SCHOOL_TARGET_ID="$(read_marker PHASE13_M8_1_SCHOOL_TARGET_ID)"
STUDENT_TARGET_ID="$(read_marker PHASE13_M8_1_STUDENT500_TARGET_ID)"
GS_DRAFT_VERSION="$(read_marker PHASE13_M8_1_GS_DRAFT_VERSION)"
for marker in PROJECT_ID OUTSIDER_PROJECT_ID OUTSIDER_EMAIL SCHOOL_TARGET_ID STUDENT_TARGET_ID GS_DRAFT_VERSION; do
  if [ -z "${!marker}" ]; then
    VERDICT="synthetic_seed_incomplete"
    log "SEED_INCOMPLETE: $marker was not produced"
    exit 16
  fi
done
SEED_PROJECT="$PROJECT_ID"
log "seed ready: project=$PROJECT_ID school=$SCHOOL_TARGET_ID student500=$STUDENT_TARGET_ID gs_draft=v$GS_DRAFT_VERSION"

# ---------- loopback-only Next.js on the disposable database ----------
# AUTH_SECRET is a per-run temporary value for this process only. The M8.1 feature
# flag, the M5.1/M6.1 capability flags and the disposable database URL exist ONLY in
# this process environment: the developer shell, .env files and production settings
# are untouched.
AUTH_SECRET_TEMP="$(openssl rand -hex 32)"
POSTGRES_URL="$URL" DATABASE_URL="$URL" AUTH_SECRET="$AUTH_SECRET_TEMP" \
AUTH_TRUST_HOST=true NEXTAUTH_URL="http://127.0.0.1:$APP_PORT" \
PHASE13_SUBMISSION_PACKAGES_ENABLED=true \
PHASE13_SCHOOL_APPLICATIONS_ENABLED=true PHASE13_STUDENT500_ENABLED=true \
PHASE13_PROJECT_CHAT_ENABLED=true \
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
  redact < "$WORKDIR/server.log" | tail -20 >&2
  exit 20
fi
log "loopback server ready on 127.0.0.1:$APP_PORT (M8.1 flag enabled for this process only)"

# ---------- Chromium acceptance ----------
set +e
PLAYWRIGHT_JSON_OUTPUT_NAME="$WORKDIR/browser.json" \
PHASE13_M8_1_PLAYWRIGHT_OUTPUT="$WORKDIR/browser-output" \
PHASE13_M8_1_BROWSER_AUTHORIZED=true PHASE13_M8_1_BROWSER_BASE_URL="http://127.0.0.1:$APP_PORT" \
PHASE13_M8_1_PROJECT_ID="$PROJECT_ID" PHASE13_M8_1_SCHOOL_TARGET_ID="$SCHOOL_TARGET_ID" \
PHASE13_M8_1_STUDENT500_TARGET_ID="$STUDENT_TARGET_ID" PHASE13_M8_1_GS_DRAFT_VERSION="$GS_DRAFT_VERSION" \
PHASE13_M8_1_OUTSIDER_PROJECT_ID="$OUTSIDER_PROJECT_ID" \
PHASE13_M8_1_OUTSIDER_EMAIL="$OUTSIDER_EMAIL" \
PHASE13_M8_1_SYNTHETIC_EMAIL="$PHASE13_M8_1_SYNTHETIC_EMAIL" \
PHASE13_M8_1_SYNTHETIC_PASSWORD="$PHASE13_M8_1_SYNTHETIC_PASSWORD" \
  pnpm exec playwright test --config=playwright.phase13-m8-1.config.ts \
  --reporter=list --reporter=json >"$WORKDIR/browser.log" 2>&1
BROWSER_STATUS=$?
set -e
BROWSER_JSON="$(M81B_JSON_FILE="$WORKDIR/browser.json" M81B_LOG_FILE="$WORKDIR/browser.log" \
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
let data = load(process.env.M81B_JSON_FILE);
if (!data) {
  const log = fs.existsSync(process.env.M81B_LOG_FILE)
    ? fs.readFileSync(process.env.M81B_LOG_FILE, "utf8")
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
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
              .slice(0, 2)
              .join(" | ")
              .replace(/\\s+/gu, " ")
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
# A PASS requires EVERY journey to run: no skip, no flake, no unexpected failure, and
# the exact expected count. Missing fixtures or a disabled feature surface as a failed
# journey in the spec, never as a skip.
if [ "$BROWSER_JSON_NUM" != "expected=$EXPECTED_BROWSER_TESTS unexpected=0 skipped=0 flaky=0" ]; then
  BROWSER_STATUS=1
fi
log "browser suite: $BROWSER"
[ "$BROWSER_DETAIL" = "failures=none" ] || log "browser failures: $BROWSER_DETAIL"
if [ "$BROWSER_STATUS" -ne 0 ]; then
  VERDICT="browser_acceptance_failed"
  print_browser_failure_diagnostics || true
  exit 18
fi

VERDICT="passed"
exit 0
