#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../legal-service"

python -m scripts.apply_phase0_schema
APP_ENV=production AUTO_CREATE_SCHEMA=false python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
