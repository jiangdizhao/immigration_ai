#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../chatbot"
pnpm build
pnpm start
