#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${OUT_DIR:-artifacts/phase1c/backups/$(date +%Y%m%d_%H%M%S)}"
LEGAL_DB_URL="${LEGAL_DB_URL:-postgresql://immigration_local:local_phase1b_password@127.0.0.1:5433/immigration_legal}"
CHATBOT_DB_URL="${CHATBOT_DB_URL:-postgresql://immigration_local:local_phase1b_password@127.0.0.1:5433/chatbot}"

mkdir -p "$OUT_DIR"

echo "Backing up Phase 1B container DBs to: $OUT_DIR"

pg_dump --format=custom --no-owner --no-acl --file="$OUT_DIR/legal_service.dump" "$LEGAL_DB_URL"
pg_dump --format=custom --no-owner --no-acl --file="$OUT_DIR/chatbot.dump" "$CHATBOT_DB_URL"

cat > "$OUT_DIR/manifest.txt" <<EOF
created_at=$(date -Iseconds)
legal_db=$LEGAL_DB_URL
chatbot_db=$CHATBOT_DB_URL
files=legal_service.dump,chatbot.dump
EOF

printf 'Container DB backups written to:\n  %s\n' "$OUT_DIR"
