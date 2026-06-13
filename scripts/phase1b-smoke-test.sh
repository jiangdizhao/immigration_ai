#!/usr/bin/env bash
set -euo pipefail

LEGAL_URL="${LEGAL_SERVICE_URL:-http://127.0.0.1:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
API_KEY="${LEGAL_SERVICE_API_KEY:-local-phase1b-dev-key}"

wait_for_http() {
  local name="$1"
  local url="$2"
  local tries="${3:-60}"
  local i=1
  while [ "$i" -le "$tries" ]; do
    if curl -s -o /dev/null -w '%{http_code}' "$url" | grep -Eq '^(200|307|308|401|404)$'; then
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  echo "Timed out waiting for $name at $url"
  return 1
}

wait_for_http "legal-service" "$LEGAL_URL/docs" 60
wait_for_http "chatbot" "$FRONTEND_URL/ai-workspace" 60

printf 'Checking backend query rejects missing API key...
'
NO_KEY_STATUS=$(curl -s -o /tmp/phase1b_no_key.json -w '%{http_code}' -X POST "$LEGAL_URL/api/v1/query"   -H 'Content-Type: application/json'   -d '{"question":"hello"}')
if [ "$NO_KEY_STATUS" != "401" ]; then
  echo "Expected 401 without API key, got $NO_KEY_STATUS"
  cat /tmp/phase1b_no_key.json || true
  exit 1
fi

printf 'Checking backend review conversations endpoint accepts API key...
'
REVIEW_STATUS=$(curl -s -o /tmp/phase1b_review.json -w '%{http_code}'   -H "X-API-Key: $API_KEY"   "$LEGAL_URL/api/v1/review/conversations?status=all&limit=1")
if [ "$REVIEW_STATUS" != "200" ]; then
  echo "Expected review endpoint 200 with API key, got $REVIEW_STATUS"
  cat /tmp/phase1b_review.json || true
  exit 1
fi

printf 'Checking frontend /ping...
'
FRONTEND_STATUS=$(curl -s -o /tmp/phase1_frontend.html -w '%{http_code}' "$FRONTEND_URL/ping")
if [ "$FRONTEND_STATUS" != "200" ]; then
  echo "Expected frontend /ping 200, got $FRONTEND_STATUS"
  exit 1
fi

printf 'Checking Valkey container...
'
if docker compose -f docker-compose.phase1b.yml exec -T phase1b-valkey valkey-cli ping | grep -q PONG; then
  echo "Valkey responds."
else
  echo "Valkey did not respond."
  exit 1
fi

if [ "${RUN_LLM_SMOKE:-0}" = "1" ]; then
  printf 'Running optional LLM query smoke test...
'
  QUERY_STATUS=$(curl -s -o /tmp/phase1b_query.json -w '%{http_code}' -X POST "$LEGAL_URL/api/v1/query"     -H 'Content-Type: application/json'     -H "X-API-Key: $API_KEY"     -d '{"question":"My student visa was refused. What should I do next?","session_id":"phase1b-smoke-test"}')
  if [ "$QUERY_STATUS" != "200" ]; then
    echo "Expected query endpoint 200 with API key, got $QUERY_STATUS"
    cat /tmp/phase1b_query.json || true
    exit 1
  fi
fi

echo 'Phase 1B container smoke test passed.'
