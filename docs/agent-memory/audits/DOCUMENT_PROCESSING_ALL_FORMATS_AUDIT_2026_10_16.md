# Phase 12 — Comprehensive Document Processing Audit

**Date:** 2026-10-16
**Repository:** `jiangdizhao/immigration_ai`
**Base:** `hotfix/vip-payment-universal-document-analysis-20261015` at `c0f10c9ddb73b451552cb8ec59fe8171293d3ed6`
**Investigation branch:** `audit/document-processing-all-formats-20261016`
**Scope:** investigation and documentation only. No application fix, migration, production data change, AI request, AWS mutation, deployment, or Stripe operation was performed.

## Executive summary

The audit reproduced a production-runtime PDF failure in a locally built `Dockerfile.production` image. The image contains PDF.js `pdf.mjs`, but omits its dynamically loaded `pdf.worker.mjs`. Calling PDF.js on a valid synthetic PDF inside the image fails before document parsing with `Setting up fake worker failed: Cannot find module ... pdf.worker.mjs`. The compiled parser worker converts that exception to `malformed_document`, and the processing service persists the run as failed before the route maps the exception to HTTP 409. The host development install has the missing package file, so both direct PDF parsing and `runParserWorker()` pass there. This is a high-confidence explanation for the reported PDF symptoms, although the customer PDFs and deployed `:46` image were not inspected.

The PDF packaging fault is format-specific: in the same local production image, DOCX, DOC, TXT, Markdown, JSON, CSV, XLSX, and XLS each extracted evidence through the compiled worker. JPEG and PNG correctly returned `needs_review` / `vision_unavailable` in direct tests without a vision provider; those formats do not use the parser worker. Production Docker image extraction for images was not exercised.

A separate, higher-severity cross-format security-state defect is visible in the upload path. Upload completion changes `securityStatus` from `pending` to `clean` when it marks storage `stored`, while GuardDuty reconciliation only transitions records whose status is still `pending`. The processing service gates on `clean`, so processing can start before a scanner verdict. A GuardDuty verdict arriving before that storage transition can also be overwritten by the unconditional `stored` transition. Therefore the public `clean` state is not evidence, by itself, that GuardDuty approved an object. This affects every advertised format. Production GuardDuty/S3 configuration could not be verified with the available AWS permissions.

The existing error path also hides root cause: `extractPdfInternal()` catches every non-limit PDF.js error as `malformed_document`; `createMatterDocumentProcessingService()` records the error but returns `ProcessingConflictError`, which the endpoint maps to 409. An infrastructure failure therefore looks like a customer-file/state conflict. No raw document content needs to be logged to correct the classification.

**Validation outcome:** all 11 synthetic valid fixtures passed server-side validation; direct parsing passed for nine native formats and returned the expected vision-unavailable degraded state for two images. All nine worker-supported formats passed `runParserWorker()` on the host. In the local production Docker image, eight non-PDF worker formats passed and PDF failed as described. Focused unit coverage passed 124/124 tests when run with child-process spawning available; the sandbox-only invocation initially had one GuardDuty self-test blocked by `spawnSync` `EPERM`, then passed on the outside-sandbox rerun. The local production Docker build and its native-runtime verifier passed. `pnpm exec tsc --noEmit` still reports 44 diagnostics in existing test files; the Docker production `pnpm build` TypeScript/build stages passed. Changed audit scope is documentation only.

## Evidence basis and limits

- The checked source was the clean expected base HEAD. Synthetic fixtures were generated locally; the existing `fixtures/legacy-sample.doc` was used for DOC and SheetJS BIFF8 output for XLS. No customer file was downloaded or copied.
- The PDF fixture was a valid one-page synthetic PDF. `pdftotext` independently extracted its marker text. It passed host PDF.js and host worker parsing but failed in the production image before file parsing because the PDF.js worker module was absent.
- A local `linux/amd64` image was built from the checked repository with Node 22.23.3. Its architecture matches the local host; the ECS `runtimePlatform` could not be independently established, so an AWS architecture match is **not verified**.
- Read-only `DescribeTaskDefinition` for `immigration-ai-staging-web:46` returned AWS `ClientException: Unable to describe task definition`. Read-only ECR `BatchGetImage` for the supplied digest was denied because the available principal had no cross-account repository resource-policy permission. The deployed digest was not pulled or inspected.
- There was no access to the reported customer PDFs, deployed CloudWatch records, live S3, or staging database. No live AI/vision call was made. Production deployment behavior beyond the supplied owner-reported `:46` reference remains unverified.

## Pipeline architecture and shared dependencies

| Stage | Source / key function | Contract and observed failure surface |
|---|---|---|
| File selection | `chatbot/components/matter-documents-panel.tsx`, `ACCEPT`, `upload()` | Advertises all 11 extensions; sends a single `File` as the request body with browser MIME or extension fallback and `X-Original-Filename`. Upload success is distinct from later processing. |
| HTTP access and request | `chatbot/app/api/matter-documents/route.ts`, `chatbot/lib/matter-documents/http.ts`; processing route at `app/api/matter-documents/[documentId]/processing/route.ts` | Requires authenticated registered `regular` account with `user`, `lawyer`, or `admin` role; validates conversation/document UUID and limits upload body to 25 MiB. Processing route validates retry flags and maps state conflicts to 409. |
| Content validation | `chatbot/lib/matter-documents/validation.ts`, `validateMatterDocument()` | Normalizes basename/control characters, checks extension/MIME family and size, then validates PDF/image signature, OOXML container, OLE stream identity, UTF-8 controls, or JSON syntax. Several formats deliberately defer deeper validity to the parser: PDF/JPEG/PNG signatures and CSV UTF-8 validation are not full decoders. |
| Record and object storage | `chatbot/lib/matter-documents/service.ts`, `chatbot/lib/matter-documents/storage.ts`, `chatbot/lib/db/queries.ts` | Confirms conversation ownership, stores canonical MIME, size and SHA-256 in an `uploading` intent, writes S3 with content length, SHA-256 checksum and AES256 server-side encryption, then changes storage to `stored`. S3 upload/read and database writes were not exercised against AWS or PostgreSQL. |
| Malware/security state | `chatbot/lib/db/queries.ts:transitionMatterDocumentStorageStatus()`, `security-reconciliation.ts`, `guardduty-sqs-reconciler.ts` | The upload storage transition sets `securityStatus: "clean"` when `next === "stored"`. GuardDuty reconciliation only accepts `pending` and its queue handler does not acknowledge conflicting outcomes. This creates an ordering-independent risk that a scan verdict is bypassed or overwritten. |
| Processing claim and integrity | `chatbot/lib/matter-documents/processing/service.ts`, `beginMatterDocumentProcessing()` | Requires owner match, `stored`, `clean`, not deleted; claims `processing` and a run, fetches from S3, then verifies stored byte count and SHA-256 before parsing. DB claim/finalize are transactional. |
| Isolated parser worker | `processing/parser-worker.ts`, `parser-worker-entry.ts`, `scripts/build-document-parser-worker.mjs` | Node worker thread gets a fresh environment, bounded worker memory/stack and timeout, structured-clones bytes/results, validates worker output, and reports safe error codes. PDF.js and canvas are external dependencies in the worker bundle; Office/text parsers are bundled. |
| Format parsing | `processing/pdf.ts`, `office.ts`, `text.ts`, `vision.ts` | PDF, Office and text use the worker in production. JPEG/PNG use `extractImage()` in the parent process and need configured vision to emit text. PDF catches non-limit parser/runtime exceptions as `malformed_document`. |
| Run/evidence persistence | `processing/service.ts`, database processing queries | Successful terminal parser results store run status, error code, unit count and evidence atomically. Any terminal parser result leaves the document-level `processingStatus` as `complete`; its run status (`complete`, `partial`, `needs_review`) carries the extraction outcome. Exceptions set run and document state to `failed`; no partial units from a thrown parse are finalized. |
| Failure response and retry | Processing API route and `MatterDocumentProcessingService.process()` | Parser exceptions are persisted under a safe error code, then thrown as `ProcessingConflictError` and surfaced as HTTP 409. Failed runs are explicitly retryable with `retryFailed`; partial/needs-review runs may be reprocessed; stale processing has a separate recovery flag. The UI exposes retry for failed runs and reprocess for incomplete runs. |
| AI evidence and acknowledgement | `ai-evidence.ts`, `ai-evidence-packet.ts`, `customer-document-provenance.ts`, widget routes | Server resolves documents by authenticated `userId + chatId`, stored/clean/not-deleted status, latest terminal run, and nonempty units. The bounded packet carries at most 8 docs, 64 units, and 64,000 text characters total. Fast, Legal Check and Premium route payloads receive request-scoped evidence; acknowledged IDs must match that turn's manifest and a preserved answer before usage is recorded. These mechanisms have unit coverage, not a live AI acceptance in this audit. |

### State and error semantics

- Upload begins `storageStatus=uploading`, `processingStatus=not_started`, `securityStatus=pending`. Object-write failure attempts cleanup and leaves storage failure/recovery state rather than returning a stored record.
- Processing transitions `not_started` (or eligible retry/incomplete/stale recovery) → `processing` → terminal. The `MatterDocument` row uses `processingStatus=complete` for all successfully finalized runs, including partial and needs-review; callers must inspect the run status and evidence-unit count to distinguish usable evidence.
- `needs_review` with no image vision is intentional, not parser failure. The image parser returns zero units with `vision_unavailable`; evidence packaging excludes evidence-free runs.
- A genuine parser exception is stored as `failed` with a safe code. The caller nevertheless gets 409 because the service rethrows it as `ProcessingConflictError`; the error is available via the processing summary endpoint. This HTTP status is misleading for a parse/runtime failure.
- Failed source bytes remain in S3 and are explicitly retryable through `retryFailed`; the service rechecks byte size and hash before retry parsing. Reprocessing incomplete runs does not replace prior terminal evidence until the new run finalizes. These retry contracts were source-reviewed and exercised by unit tests only.

## Eleven-format test matrix

`PASS`/`FAIL` refer to executed results. `EXPECTED_DEGRADED` is intentional provider-unavailable behavior. `NOT_TESTED` means no production-container execution was made for that path. Host results used Node v24.14.0 on Linux x64; local Docker results used Node v22.23.3 on Linux x64.

| Format | Valid fixture available? | Validation result | Direct parser result | Compiled Worker result | Production Docker result | Extracted evidence units | Error code, if any | Root-cause category | Confidence | Recommended action |
|---|---|---|---|---|---|---:|---|---|---|---|
| PDF | Yes; one-page synthetic PDF; Poppler extracted marker | PASS | PASS, `complete` | Host PASS; Docker worker FAIL | FAIL in local production build: missing PDF.js `pdf.worker.mjs` | Host 1; Docker 0 | Docker: `malformed_document` | High for container defect; high-likelihood incident cause | Include PDF.js worker module in standalone runtime and add extraction smoke to Docker gate. |
| JPEG | Yes; generated 2×2 JPEG | PASS | EXPECTED_DEGRADED, `needs_review` | N/A by design | NOT_TESTED as a container image-processing call; no worker route | 0 without vision | `vision_unavailable` | High for designed no-provider state | Test no-provider state and fake-provider transcription; separately verify deployed vision config without exposing secrets. |
| PNG | Yes; generated 2×2 PNG | PASS | EXPECTED_DEGRADED, `needs_review` | N/A by design | NOT_TESTED as a container image-processing call; no worker route | 0 without vision | `vision_unavailable` | High for designed no-provider state | Same as JPEG; retain explicit degraded state. |
| DOCX | Yes; OOXML ZIP with content types, root relationship and document XML | PASS | PASS, `complete` | PASS, host | PASS, local production image | 1 | — | High for fixture/runtime smoke | Keep real OOXML valid/malformed cases in production image gate. |
| DOC | Yes; existing valid CFB Word fixture `legacy-sample.doc` | PASS | PASS, `complete` | PASS, host | PASS, local production image | 24 | — | High for fixture/runtime smoke | Keep a genuine legacy CFB DOC fixture; do not substitute signature-only data. |
| TXT | Yes; UTF-8 multi-line text | PASS | PASS, `complete` | PASS, host | PASS, local production image | 2 | — | High for fixture/runtime smoke | Keep encoding/control-character rejection and worker smoke. |
| Markdown | Yes; UTF-8 Markdown | PASS | PASS, `complete` | PASS, host | PASS, local production image | 1 | — | High for fixture/runtime smoke | Keep Markdown on the bounded text path and worker smoke. |
| JSON | Yes; nested valid JSON | PASS | PASS, `complete` | PASS, host | PASS, local production image | 2 | — | High for fixture/runtime smoke | Keep syntax, node-depth and size-bound cases. |
| CSV | Yes; two-row UTF-8 CSV | PASS | PASS, `complete` | PASS, host | PASS, local production image | 1 | — | High for valid fixture; malformed gate noted below | Keep malformed quoted-row parser case; consider whether validation should surface its parser rejection earlier. |
| XLSX | Yes; SheetJS OOXML workbook | PASS | PASS, `complete` | PASS, host | PASS, local production image | 1 | — | High for fixture/runtime smoke | Keep real OOXML ZIP and workbook-bound cases. |
| XLS | Yes; SheetJS BIFF8 workbook | PASS | PASS, `complete` | PASS, host | PASS, local production image | 1 | — | High for valid fixture; parser-only invalid-input behavior noted below | Retain genuine BIFF8 fixture and test validation plus parser together. |

### Malformed-input observations

- Malformed DOCX, DOC, TXT, Markdown, JSON, XLSX and XLS samples were rejected by upload validation. Their direct parsers/workers rejected them with `malformed_document`, except raw invalid XLS: the XLS parser alone accepted non-OLE bytes as an empty/default workbook and returned one unit. The real upload boundary rejected those same bytes as an invalid legacy Office document, so this was a parser-only bypass scenario, not a valid upload path.
- Truncated PDF/JPEG/PNG samples with accepted leading signatures passed validation and then failed in their parser as `malformed_document`; the signature validator is not a full format validator.
- A CSV containing an unterminated quoted field passed UTF-8 upload validation, then direct and worker parsers rejected it as `malformed_document`. Parsing remains fail-closed; validation and parser stages currently expose different decisions.
- For each tested malformed failure the worker/service exposes only the safe error code, not document text. The PDF runtime failure is the counterexample to current classification quality: its package-loading error is changed to `malformed_document`.

## Reproduction commands and environment

All commands were run from the repository at the expected base HEAD unless stated otherwise. The focused tests and synthetic harness made no database or S3 calls.

```bash
cd /home/rico/immigration_ai/chatbot
pnpm build:document-parser-worker
node --import tsx /tmp/document-format-audit.ts
```

The temporary fixture harness generated 11 valid and 11 malformed fixtures under `/tmp/document-format-audit-fixtures`, ran `validateMatterDocument()`, the corresponding direct parser, and `runParserWorker()` for all nine Worker-supported formats. It emitted `/tmp/document-format-audit-results.json`. Images are intentionally not sent through `runParserWorker()` because the production registry routes them to `extractImage()`.

Focused source suite (124 tests, 0 skips) was run outside the sandbox because one existing compiled GuardDuty-worker test spawns a child process, which the sandbox denied with `EPERM`:

```bash
cd /home/rico/immigration_ai/chatbot
node --import tsx --test --test-reporter=tap \
  lib/matter-documents/formats.test.ts \
  lib/matter-documents/processing.test.ts \
  lib/matter-documents/service.test.ts \
  lib/matter-documents/ai-evidence-packet.test.ts \
  lib/matter-documents/customer-document-provenance.test.ts \
  lib/matter-documents/conversation-document-status.test.ts \
  lib/matter-documents/r1-document-usage-wiring.test.ts \
  lib/matter-documents/r2-document-provenance.test.ts \
  lib/matter-documents/guardduty-sqs-reconciler.test.ts \
  lib/matter-documents/chat-deletion.test.ts \
  lib/matter-documents/lawyer-evidence-reconstruction.test.ts
```

Local production image build and runtime checks:

```bash
cd /home/rico/immigration_ai
docker build --platform linux/amd64 \
  -f chatbot/Dockerfile.production \
  -t immigration-ai-document-audit:20261016 .
docker run --rm --entrypoint node \
  immigration-ai-document-audit:20261016 \
  /app/scripts/verify-native-runtime.mjs
```

The production image build completed successfully and ran `pnpm build`, including Next.js production compile and type check. `verify-native-runtime.mjs` returned `PASS` for Node `v22.23.3`, `x64`, canvas `1.0.9`, PDF.js `6.3.289`, and module loading. A separate synthetic worker-thread smoke mounted read-only fixtures and confirmed the eight non-PDF Worker formats; its helper was `/tmp/document-parser-worker-docker-smoke-no-pdf.mjs`. A direct PDF.js diagnostic, `/tmp/pdfjs-direct-debug.mjs`, exposed the missing worker module. `pdf.worker.mjs` presence was checked using `fs.existsSync()` inside the image; it was absent while `pdf.mjs`, parser-worker output, and copied standard fonts were present.

`pnpm exec biome check` passed on the 24 inspected document-processing, route, evidence, and UI source files. `pnpm exec tsc --noEmit` exited 1 with 44 existing diagnostics across 9 files; 3 diagnostic files are test-only files under `lib/matter-documents/` (`chat-deletion.test.ts`, `guardduty-sqs-reconciler.test.ts`, `processing.test.ts`), with no diagnostics in the production document implementation. The Next production Docker build's TypeScript stage passed. No repository source or generated tracked parser artifact was modified during these checks.

## Root-cause analysis and cross-format risk

### Confirmed PDF packaging failure

`chatbot/scripts/build-document-parser-worker.mjs` bundles parser code for Node 22 but externalizes `pdfjs-dist` and `@napi-rs/canvas`. `chatbot/next.config.ts` uses standalone output and adds `parser-worker.mjs` plus `worker-runtime/**/*` to tracing. `chatbot/Dockerfile.production` copies standalone output and the parser worker runtime/fonts, but does not explicitly include the dynamically imported `pdfjs-dist/legacy/build/pdf.worker.mjs`.

In the built image, `pdf.mjs` exists, but its PDF.js `getDocument()` call tries to initialize PDF.js's internal fake worker and cannot resolve the adjacent `pdf.worker.mjs`. The direct error was:

```text
Setting up fake worker failed: Cannot find module
.../pdfjs-dist/legacy/build/pdf.worker.mjs
imported from .../pdfjs-dist/legacy/build/pdf.mjs
```

`extractPdfInternal()` catches that dependency/runtime error and replaces it with `new Error("malformed_document")`. The parser-worker entry safely transports that code, the processing service marks the run failed with zero persisted evidence, and the API maps the service's `ProcessingConflictError` to HTTP 409. That chain exactly explains the reported status/error shape without requiring a malformed customer PDF. Because the submitted PDF content is unavailable and the exact ECR image was not inspectable, attribution to the two reported files is **high-likelihood, not directly confirmed**.

The existing native-runtime verifier is insufficient as a parser release gate: it confirms that canvas can render, imports the parser-worker module and PDF.js, and checks that `getDocument` is a function. It never invokes `getDocument()` on a PDF, so it passes while `pdf.worker.mjs` is missing.

### Common cross-format findings

1. **Security approval is coupled to storage completion.** `transitionMatterDocumentStorageStatus()` writes `securityStatus="clean"` on `next="stored"`; the authenticated GuardDuty path only compares-and-sets from `pending`. If GuardDuty runs first, the later storage update can overwrite `rejected`/`failed` with `clean`; if it runs later, it sees a terminal status and conflicts. Processing accepts any `stored + clean` record. This is a confirmed code-path defect affecting every format, independent of parser health. Actual deployed GuardDuty/S3 activation and event ordering were not inspected.
2. **Extraction failures are reported as state conflicts.** The processing service catches all thrown parser/runtime errors, saves a safe run error code, then throws `ProcessingConflictError`. The endpoint returns 409, which normally means state conflict. Thus status alone does not distinguish a malformed document from a missing runtime dependency. For PDF specifically, the low-level catch further rewrites the PDF.js runtime error as `malformed_document`.
3. **Format validation is intentionally front-loaded but incomplete.** PDF/JPEG/PNG signature checks do not prove full decodability; CSV validation proves UTF-8/text shape while PapaParse supplies CSV structure checks. This is safe only if parser errors remain bounded and visible as parser failures. Raw XLS parser input is permissive, although upload validation rejects non-OLE bytes first.
4. **Worker isolation itself worked for non-PDF formats.** In the production image the Node thread, bundling, Office/text dependencies, input/output serialization and bounded worker path worked for DOCX, DOC, TXT, Markdown, JSON, CSV, XLSX and XLS. The PDF failure is the omitted external PDF.js asset, not a general failure of those parser implementations in this image.

## Answers to audit questions

**Q1. Which formats actually work?** All 11 valid synthetic fixtures passed upload validation. On the host, PDF, DOCX, DOC, TXT, Markdown, JSON, CSV, XLSX and XLS produced evidence; JPEG/PNG produced their designed `needs_review` / `vision_unavailable` result without a provider. Host `runParserWorker()` passed all nine worker-supported formats. In the local production Docker image, the eight non-PDF worker formats produced evidence; PDF failed. Actual image vision execution was not tested.

**Q2. Which formats fail locally, in the compiled Worker, or in production Docker?** No valid fixture failed on the host direct parser or host compiled worker. The local production Docker image failed PDF worker extraction; the other eight worker formats passed. Malformed raw XLS bytes are accepted by the parser alone but rejected by upload validation. Incomplete signature-only PDF/image fixtures pass validation and then fail during parse. The deployed ECS image was not inspected, so its exact result is not independently verified.

**Q3. Are failures independent or shared?** The reproduced production extraction defect is PDF.js packaging-specific. The non-PDF Worker path passed in the same image. Separate shared infrastructure concerns affect every format: premature `clean` security state, HTTP 409 error rewriting, storage/database availability, and common ownership/evidence filters.

**Q4. Most likely explanation for the two PDF failures?** PDF.js's dynamically imported worker module is absent from the standalone runtime. The parser catches its module-resolution exception and reports `malformed_document`; the processing service persists failure/zero evidence and surfaces 409. This exact chain was reproduced with a valid synthetic PDF in the local Node 22 production image. The actual submitted documents were not available for inspection.

**Q5. Could that same defect affect DOCX/DOC/TXT/CSV/JSON/XLSX/XLS?** The missing `pdf.worker.mjs` cannot affect those independent parser implementations, and all eight passed the production-image worker smoke. A worker-entry/path failure, S3/hash/database failure, or security-state gate can affect multiple formats. The current source-level malware-state issue affects all formats.

**Q6. Are upload, scanning, persistence and AI evidence independently reliable?** Source guards and unit tests cover byte limits, MIME/extension/content checks, authenticated owner-conversation authorization, S3 checksums/encryption, stored-byte size/hash verification, transactional run/evidence persistence, and bounded same-conversation AI evidence with acknowledged use. They were not end-to-end verified against real S3/PostgreSQL/GuardDuty or a live AI request. Moreover, code inspection found that `stored` sets `clean` without a scanner verdict, so malware approval is not currently independently reliable from this source path. No customer evidence or model behavior was claimed as accepted.

**Q7. Does the current test strategy represent production Docker adequately?** No. Existing tests have good direct parser coverage but the compiled Worker test only runs PDF, DOCX, DOC, XLSX and XLS; TXT, Markdown, JSON and CSV are missing from that existing Worker matrix. The native-runtime verifier only imports PDF.js and does not parse a PDF. It missed the confirmed production packaging defect. JPEG/PNG's no-provider branch is covered as degraded behavior but does not test configured production provider wiring.

**Q8. Smallest robust remediation without weakening file security?** First package PDF.js's required worker asset into the standalone image (through an explicit trace/copy or stable runtime path) and validate an actual PDF in the production image. Independently, stop changing security status as a side effect of storage state: leave it pending until an authenticated GuardDuty verdict reconciles it, and permit processing only after that clean verdict. Preserve all existing validation, owner checks, hash checks, scan-event authentication and fail-closed behavior. Then correct safe error categories/status mapping so parser/runtime failures are not mislabeled as malformed input or HTTP 409 conflicts. No schema migration appears necessary for these corrections based on current fields.

**Q9. What should be the mandatory release gate?** For each of 11 formats, validate a genuine valid fixture and malformed/unsupported fixture; run direct parser tests; run every Worker-supported type through built `runParserWorker()`; for images, test both no-provider degraded state and a fake vision adapter. Build the production image for the confirmed ECS architecture, run these tests inside that image, assert PDF.js assets are present and parse real text, and test worker timeouts/serialization. Add isolated integration coverage for S3 checksum/size, DB claim/finalize/failure/retry, GuardDuty arrival before/after `stored` with no verdict overwrite, HTTP failure mapping, and owner/chat-scoped evidence + verified acknowledgement. Do not make release acceptance depend solely on mocked repositories or module import checks; avoid live customer files and paid AI calls.

**Q10. What is confirmed versus hypothesized?** Confirmed by execution: the valid fixture matrix; host worker success; eight non-PDF worker successes in the local Node 22 production image; PDF.js worker module missing and valid synthetic PDF failure in that image; native-runtime verifier false-positive; production build success; and 124 focused test passes. Confirmed by source: the security-state ordering problem and parser-error-to-409 mapping. High-likelihood hypothesis: the same omitted asset caused the two reported failures and exists in deployed `:46`. Unverified: exact deployed image contents/architecture, real PDFs, live GuardDuty/S3 configuration and behavior, S3/PostgreSQL persistence, and AI-side document-use acceptance.

## Prioritized proposed repair plan — not implemented

### P0 — shared defects that block advertised behavior or safety

1. **Repair PDF.js standalone packaging.** Include the exact version-matched `pdf.worker.mjs` alongside `pdf.mjs` (or configure a stable supported worker source). Keep PDF.js external if needed, but make file tracing explicit. Add an assertion that checks the resolved runtime path and a native-text PDF extraction through the production worker in the built image. Do not classify module-resolution failures as malformed customer content.
2. **Restore scanner-verdict authority.** Separate `storageStatus=stored` from `securityStatus`; do not write `clean` when an S3 PUT succeeds. Keep processing disabled while pending. Reconcile only authenticated GuardDuty outcomes through the pending-state compare-and-set and ensure a later storage transition cannot overwrite any verdict. Add both scan/storage ordering permutations and infected/failed outcomes to isolated integration tests. First verify the deployed S3/GuardDuty event wiring read-only with an authorized operator.

### P1 — parser compatibility and processing semantics

1. Preserve distinct safe internal failure classes for malformed content, parser dependency/module load, timeout, worker crash, and integrity mismatch. Store bounded structured telemetry for format, stage, extractor/runtime version, safe code, and worker outcome; never log bytes, extracted text, customer identifiers, credentials, raw untrusted exception payload, or stack traces in customer telemetry.
2. Return an HTTP status aligned with the failure category (for example invalid content versus server/parser failure) instead of mapping all processing exceptions to 409. Retain run `errorCode` in the existing safe summary endpoint and make UI retry behavior explicit.
3. Add a parser-only guard or stronger spreadsheet structure check for legacy XLS so raw invalid input cannot yield synthetic empty evidence if an internal caller ever bypasses upload validation. Keep upload validation as the primary acceptance boundary.
4. Keep explicit image/PDF-scanned-page `needs_review` states when vision is not configured; separately test configured vision through an injected/fake adapter and review live Staging configuration without exposing keys.

### P2 — observability, regression and release gate

1. Extend the existing Worker matrix to TXT, Markdown, JSON and CSV and run it inside the built production image. Retain authentic DOC and XLS fixtures.
2. Upgrade the native-runtime verifier from import-only checks to actual PDF extraction and non-PDF worker parsing. Verify standalone package paths, PDF.js worker assets, standard fonts, native canvas, Node version and confirmed ECS architecture.
3. Add a disposable isolated upload-to-evidence acceptance suite covering scanner/storage ordering, retry/reprocess semantics, no evidence on failure, size/hash mismatch, error code/status, owner/chat isolation, packet bounds, and backend acknowledgement constrained to the request manifest.
4. Keep security/error metrics format- and stage-specific without capturing document bodies. Gate deployments on successful production-image parser checks and zero security-state bypass cases.

## Unresolved questions and limitations

- Can an authorized reviewer inspect ECS `:46`'s read-only `runtimePlatform` and the exact image digest, then compare its `pdf.worker.mjs` contents with this local faithful build?
- Which S3/GuardDuty malware protection configuration is active in Staging, and are scan result events reaching the compiled SQS reconciler? The current source state transition makes its verdict ineffective or vulnerable to overwrite; do not infer scan approval from `securityStatus=clean` until this is resolved.
- Do the two affected PDF files pass the same standalone runtime test after packaging is corrected? Their content was not accessed in this audit.
- Do current live deployments have `MATTER_DOCUMENT_VISION_ENABLED`, a supported vision model and credential configured? No environment values or secrets were read.
- No production S3, PostgreSQL, ECS task, GuardDuty configuration, customer account, payment record, or model call was changed or exercised.

**Disposition:** investigation findings are ready for external review. No remediation was implemented; stop here pending that review.
