# CURRENT_HANDOFF

**Updated:** 2026-09-20  
**Branch:** `phase11-chinese-service-platform-ui-rebase`  
**Phase 11 base:** `3b3653202f9b067fbed4adfd410edc02cb7215cc`  
**P11-001 verified checkpoint:** `4bc039c60f72e61e2e3b6a7cc26a88a862d5c1e3`  
**P11-002A verified checkpoint:** `d0964924be003fd61902fca760bd71aca53abe4f`  
**P11-002B verified checkpoint:** `9454a5e4b5a5c5515967ad977faa2355ba053fc5`  
**P11-003A implementation checkpoint:** `f7fa6363e4f2ee326306b20203692dd73e45cebd`  
**P11-003A provenance-hardening checkpoint:** `4f232fe40161a7adad104bcbf6c382b846425936`  
**P11-003B verified checkpoint:** `081ef46dd040b6131d475750d0968c9f2e461bb2`  
**P11-003C starting checkpoint:** `f54b525c225c33877954fab306d615c88213e89b`
**Git-state rule:** verify the live branch tip with `git rev-parse HEAD`; documentation-only memory commits may advance HEAD without runtime changes  
**Milestone:** Phase 11 — Chinese-first Immigration & Study Service Platform UI Rebase

## Current verified state

- P11-00: **VERIFIED**
- P11-001: **VERIFIED**
- P11-002A: **VERIFIED**
- P11-002B: **VERIFIED**
- P11-003A: **VERIFIED**
- P11-003B: **VERIFIED**
- P11-003C: **IMPLEMENTED IN WORKING TREE — OWNER REVIEW PENDING**

## P11-003B accepted architecture

P11-003B established the required publication boundary:

- `chatbot/content/policy-intelligence/registry.ts` is the server-only editorial registry;
- `chatbot/lib/policy-intelligence-server.ts` owns server-only published loaders;
- `chatbot/lib/policy-intelligence.ts` owns shared types, validation and pure public-projection logic;
- Home, `/intelligence`, and `/intelligence/[id]` load policy data on the server;
- client presentation receives only explicit public-safe projections;
- `origin` and `discovery` metadata are excluded from public projections;
- the Home preview receives an even smaller projection;
- the production editorial registry remains empty;
- the manual Git-based curation workflow is documented under `chatbot/content/policy-intelligence/README.md`.

Validation at the accepted checkpoint:

- unit tests: **169 passed**;
- production build: **passed**;
- changed-file Biome: **passed**;
- `git diff --check`: **passed**;
- repository-wide lint retained the known 22 unrelated diagnostics.

No DB, admin-write API, crawler, scheduler, LLM summariser, legal-service change or automatic publication was added.

## P11-003C implementation

P11-003C is implemented in the working tree and remains uncommitted/unpushed. The operator-only discovery path is separate from the public application:

```text
allowlisted official source
    -> bounded operator fetch/parsing
    -> policy-intelligence.discovery-candidate.v1
    -> local non-public artifact or dry-run stdout
    -> human verification
    -> manual PolicyEntry/review/publication gate
```

Changed files:

- `chatbot/scripts/policy-intelligence-discovery.ts`: source configuration, bounded fetch, redirect/DNS/content-type/size checks, canonicalisation, parsing, fingerprints, candidate contract, deduplication, and bounded discovery.
- `chatbot/scripts/policy-discover.ts`: operator CLI with configured source IDs, `--dry-run`, optional ignored local `--write`, synthetic fixture mode, and bounded candidate count.
- `chatbot/lib/policy-intelligence-discovery.test.ts`: deterministic security, parser, candidate-contract, deduplication, registry-boundary, and local-fixture tests.
- `chatbot/scripts/fixtures/policy-intelligence-discovery/`: synthetic sitemap, listing, and detail fixtures.
- `chatbot/content/policy-intelligence/README.md`: discovery sources, CLI usage, candidate semantics, limits, and manual promotion workflow.
- `chatbot/package.json`, `chatbot/.gitignore`: operator command and ignored `.local/policy-intelligence-candidates/` output directory.

Configured discovery sources are grounded in the read-only Python authority registry: Home Affairs (`immi.homeaffairs.gov.au`), Federal Register of Legislation (`legislation.gov.au` and `www.legislation.gov.au`), and ART (`art.gov.au` and `www.art.gov.au`). The TypeScript code has no runtime dependency on `legal-service/`.

The candidate contract is `policy-intelligence.discovery-candidate.v1`. It contains acquisition/provenance fields only: source config and authority, canonical URL, title/date when explicitly present, retrieval time, content type, bounded preview, content hash, HTTP metadata, and strategy. It has no `PolicySourceStatus`, AI analysis, bilingual copy, lawyer commentary, editorial status, or publication operation. Optional write output is local-only under `chatbot/.local/policy-intelligence-candidates/`; the public registry remains untouched and empty.

Fetch limits are hard-bounded at 4 pages, 8 links per page, 10 candidates, 256 KB total response bytes, 128 KB per response, 5 seconds per request, 15 seconds per run, and 3 redirects. Requests are HTTPS-only, exact-host allowlisted, credential/cookie-free, content-type constrained, manually redirected and DNS-checked against private/local/link-local destinations. There is no arbitrary URL CLI mode, generic crawler, scheduler, runtime write, or LLM call.

CLI fixture validation:

- `pnpm --silent policy:discover -- --source home-affairs-guidance --fixture synthetic-listing --dry-run --max-candidates 3`: exit 0; emitted 3 JSON candidates and `Dry run: discovered 3 non-public candidate(s) from home-affairs-guidance`.
- `pnpm --silent policy:discover -- --source federal-register-legislation --fixture synthetic-sitemap --dry-run --max-candidates 3`: exit 0; emitted 3 JSON candidates and the corresponding dry-run summary.
- Live network smoke: **not attempted**; deterministic local fixtures are sufficient and no live connectivity is required.

Validation:

- `pnpm test:unit`: **178 passed, 0 failed, 0 skipped** outside the sandbox; the new discovery tests contributed 9 passing tests.
- `pnpm build`: **passed**.
- Changed-file Biome: **passed**.
- `git diff --check`: **passed**.
- `pnpm lint`: fails with the repository-wide known **22 existing diagnostics**; the fixture HTML was corrected and changed discovery TypeScript/fixtures pass focused Biome checks.

Security review result: no arbitrary URL fetch path; redirects cannot leave the configured host allowlist; local/private/link-local DNS targets are rejected; candidate output is ignored/non-public and never imported by public components; discovery cannot modify `MANUAL_POLICY_ENTRIES`; no candidate-to-public function or automatic publication path exists; no model/provider is called.

No database, scheduler, LLM, legal-service, answer-time retrieval, Fast, Legal Check, Premium, Phase-6, or ReasoningBank behavior changed.

Unresolved questions: none for the bounded infrastructure task. Live source response formats may require a later, separately reviewed parser refinement when a real operator run is authorised.

Recommended next action: owner/reviewer inspect the uncommitted diff, then manually author any verified `PolicyEntry` only through the existing draft/review/publication workflow; do not promote candidate artifacts automatically.

## Review rule

The coding model must leave P11-003C changes uncommitted/unpushed. The owner will provide `git status --short` and `git diff --stat`; reviewer will then provide exact commit/push commands and inspect the GitHub diff after push.
