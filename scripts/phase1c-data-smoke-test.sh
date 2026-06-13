#!/usr/bin/env bash
set -euo pipefail

LEGAL_DB_URL="${LEGAL_DB_URL:-postgresql://immigration_local:local_phase1b_password@127.0.0.1:5433/immigration_legal}"
CHATBOT_DB_URL="${CHATBOT_DB_URL:-postgresql://immigration_local:local_phase1b_password@127.0.0.1:5433/chatbot}"
LEGAL_SERVICE_CONTAINER="${LEGAL_SERVICE_CONTAINER:-phase1b-legal-service}"
MIN_LEGAL_SOURCES="${MIN_LEGAL_SOURCES:-1}"
MIN_SOURCE_CHUNKS="${MIN_SOURCE_CHUNKS:-1}"

printf 'Checking pgvector extension...\n'
psql "$LEGAL_DB_URL" -v ON_ERROR_STOP=1 -At -c "SELECT extname FROM pg_extension WHERE extname='vector';" | grep -q '^vector$'

printf 'Checking legal seed row counts...\n'
LEGAL_SOURCES=$(psql "$LEGAL_DB_URL" -At -c 'SELECT count(*) FROM public.legal_sources;')
SOURCE_CHUNKS=$(psql "$LEGAL_DB_URL" -At -c 'SELECT count(*) FROM public.source_chunks;')
CASES=$(psql "$LEGAL_DB_URL" -At -c 'SELECT count(*) FROM public.cases;')

echo "legal_sources=$LEGAL_SOURCES"
echo "source_chunks=$SOURCE_CHUNKS"
echo "cases=$CASES"

if [ "$LEGAL_SOURCES" -lt "$MIN_LEGAL_SOURCES" ]; then
  echo "Expected at least $MIN_LEGAL_SOURCES legal_sources rows."
  exit 1
fi
if [ "$SOURCE_CHUNKS" -lt "$MIN_SOURCE_CHUNKS" ]; then
  echo "Expected at least $MIN_SOURCE_CHUNKS source_chunks rows."
  exit 1
fi

printf 'Checking chatbot ImmigrationConversation table...\n'
psql "$CHATBOT_DB_URL" -v ON_ERROR_STOP=1 -At -c 'SELECT to_regclass('\''public."ImmigrationConversation"'\'');' | grep -q 'ImmigrationConversation'

printf 'Checking Schedule index rebuild inside legal-service container...\n'
docker compose -f docker-compose.phase1b.yml exec -T "$LEGAL_SERVICE_CONTAINER" python -m scripts.build_schedule_index_from_db

printf 'Checking Schedule index smoke commands if present...\n'
if docker compose -f docker-compose.phase1b.yml exec -T "$LEGAL_SERVICE_CONTAINER" test -f scripts/smoke_schedule_index_from_db.py; then
  docker compose -f docker-compose.phase1b.yml exec -T "$LEGAL_SERVICE_CONTAINER" python -m scripts.smoke_schedule_index_from_db
fi
if docker compose -f docker-compose.phase1b.yml exec -T "$LEGAL_SERVICE_CONTAINER" test -f scripts/smoke_schedule2_candidates.py; then
  docker compose -f docker-compose.phase1b.yml exec -T "$LEGAL_SERVICE_CONTAINER" python -m scripts.smoke_schedule2_candidates
fi

echo 'Phase 1C data smoke test passed.'
