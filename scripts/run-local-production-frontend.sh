#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../chatbot"

pnpm prod:prepare
pnpm prod:start
