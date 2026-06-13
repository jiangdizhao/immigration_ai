#!/usr/bin/env bash
set -euo pipefail

# Export legal knowledge seed data from the normal local legal-service database.
# Default source matches Rico's confirmed local DB:
#   psql -h localhost -U rico_local -d immigration_legal

SOURCE_LEGAL_DB_URL="${SOURCE_LEGAL_DB_URL:-postgresql://rico_local@localhost:5432/immigration_legal}"
OUT_DIR="${OUT_DIR:-artifacts/phase1c/legal_seed}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$OUT_DIR/legal_seed_${STAMP}.dump"

mkdir -p "$OUT_DIR"

echo "Exporting legal seed tables from: $SOURCE_LEGAL_DB_URL"
echo "Tables: legal_sources, source_chunks, cases"

pg_dump \
  --format=custom \
  --data-only \
  --no-owner \
  --no-acl \
  --table=public.legal_sources \
  --table=public.source_chunks \
  --table=public.cases \
  --file="$OUT_FILE" \
  "$SOURCE_LEGAL_DB_URL"

cat > "$OUT_FILE.manifest.txt" <<EOF
created_at=$(date -Iseconds)
source_db=$SOURCE_LEGAL_DB_URL
tables=public.legal_sources,public.source_chunks,public.cases
format=pg_dump custom data-only
EOF

printf 'Legal seed export written to:\n  %s\n' "$OUT_FILE"
