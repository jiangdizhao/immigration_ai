#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is not available. Install Docker with Compose v2 first."
  exit 1
fi

if [ ! -f .env.phase1b.legal-service.local ]; then
  cp .env.phase1b.legal-service.example .env.phase1b.legal-service.local
  echo "Created .env.phase1b.legal-service.local from example."
fi

if [ ! -f .env.phase1b.chatbot.local ]; then
  cp .env.phase1b.chatbot.example .env.phase1b.chatbot.local
  echo "Created .env.phase1b.chatbot.local from example."
fi

if grep -q "replace-locally-only" .env.phase1b.legal-service.local; then
  echo "WARNING: OPENAI_API_KEY is still a placeholder in .env.phase1b.legal-service.local."
  echo "The containers can start, but real chatbot queries will fail until you set it."
fi

docker compose -f docker-compose.phase1b.yml up --build
