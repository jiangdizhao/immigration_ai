#!/usr/bin/env bash
set -euo pipefail

LEGAL_URL="${LEGAL_SERVICE_URL:-http://127.0.0.1:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
API_KEY="${LEGAL_SERVICE_API_KEY:-dev-legal-key}"

printf 'Checking backend query rejects missing API key...
'
NO_KEY_STATUS=$(curl -s -o /tmp/phase1_no_key.json -w '%{http_code}' -X POST "$LEGAL_URL/api/v1/query"   -H 'Content-Type: application/json'   -d '{"question":"hello"}')
if [ "$NO_KEY_STATUS" != "401" ]; then
  echo "Expected 401 without API key, got $NO_KEY_STATUS"
  cat /tmp/phase1_no_key.json || true
  exit 1
fi

printf 'Checking backend query accepts API key...
'
WITH_KEY_STATUS=$(curl -s -o /tmp/phase1_with_key.json -w '%{http_code}' -X POST "$LEGAL_URL/api/v1/query"   -H 'Content-Type: application/json'   -H "X-API-Key: $API_KEY"   -d '{"question":"hello","session_id":"phase1-smoke-test"}')
if [ "$WITH_KEY_STATUS" != "200" ]; then
  echo "Expected 200 with API key, got $WITH_KEY_STATUS"
  cat /tmp/phase1_with_key.json || true
  exit 1
fi

printf 'Checking frontend /ai-workspace...
'
FRONTEND_STATUS=$(curl -s -o /tmp/phase1_frontend.html -w '%{http_code}' "$FRONTEND_URL/ai-workspace")
if [ "$FRONTEND_STATUS" != "200" ]; then
  echo "Expected frontend 200, got $FRONTEND_STATUS"
  exit 1
fi

echo 'Phase 1 smoke test passed.'
