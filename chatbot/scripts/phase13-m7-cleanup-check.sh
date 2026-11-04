#!/usr/bin/env bash
# Phase 13 M7 - independent cleanup verification (read-only, never destructive).
#
# Verifies that a finished M7 acceptance run left nothing behind and that every
# pre-existing Docker resource is still intact. Exit 0 = cleanup verified,
# exit 1 = a survivor was found.
#
# Usage:  phase13-m7-cleanup-check.sh <inventory-dir>
# Environment:
#   M7_CONTAINER   container name expected to be absent
#   M7_CREATED_ID  container id created by this run (may be empty)
#   M7_HOST_PORT   host port that must be released
#   M7_WORKDIR     temporary run directory that must be gone

set -Eeuo pipefail

INVENTORY_DIR="${1:-}"
CONTAINER="${M7_CONTAINER:-phase13-m7-pg}"
CREATED_ID="${M7_CREATED_ID:-}"
HOST_PORT="${M7_HOST_PORT:-55451}"
WORKDIR="${M7_WORKDIR:-}"
failures=()

container_present=no
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
  container_present=yes
fi
id_present=no
if [ -n "$CREATED_ID" ] && docker inspect "$CREATED_ID" >/dev/null 2>&1; then
  id_present=yes
fi
[ "$container_present" = "no" ] || failures+=("container_survives:$CONTAINER")
[ "$id_present" = "no" ] || failures+=("container_id_survives")

port_open=no
if (exec 3<>/dev/tcp/127.0.0.1/"$HOST_PORT") 2>/dev/null; then port_open=yes; fi
[ "$port_open" = "no" ] || failures+=("port_still_listening:$HOST_PORT")

if [ -n "$WORKDIR" ] && [ -d "$WORKDIR" ]; then
  failures+=("workdir_survives")
fi

if [ -n "$INVENTORY_DIR" ] && [ -d "$INVENTORY_DIR" ]; then
  compare() {
    local kind="$1" file="$2" current missing added
    current="$(mktemp)"
    case "$kind" in
      containers) docker ps -a --format '{{.Names}}' | sort > "$current" ;;
      volumes) docker volume ls -q | sort > "$current" ;;
      networks) docker network ls --format '{{.Name}}' | sort > "$current" ;;
      images) docker images --format '{{.Repository}}:{{.Tag}}' | sort > "$current" ;;
    esac
    # Anything present before the run must still exist afterwards, and nothing new
    # may remain. Both comparisons happen before the temporary file is removed.
    missing="$(comm -23 "$file" "$current" | tr '\n' ',' || true)"
    added="$(comm -13 "$file" "$current" | tr '\n' ',' || true)"
    rm -f "$current"
    [ -z "$missing" ] || failures+=("preexisting_${kind}_missing:${missing}")
    [ -z "$added" ] || failures+=("new_${kind}_added:${added}")
  }
  for pair in "containers:containers.before" "volumes:volumes.before" "networks:networks.before" "images:images.before"; do
    kind="${pair%%:*}"; file="${pair#*:}"
    [ -f "$INVENTORY_DIR/$file" ] && compare "$kind" "$INVENTORY_DIR/$file"
  done
else
  failures+=("inventory_missing")
fi

if [ "${#failures[@]}" -eq 0 ]; then
  echo "cleanup=ok"
  exit 0
fi
printf 'cleanup=failed %s\n' "${failures[*]}"
exit 1
