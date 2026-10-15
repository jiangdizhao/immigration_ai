# Emergency Document Processing Hotfix — Validation and Performance

**Date:** 2026-10-16
**Repository:** `jiangdizhao/immigration_ai`
**Branch:** `hotfix/document-processing-reliability-20261016`
**Base:** `audit/document-processing-all-formats-20261016` at `edc593fb8317d56f3aa7a94a3c322abf61703b2b`
**Scope:** minimal parser runtime/error handling correction, production-image regression gate, and synthetic performance evidence. No AWS deployment or customer data access.

## Incident and root cause

The prior all-format audit built a local production standalone image and parsed a valid synthetic PDF with the compiled parser Worker. PDF.js attempted to import `pdf.worker.mjs`, which was absent from the standalone runtime. The same fixture worked in the host install. The production-image failure was therefore a packaging/runtime dependency failure, not malformed PDF content. The old PDF catch path rewrote that dependency exception to `malformed_document`; the processing service then surfaced it as an HTTP 409 state conflict.

The fix adds the PDF.js worker module to Next.js output tracing for the document-processing API route. The PDF parser now reserves `malformed_document` for PDF.js invalid, password, and format exceptions, maps missing runtime modules to `parser_dependency_unavailable`, and classifies other unexpected parser exceptions as `parser_worker_failed`. Processing failures use a safe structured error class: malformed/unsupported/limit failures map to 422, parser and storage/persistence failures to 503, and processing timeout to 504. A failed run remains eligible for the existing explicit `retryFailed` path. No data model or migration changed.

## Validation

- The pre-fix base image `immigration-ai-document-processing-base:20261016` reproduced the PDF failure on a valid synthetic fixture. The corrected classifier reported `parser_dependency_unavailable`; the other 10 formats passed in that image.
- `pnpm prod:verify-document-processing` built the final production Docker image and passed the 11-format smoke gate. The image was `linux/amd64`, Node `v22.23.3`, PDF.js `6.3.289`, canvas `1.0.9`, local image ID `sha256:e3d9475cf4dbcad35c63c1001ff6c9d97d31400776783c7bc38d7f4a11f63cdb`.
- A 20-iteration benchmark ran each of the 11 supported formats at small, medium and large synthetic fixture tiers inside that final image. All 33 format/tier combinations passed and produced expected evidence markers.
- `verify-native-runtime.mjs` passed in the final image after extracting `NATIVE RUNTIME PDF EXTRACTION` through the compiled Worker.
- The document upload-to-evidence regression passed for PDF, DOCX, TXT, XLSX and PNG. It exercises handler validation, synthetic object storage, real native parser Worker execution, in-memory evidence persistence, bounded conversation evidence retrieval, and a mocked Fast transport. The image Vision adapter is synthetic; no AI provider call was made.
- Focused document tests: 11 files passed, 0 failed, 0 skipped. The changed native-runtime verifier test passed (1/1) with a name filter, avoiding unrelated security test campaigns.
- Changed-file Biome check: 15 source/test/script files passed. Final `git diff --check` passed.
- `pnpm exec tsc --noEmit --pretty false --incremental false` exited 2 with 44 diagnostics, matching the existing audit baseline. No diagnostics were reported in changed implementation, runtime verifier, or the new upload-to-evidence test. Two existing diagnostics are in unchanged helper assertions in the modified `processing.test.ts`: a comparison with `"deleted"` and `run?.id`. The final production Docker build's TypeScript stage passed.

## Production-image latency benchmark

Values below are wall-clock processing time per iteration, `p50/p95` in milliseconds, `n=20`. Baseline values are from the pre-fix base image and use the same synthetic tier design and local Node 22 Linux x64 runtime. For the baseline PDF, all 20 attempts failed before extraction, so there is no latency result. The corrected image reports PDF extraction successfully. JPEG/PNG use a deterministic mock Vision adapter and do not measure model latency.

| Format | Baseline small | Fixed small | Fixed medium | Fixed large |
|---|---:|---:|---:|---:|
| PDF | 0/20 passed (`malformed_document`) | 126.6/129.9 | 139.5/143.3 | 166.2/177.2 |
| JPEG | 0.0/0.1 | 0.0/0.2 | 0.0/0.0 | 0.0/0.0 |
| PNG | 0.0/0.0 | 0.0/0.0 | 0.0/0.0 | 0.0/0.0 |
| DOCX | 74.1/75.9 | 73.7/76.4 | 75.2/77.2 | 83.8/86.8 |
| DOC | 72.0/73.9 | 71.8/75.5 | 71.0/75.6 | 74.0/84.4 |
| TXT | 69.0/70.9 | 71.7/77.8 | 69.3/74.1 | 71.8/78.8 |
| Markdown | 69.1/70.7 | 74.5/79.8 | 69.8/74.6 | 71.0/74.1 |
| JSON | 70.1/71.9 | 73.5/78.1 | 72.1/76.7 | 78.5/82.2 |
| CSV | 70.3/70.8 | 73.3/77.9 | 71.5/76.4 | 74.8/80.1 |
| XLSX | 77.8/78.8 | 78.5/84.9 | 83.4/85.9 | 119.2/122.7 |
| XLS | 72.7/74.7 | 72.4/81.0 | 79.2/82.9 | 105.2/112.0 |

The non-PDF small-fixture p50 range is 69–79 ms on both images. Individual p95 values shifted by a few milliseconds; there is no consistent large increase across the native formats. Worker initialization accounts for roughly 68–73 ms p50 on most native formats. Extraction time is below 1 ms for the small text formats and rises with larger PDF/spreadsheet inputs. The benchmark shows the corrected PDF path adding working extraction at approximately 127 ms p50 for the small fixture.

## Upload and evidence stage timings

A separate single-sample run of the full synthetic upload-to-evidence test recorded the following stage durations. Runtime was host Node `v24.14.0` Linux x64; repositories and object storage were in-memory, and Vision/Fast transport were mocked. These measurements check stage instrumentation and relative local cost only. They are not AWS, PostgreSQL, S3, network, or provider latency estimates.

| Format | Upload handler (ms) | Storage put (ms) | Processing request (ms) | Evidence persistence (ms) | Evidence retrieval/packet (ms) |
|---|---:|---:|---:|---:|---:|
| PDF | 16.061 | 0.003 | 459.173 | 0.017 | 0.400 |
| DOCX | 3.348 | 0.003 | 87.472 | 0.008 | 0.093 |
| TXT | 0.583 | 0.001 | 76.590 | 0.007 | 0.140 |
| XLSX | 1.624 | 0.003 | 86.342 | 0.010 | 0.092 |
| PNG | 0.564 | 0.002 | 0.535 | 0.006 | 0.212 |

The PDF processing-request figure includes cold parser runtime/Worker setup under host Node 24; it is intentionally not compared with the production-image n=20 numbers above. PNG processing uses the synthetic Vision adapter and has no OCR/model latency.

## Boundaries and remaining risks

- The production runtime was validated in a local `linux/amd64` image. The deployed ECS task definition `:46`, its exact image digest, and its runtime platform were not inspected; Staging behavior remains unverified.
- No customer documents, customer accounts, AWS resources, database, Stripe settings, payment records, or live AI calls were accessed or changed.
- Malware-scanner/security-state behavior was outside the implementation and validation scope of this hotfix.
- Benchmark fixtures are synthetic and bounded; they do not establish latency for arbitrary customer files or live Vision requests.
- No database migration was needed. No deployment was performed. Stop after pushing the branch for external review.
