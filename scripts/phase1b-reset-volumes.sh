#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "This will delete the Phase 1B PostgreSQL and Valkey Docker volumes."
read -r -p "Type DELETE to continue: " answer
if [ "$answer" != "DELETE" ]; then
  echo "Cancelled."
  exit 0
fi

docker compose -f docker-compose.phase1b.yml down -v
echo "Phase 1B Docker volumes removed."
