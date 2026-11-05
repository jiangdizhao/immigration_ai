#!/usr/bin/env bash
# Phase 13 M8.1 - independent cleanup verification (read-only, never destructive).
#
# The runner verifies cleanup in two phases, because the pre-existing Docker inventory
# lives inside the temporary work directory:
#
#   inventory : Docker inventory comparison + container/container-id/port/process
#               checks, executed while the inventory and work directory still exist.
#               The work directory itself is intentionally NOT checked here.
#   final     : container/container-id/port/process checks AND work-directory absence,
#               executed after the runner removed the temporary directory.
#   all       : single-shot mode (every check); only valid when an inventory directory
#               is supplied and no work directory is expected to be removed.
#
# Exit 0 = this phase verified, exit 1 = a survivor was found. A genuine leak always
# fails the phase, so the runner's combined verdict fails with it.
#
# Usage:  phase13-m8-1-cleanup-check.sh <inventory-dir|-> [inventory|final|all]
# Environment:
#   M81_CONTAINER   container name that must be absent
#   M81_CREATED_ID  container id created by this run (may be empty)
#   M81_HOST_PORT   PostgreSQL host port that must be released
#   M81_APP_PORT    Next.js host port that must be released
#   M81_SERVER_PID  Next.js process-group id that must be gone (may be empty)
#   M81_WORKDIR     temporary run directory (required by the final phase)

set -Eeuo pipefail

INVENTORY_DIR="${1:-}"
PHASE="${2:-all}"
CONTAINER="${M81_CONTAINER:-phase13-m8-1-pg}"
CREATED_ID="${M81_CREATED_ID:-}"
HOST_PORT="${M81_HOST_PORT:-55453}"
APP_PORT="${M81_APP_PORT:-3102}"
SERVER_PID="${M81_SERVER_PID:-}"
WORKDIR="${M81_WORKDIR:-}"
failures=()

case "$PHASE" in
  inventory|final|all) ;;
  *) echo "cleanup=failed unknown_phase:$PHASE"; exit 1 ;;
esac

# Container, container-id and port checks run in BOTH phases: the final phase must
# independently re-verify released ports and an absent container after the exchange.
container_present=no
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
  container_present=yes
fi
[ "$container_present" = "no" ] || failures+=("container_survives:$CONTAINER")

if [ -n "$CREATED_ID" ] && docker inspect "$CREATED_ID" >/dev/null 2>&1; then
  failures+=("container_id_survives")
fi

for port in "$HOST_PORT" "$APP_PORT"; do
  if (exec 3<>/dev/tcp/127.0.0.1/"$port") 2>/dev/null; then
    failures+=("port_still_listening:$port")
  fi
done

# The Next.js process must be gone even if its port happens to be free.
if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  failures+=("server_process_survives")
fi

if [ "$PHASE" = "inventory" ] || [ "$PHASE" = "all" ]; then
  if [ -n "$INVENTORY_DIR" ] && [ "$INVENTORY_DIR" != "-" ] && [ -d "$INVENTORY_DIR" ]; then
    compare() {
      local kind="$1" file="$2" current missing added
      current="$(mktemp)"
      case "$kind" in
        containers) docker ps -a --format '{{.Names}}' | sort > "$current" ;;
        volumes) docker volume ls -q | sort > "$current" ;;
        networks) docker network ls --format '{{.Name}}' | sort > "$current" ;;
        images) docker images --format '{{.Repository}}:{{.Tag}}' | sort > "$current" ;;
      esac
      missing="$(comm -23 "$file" "$current" | tr '\n' ',' || true)"
      added="$(comm -13 "$file" "$current" | tr '\n' ',' || true)"
      rm -f "$current"
      [ -z "$missing" ] || failures+=("preexisting_${kind}_missing:${missing}")
      [ -z "$added" ] || failures+=("new_${kind}_added:${added}")
    }
    for pair in "containers:containers.before" "volumes:volumes.before" "networks:networks.before" "images:images.before"; do
      kind="${pair%%:*}"; file="${pair#*:}"
      if [ -f "$INVENTORY_DIR/$file" ]; then
        compare "$kind" "$INVENTORY_DIR/$file"
      else
        failures+=("inventory_missing:$file")
      fi
    done
  else
    failures+=("inventory_missing")
  fi
fi

if [ "$PHASE" = "final" ] || [ "$PHASE" = "all" ]; then
  if [ -z "$WORKDIR" ]; then
    failures+=("workdir_unverifiable")
  elif [ -d "$WORKDIR" ]; then
    failures+=("workdir_survives")
  fi
fi

if [ "${#failures[@]}" -eq 0 ]; then
  echo "cleanup=ok phase=$PHASE"
  exit 0
fi
printf 'cleanup=failed phase=%s %s\n' "$PHASE" "${failures[*]}"
exit 1
