# Phase 13 M2-A1.3 — Project document customer API/UI: fast offline integration contract

**Architect date:** 2026-10-26  
**Accepted source baseline:** `phase13-study-journey-project-centric` @ `a14d53227003a1f9bf41bc86688995deaf63daac`  
**Status:** OWNER-REQUESTED EXPEDITED M2 DEVELOPMENT — **OFFLINE IMPLEMENTATION CONTRACT ONLY**. Independent source review before commit. No production/staging activation, real customer uploads, AWS calls or authoritative-DB mutation authorized.

## 1. Goal / one implementation slice

Build the first integrated, authenticated, **default-off** Project Document customer interface with server-side HTTP seams plus simplified bilingual Chinese/English Workspace UI. Use accepted A1.0 service, A1.1 `PostgresProjectDocumentRepository`, A1.2 exact-version S3/scanner adapter contracts and B3 offline worker. **Do not duplicate or bypass** legacy MatterDocument or Phase 13 Project auth. The production runtime deliberately remains locked while independent GuardDuty producer attestation/B2 and privacy/retention consent remain unresolved. Unit and synthetic/injected HTTP/browser tests validate the API now, rather than recreating AWS test resources.

Distinct from B3: B3 R1 user-host tests PASS 12/12, full unit PASS 964/964, clean owner commit/push `a14d53227003a1f9bf41bc86688995deaf63daac`, GitHub remote SHA independently matched. Offline acceptance only; B3 production delivery authenticator, live SQS client/runtime, attestation issuer and failed-scan durable status are absent. B2-1 live collector never executed. Do not label M2/A1.2 live accepted.

## 2. Existing sources / explicit limits

- Read `AGENTS.md`, three canonical state docs, `docs/agent-memory/tasks/PHASE13_M2_A1_PROJECT_DOCUMENT_SERVICE_ARCHITECTURE_CONTRACT.md`, `PHASE13_M2_001_PROJECT_DATA_FACTS_DOCUMENTS_CONTRACT.md`, B1/B2/B3 frozen contracts, `PHASE13_M2_RAPID_CLOSEOUT_PATH_2026_10_26.md`.
- Current project auth/router: `chatbot/lib/projects/{runtime,http,chat-policy}.ts`, `chatbot/app/api/projects/**`, `chatbot/lib/db/project-foundation.ts`. Existing Project UI `chatbot/components/{project-entry-panel,immigration-ai-workspace}.tsx`.
- Document core: `chatbot/lib/project-documents/{service,ports,types,postgres-repository}.ts`, `aws/{scan-candidate,delivery-context,s3-object-store}.ts`, `aws/b3/*`. Legacy Chat source: `chatbot/lib/matter-documents/{http,runtime,validation}.ts` for API/validation patterns only.
- The A1.0 in-memory `ProjectDocumentRepository` interface and A1.1 PostgreSQL repository are **not interchangeable implementations of identical methods**. Do not quietly cast/force-connect them. Supply explicit typed application adapters or clarify capability gaps. The current `PostgresProjectDocumentRepository` already implements `createDirectUploadIntent`, `importOwnedChatDocumentIntent`, `finalizeStorage`, `finalizeScan`, grant/withdrawal functionality; read/list APIs may need narrow audited queries built in the new application layer, but **no migration by default**.
- The Phase 12 `MatterDocument.securityStatus=clean` is NOT trusted evidence of a Project scan. Import requires independently authorized source Chat ownership and source document bytes even if same Project owner.

## 3. Implementation tasks — work as one bounded patch

**A. Server-only HTTP/application seam**
- New `chatbot/lib/project-documents/http.ts`, optional `runtime.ts` and focused route modules under `app/api/projects/[projectId]/documents/**`. Keep all real side effects behind injected ports and explicit operator-approved server-only runtime factory.
- Candidate routes: `GET /api/projects/{projectId}/documents` (current actor/grant-scoped bounded list); `POST /api/projects/{projectId}/documents` (direct upload intent+conditional put+storage finalize behind fail-closed runtime); `POST /api/projects/{projectId}/document-imports` (explicit creator-owned source Chat/document+consent, copied to separate Project key); `GET /api/projects/{projectId}/documents/{assetId}` (own sanitized metadata/state); `GET /api/projects/{projectId}/documents/{assetId}/download` (authenticated exact-version bytes only for independently verified clean status and active download grant); `POST /api/projects/{projectId}/documents/{assetId}/withdraw` / creator-grant revoke, as accepted service semantics support. Do NOT silently add cross-member sharing, AI-context grants or externally callable scan finalization.
- Derive User identity from authenticated server session (not request JSON, Headers or Project owner claim); reject guests, revoked/pending memberships, closed Projects; re-evaluate per request and again around long-running byte access. Determine Project association from server DB. Scope list by **current actor and purpose-specific metadata grant** without count/ID leakage, even to Project owner of other member documents. Distinguish 401/403/404/409/413/429/503 according to existing repo conventions without identity oracle.
- Require opaque `operationId` + expected Project revision for mutations, compute canonical server-held hash, exact byte hash and version; bound upload bytes, MIME/content sniffing, memory/time, per-actor/project rates, no original filename in S3 key; reject malicious container or over-limit input. Never persist unsanitized user-provided `sha256`, `storageKey`, `servicePrincipal`, `securityStatus`, provenance. Explicit import consent is actor-authenticated and versioned, not a boolean supplied by the browser.
- `no-store` and appropriate private responses; never expose object key, SQS message, internal ARN, signed storage link or raw audit payload. Safe serialization. API must not treat successful storage as `clean`. Scan `pending/rejected/failed` denies any download/content/AI access.

**B. Read/download/withdraw authority**
- Enforce conjunction: current Project active/membership + creator/source ownership (as applicable) + exact active purpose grant + version stored + independently verified exact-version `clean` scan audit + asset active + exact-byte SHA-256 on read. Missing B2 live producer proof => block real download as `503`/fail-closed, not an optimistic `clean` flag.
- A Project owner does not inherit other member's private documents. No staff or application-sharing roles. No implicit `ai_context`; any use outside UI remains disabled. Withdraw/revoke audits and invalidation use accepted ProjectOperation/ProjectEvent paths; no physical deletion or legal-hold assumption. If source ownership, grant or true clean attestation cannot be determined by existing port, do not fabricate it: fail-closed and report interface gap for review.

**C. Operational feature gate**
- `PHASE13_PROJECT_DOCUMENTS_ENABLED` absent/false by default. Independent of existing Project Chat flag and legacy MatterDocument. Add separate **live readiness** dependency/explicit trusted capability; the ordinary flag alone must not activate AWS, scan finalization, real customer file upload or download. No self-reported `trusted` config. Runtime wiring must remain disabled unless separate B2 security, privacy notice/consent, data retention/legal-hold, owner approval and staffed incident/remediation review are explicitly completed.
- Unit tests may use injected fake storage, source, auth, scan and transaction ports. Guarded disposable PostgreSQL tests only if safety identity check confirms `127.0.0.1:5432/immigration_ai_phase13_m1_1_test`, never normal project database. No real AWS, no production profile or credentials; do not create resources.
- Route handlers should be present for integration review while returning fail-closed when feature off or trust provider absent. UI must not present mock files as real records.

**D. Bilingual customer UI**
- Extend existing Project entry/Workspace with a small Project Documents panel or guarded section, default zh-CN and one-click en using current locale provider. Show owned file metadata, exact storage/security state including pending scanning, error/empty states and explicit consent warnings. Hide upload/import/download when feature disabled; do not show permission to share to members or agent. Preserve mobile layout and Standalone Chat isolation. Wire only to new guarded server handlers; no local client-only authority or permanent mock sample data.
- No large redesign; no lawyer-facing UI, multi-school uploads, policy decisions or AI extraction.

**E. Tests / failure modes**
- Auth absent/guest/closed/pending/revoked/cross-owner/cross-project; creator-vs-Project-owner privacy; source Chat ownership; import prompt/consent/hash mismatch; stale revision/idempotency; malformed MIME/size/zip bombs/requests; rate cap; missing schema, B2 evidence absent, scanner unavailable, disabled features => fail closed.
- No `clean` from storage success, legacy MatterDocument flags, forged scan JSON, client-supplied status, missing grant; exact VersionId/sha/length and post-read revocation; retry/dual-submission isolation; zero unrelated Standalone/Phase12 regression; error sanitization/no-store/bilingual text and mobile.
- Run dedicated A1.3 files **explicitly** (current `pnpm test:unit` uses a fixed list), existing A1.0/A1.1/A1.2-A/B1/B3 suites, all unit tests, changed-file Biome, TypeScript baseline delta and `git diff --check`. A1.1 empty-schema integration requiring a fresh test DB remains separately UNVERIFIED until permitted; do not reset existing DB to fake passage.

## 4. Stop lines / handoff

If A1.3 cannot honestly implement a permission/privacy/consent/audit gate on current primitives without schema changes, **stop that affected path** with precise blocker instead of silently weakening requirements. Do not add migration 0034, new broad owner/staff roles, auto-share, auto-grant, customer secrets or production AWS client. Other safe offline paths/tests may still proceed. No deployment or real user uploads authorized.

Deliver entire cumulative patch `~/phase13_m2_a1_3_review.patch`, SHA-256, exact file list, separate offline tests vs unavailable integration tests, state docs updated **implementation pending independent review**. Leave uncommitted/unpushed. Final owner acceptance will separately assess privacy and release gates.

**M2 remains OPEN:** after A1.3 offline code, M2-B facts+publication, M2-C versioned provisional requirements, M2-D cross-Chat authorized context and final synthetic file/chat evidence tests remain.
