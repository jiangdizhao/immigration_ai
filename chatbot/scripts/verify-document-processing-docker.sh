#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image_tag="${DOCUMENT_PROCESSING_IMAGE_TAG:-immigration-ai-document-processing-verify:local}"
platform="${DOCUMENT_PROCESSING_IMAGE_PLATFORM:-linux/amd64}"

docker build \
  --platform "$platform" \
  -f "$repo_root/chatbot/Dockerfile.production" \
  -t "$image_tag" \
  "$repo_root"

docker run --rm \
  --entrypoint node \
  -e DOCUMENT_PROCESSING_BENCHMARK \
  -e DOCUMENT_PROCESSING_BASELINE \
  -e DOCUMENT_PROCESSING_RUNS \
  "$image_tag" \
  /app/scripts/verify-document-processing-runtime.mjs
