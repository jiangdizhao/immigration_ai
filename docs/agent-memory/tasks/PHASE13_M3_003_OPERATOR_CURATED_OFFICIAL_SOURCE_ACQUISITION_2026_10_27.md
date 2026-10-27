# Phase 13 M3-003 — Operator-curated official-source acquisition (offline first)

Created: 2026-10-27 (Australia/Sydney)
Status: **DISPATCH READY — OFFLINE IMPLEMENTATION ONLY**
Branch: `phase13-study-journey-project-centric`
Accepted M3-002 code SHA: `bda4487f000c43f6dda2955ae28067a1938b4199`
Required starting HEAD: subsequent **documentation-only** acceptance/dispatch commit after owner `git pull --ff-only`.
Authority: M3 frozen architecture, D-P13-008, D-P13-009, D-P13-010; exact boundaries here govern the code packet.

## 1. Objective and exclusions
Implement a secure, operator-driven **candidate source acquisition, validation and dry-run import pipeline**, consuming the accepted M3-001 typed contracts and M3-002 catalog/repository. The operator must be able to declare *why* a government/institution URL is relevant, which authority/scope/permission was assessed, and produce a deterministic, provenance-rich review packet without live access. Begin with entirely synthetic/offline transport and fixture responses; no real school data is claimed authoritative.

This is **NOT** an authorized internet-fetch pilot, production crawler, source verification certification, Legal Service modification, public feed, institution search API, AI content generation, Project matcher, database write or schema migration. Do not start M3-004.

## 2. Mandatory baseline investigation
Read `AGENTS.md`, `CURRENT_HANDOFF.md`, `CURRENT_MILESTONE.md`, `PROJECT_STATE.md`, `DECISIONS.md`, M3 architecture, this task and M3-002 acceptance matrix. Verify branch and clean HEAD, test baseline, `chatbot/lib/education-intelligence/{contracts,identity,field-resolution,fixtures,catalog-repository-core,postgres-repository}.ts`. Inspect existing Phase11 discovery fetching and `chatbot/lib/policy-intelligence` security patterns **for reuse of proven primitives only**, without importing policy editorial/publication semantics. Preserve frozen M3-001/M3-002 contracts and migration 0040 byte-for-byte.

## 3. A bounded operator source manifest (exact authority)
Define versioned, validated, serialized request and manifest contracts (e.g. `education.source-acquisition.v1`) under `chatbot/lib/education-intelligence/`, separate from existing `EducationSource`. Fields should capture:
- immutable operator proposal/request ID, family `CRICOS|STUDY_AUSTRALIA|INSTITUTION`, scoped target provider when institution-specific, canonical HTTPS URL, explicit approved hosts and exact path/scope, operator rationale, reference/source-document proving source authority, locale, expected document type;
- review/permission state `PROPOSED|APPROVED|REJECTED`, named reviewer and reviewedAt when APPROVED, recorded terms/robots/access-policy assessment, as-of timestamp and policy version; no self-declared `official` label substitutes for review;
- transport policy: redirects, allowed hosts after each hop, allowed protocol/ports, DNS/private network checks, size/time budgets, user agent/access credentials rules, handling if source terms disallow automated access;
- default to PROPOSED/DISABLED for all real CRICOS/Study Australia/institution entries. Reserved `.example` hosts remain only synthetic fixture sources. No bulk CRICOS API/permission assumption. Manifest validation must reject source-family authority confusion, illegal provider scope, colliding IDs, unsupported URLs, missing operator evidence, and stale/missing approval.

Do not conflate `APPROVED` source access policy with a verified individual fee/admissions/registration claim; M3-002 `RecordClass` remains only SYNTHETIC or UNVERIFIED.

## 4. Injectable capture and safety pipeline — OFFLINE ONLY
- Implement an injected transport interface for a future **separately authorized** adapter; this packet must not silently call global `fetch`, DNS, Playwright, cloud endpoints or subprocess curl. All tests use deterministic fake responses/redirects and fake DNS/resolution metadata. No real HTTP call even for smoke tests.
- Before accepting any response: canonicalize the URL, HTTPS-only, no userinfo/unsafe port, exact allowlist and source-scope check, bounded redirects with revalidation on **every** redirect, DNS/IP/private-range/localhost/IPv4-mapped IPv6 and rebinding-risk defenses designed and testable at the connection boundary. Do not implement a fake SSRF safety promise by validating a URL once then letting an unrestricted transport reconnect; if safe pinning cannot be supplied by the injected transport, **fail closed**. Avoid error diagnostics that leak credentials.
- Bounded total run and per-request deadlines including DNS, redirects, headers and body, decoded body byte maximum, hop count, request count, content type/charset rules, abort/cancellation, malformed UTF-8 and decompression limits. Provide conservative defaults and explicit hard caps; no runaway retries/rate-limit bypass or robots/TOS circumvention.
- Outcome distinction and history: `CAPTURED|FAILED_FETCH|FAILED_PARSE` (matching existing snapshot vocabulary); operator must see exact failure stage/cause, attempt time, URI/redirect evidence, status and bounded diagnostics, but not secrets/raw unsafe HTML. Preserve past successful snapshots and represent failures as new attempts, never silently overwrite or erase history.
- Raw HTML/document text is **untrusted**. Any extraction is a strictly limited draft with a supporting bounded quote/locator and traceable source hash/time; no LLM-invented fee/deadline/intake criteria, fake links or auto-VERIFIED promotion. Unknown remains unknown; conflicting candidate assertions remain candidates.

## 5. Curated structured import, review and dry-run
- Provide a safe, typed operator-side function/CLI or equivalent offline module (choose one concise integration surface) that accepts a manifest plus fixture/curated response, returns a deterministic **review packet**: normalized source metadata, proposed `EducationSource` and `EducationSnapshot`, field observation proposals only when explicit source evidence exists, `validateEducationDataset` result, possible identity ambiguities and per-field unsupported/unknown/stale/conflicted signals as appropriate, exact provenance, no-loss failure attempt log and a no-write preview of intended inserts/replays/conflicts.
- Prefer use of M3-002 `EducationCatalogRepositoryCore` interface through **injected in-memory stubs only** if useful; DO NOT connect or write to any PostgreSQL database, including `immigration_ai_phase13_m3_002_test`, during this packet. Do not add new migration. No automated commit/import path into actual database; if a future commit path is required, propose a separate owner-authorized M3-003-B with transaction guard and human review.
- Do not reclassify institution claims as CRICOS registration; do not treat Study Australia summaries as institution-specific admissions evidence; no deduplication on course titles alone; no mixing SYNTHETIC with UNVERIFIED. Operator review is about source access, not legal/admissions accuracy.

## 6. Offline acceptance tests
Supply hostile as well as happy-path synthetic tests, at minimum:
1. Family-specific manifest authority, provider scope and reserved-host behavior; independent source consent/terms evidence.
2. URL canonicalization and spoofing: path/query `.example`, crafted userinfo, explicit ports, private IPv4/IPv6, IPv4-mapped, DNS rebinding and redirect-to-private/disallowed host.
3. Mock transport deadlines (including slow DNS/headers/body), redirect hop loops and bounded total byte budget, non-HTML/wrong type, malformed/oversized/decompression payload, abort; diagnostics are bounded and no PII/credential leaks.
4. CRICOS-vs-institution-vs-discovery source semantic boundaries; capture succeeded but parsing/evidence missing keeps fields UNKNOWN and does not become VERIFIED.
5. Repeat capture idempotency, A-B-A with distinct snapshots/observations, failed fetch/parse attempts retained, conflicting source fields preserved as CONFLICTED rather than last-wins, source provenance/hash/locator never silently omitted.
6. Same title across distinct providers, multi-campus delivery, repeated intake codes across years, differing fee basis/audience; typed input validation and dry-run no-side-effects.
7. No requests or writes when approval is missing, invalid, expired or disallowed; prove direct network/DB paths are absent from default code entrypoint.

Validation: named focused tests via `node --import tsx --test ...`, existing `pnpm test:unit` (owner Ubuntu if sandbox policy prevents socket tests), Biome changed files, `pnpm db:check` if schema touched (ideally none), `git diff --check`, TypeScript diagnostic difference vs known **44 preexisting baseline**; report exact failure and skip counts. Note the existing unit script may omit newly introduced education tests—run them explicitly.

## 7. Hard stop and handoff contract
No real HTTP/DNS/robots requests, no source crawling, no paid model/AI extraction, AWS, user records, admissions assertions, production release, API/UI endpoint, scheduler/cron, database schema modifications, migration, database insert/update, or M3-004 work in this packet. Even a single live official source fetch requires **separate owner authorization**, exact URL/host scope and access/terms assessment.

Codex writes the bounded patch **uncommitted and unpushed**, updates the three canonical status docs to IMPLEMENTED / PENDING INDEPENDENT REVIEW (preserve accepted M3-002), and reports changed files, exported interfaces, mock scenarios, adversarial tests, skipped tasks, baseline-vs-new TypeScript diagnostics, cumulative patch path + SHA-256, and branch/HEAD/status. ChatGPT independently audits. Owner tests, commits and pushes. ChatGPT confirms exact remote code SHA and then writes acceptance documentation. No force push, rebase, branch deletion or unrelated ref modifications.

## Suggested code structure (not compulsory)
`chatbot/lib/education-intelligence/source-manifest.ts`, `acquisition-policy.ts`, `acquisition-core.ts`, `acquisition-review.ts`, corresponding `*.test.ts` with injected fake transport. Avoid unnecessary duplicates or architecture proliferation.
