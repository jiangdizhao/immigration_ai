#!/usr/bin/env bash
set -euo pipefail

# Import a legal seed dump into the Phase 1B container legal DB.
# Usage:
#   ./scripts/phase1c-import-legal-seed-to-container.sh artifacts/phase1c/legal_seed/legal_seed_YYYY.dump

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <legal_seed.dump>"
  exit 2
fi

DUMP_FILE="$1"
TARGET_LEGAL_DB_URL="${TARGET_LEGAL_DB_URL:-postgresql://immigration_local:local_phase1b_password@127.0.0.1:5433/immigration_legal}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 2
fi

echo "Importing legal seed into: $TARGET_LEGAL_DB_URL"
echo "Dump: $DUMP_FILE"

psql "$TARGET_LEGAL_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE TABLE public.source_chunks, public.legal_sources, public.cases RESTART IDENTITY CASCADE;
SQL

pg_restore \
  --data-only \
  --no-owner \
  --no-acl \
  --dbname="$TARGET_LEGAL_DB_URL" \
  "$DUMP_FILE"

psql "$TARGET_LEGAL_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'legal_sources' AS table_name, count(*) AS rows FROM public.legal_sources
UNION ALL
SELECT 'source_chunks' AS table_name, count(*) AS rows FROM public.source_chunks
UNION ALL
SELECT 'cases' AS table_name, count(*) AS rows FROM public.cases
ORDER BY table_name;
SQL

echo "Legal seed import completed."
