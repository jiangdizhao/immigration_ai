#!/usr/bin/env bash
set -euo pipefail

# Restore Phase 1B container DB backups.
# Usage:
#   ./scripts/phase1c-restore-container-dbs.sh artifacts/phase1c/backups/YYYYMMDD_HHMMSS

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <backup_dir>"
  exit 2
fi

BACKUP_DIR="$1"
LEGAL_DUMP="$BACKUP_DIR/legal_service.dump"
CHATBOT_DUMP="$BACKUP_DIR/chatbot.dump"
LEGAL_DB_URL="${LEGAL_DB_URL:-postgresql://immigration_local:local_phase1b_password@127.0.0.1:5433/immigration_legal}"
CHATBOT_DB_URL="${CHATBOT_DB_URL:-postgresql://immigration_local:local_phase1b_password@127.0.0.1:5433/chatbot}"

if [ ! -f "$LEGAL_DUMP" ] || [ ! -f "$CHATBOT_DUMP" ]; then
  echo "Expected dumps not found in: $BACKUP_DIR"
  echo "Need: legal_service.dump and chatbot.dump"
  exit 2
fi

echo "Restoring legal-service DB from: $LEGAL_DUMP"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$LEGAL_DB_URL" "$LEGAL_DUMP"

echo "Restoring chatbot DB from: $CHATBOT_DUMP"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$CHATBOT_DB_URL" "$CHATBOT_DUMP"

echo "Container DB restore completed."
