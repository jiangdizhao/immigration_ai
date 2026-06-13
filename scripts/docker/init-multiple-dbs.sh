#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<'EOSQL'
SELECT 'CREATE DATABASE chatbot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'chatbot')\gexec

SELECT 'CREATE DATABASE immigration_legal'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'immigration_legal')\gexec
EOSQL

for db in chatbot immigration_legal; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS vector;
EOSQL
done

echo "Phase 1B PostgreSQL databases initialized."
