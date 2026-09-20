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
- P11-003C-R1/R2: **IMPLEMENTED AND PUSHED**
- P11-003C-R3: **IMPLEMENTED IN WORKING TREE — OWNER REVIEW PENDING**
- P11-003C overall: **NOT YET VERIFIED**

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

## P11-003C + R1 + R2 implementation

P11-003C, its R1 security correction, and R2 structured Home Affairs strategy are pushed at `009e7f964f86bd6b755d4fe5ded82c922ea48f09`. The operator-only discovery path is separate from the public application:

```text
allowlisted official source
    -> bounded secure fetch/parsing
    -> Home Affairs siteData.alertItems or existing generic strategy
    -> policy-intelligence.discovery-candidate.v1
    -> local non-public artifact or dry-run stdout
    -> human verification
    -> manual PolicyEntry/review/publication gate
```

Changed files:

- `chatbot/scripts/policy-intelligence-discovery.ts`: source configuration, R1 secure bounded fetch, Home Affairs structured-alert extraction, redirect/DNS/content-type/size checks, canonicalisation, fingerprints, candidate contract, deduplication, and bounded discovery.
- `chatbot/scripts/policy-discover.ts`: operator CLI with configured source IDs, `--dry-run`, optional ignored local `--write`, synthetic fixture mode, and bounded candidate count.
- `chatbot/lib/policy-intelligence-discovery.test.ts`: deterministic R1 security, structured parser, source-specific limits, candidate-contract, deduplication, registry-boundary, and local-fixture tests.
- `chatbot/scripts/fixtures/policy-intelligence-discovery/`: synthetic Home Affairs `siteData.alertItems`, sitemap, listing, and detail fixtures.
- `chatbot/content/policy-intelligence/README.md`: discovery sources, structured strategy, CLI usage, candidate semantics, limits, and manual promotion workflow.
- `chatbot/package.json`, `chatbot/.gitignore`: operator command and ignored `.local/policy-intelligence-candidates/` output directory.

Configured discovery sources are grounded in the read-only Python authority registry: Home Affairs (`immi.homeaffairs.gov.au`), Federal Register of Legislation (`legislation.gov.au` and `www.legislation.gov.au`), and ART (`art.gov.au` and `www.art.gov.au`). The TypeScript code has no runtime dependency on `legal-service/`.

The candidate contract is `policy-intelligence.discovery-candidate.v1`. It contains acquisition/provenance fields only: source config and authority, canonical URL, title/date when explicitly present, retrieval time, content type, bounded preview, content hash, HTTP metadata, and strategy. It has no `PolicySourceStatus`, AI analysis, bilingual copy, lawyer commentary, editorial status, or publication operation. Optional write output is local-only under `chatbot/.local/policy-intelligence-candidates/`; the public registry remains untouched and empty.

Generic discovery remains hard-bounded at 4 pages, 8 links per page, 10 candidates, 256 KB total decoded response bytes, 128 KB per response, 5 seconds per request, 15 seconds per run, and 3 redirects. Home Affairs uses a one-page structured-alert strategy with a separate 2 MiB decoded response and total-run ceiling, 100 examined alert items, and no link fan-out. One abort deadline covers DNS, redirects, headers, and complete body streaming. Requests are HTTPS-only, exact-host allowlisted, credential/cookie-free, content-type constrained, manually redirected, and DNS-checked against private/local/link-local destinations. There is no arbitrary URL CLI mode, scheduler, runtime write, or LLM call.

CLI fixture validation:

- Earlier P11-003C generic-link fixture validation: `pnpm --silent policy:discover -- --source home-affairs-guidance --fixture synthetic-listing --dry-run --max-candidates 3` exited 0 and emitted 3 candidates before R2 changed the Home Affairs strategy; R2 uses the dedicated structured fixture below.
- `pnpm --silent policy:discover -- --source home-affairs-guidance --fixture synthetic-home-affairs --dry-run --max-candidates 5`: exit 0; emitted 3 structured non-public alert candidates, with duplicate suppression, raw update metadata, and seed fallback provenance.
- `pnpm --silent policy:discover -- --source federal-register-legislation --fixture synthetic-sitemap --dry-run --max-candidates 3`: exit 0; emitted 3 JSON candidates and the corresponding dry-run summary.
- Live Home Affairs smoke: exit 0, runtime **848 ms**, 5 candidates. The titles were `Subclass 186`, `Skills in Demand 482 processing priorities`, `Employer Sponsored Regional 494 processing priorities`, `Discussion Paper: Reforming Australia's Settlement Grants Programs September 2026`, and `Form Banners - SharePoint Migration Project`; all used `home_affairs_site_alerts` and the configured seed URL, with raw `alertUpdateDate` values `19/09/2026 12:03:28 AM`, `19/09/2026 12:03:27 AM`, `19/09/2026 12:03:26 AM`, `11/09/2026 12:01:53 PM`, and `9/09/2026 4:10:38 PM`. These are unverified discovery candidates, not legal conclusions.

Validation:

- `pnpm test:unit`: **183 passed, 0 failed, 0 skipped** outside the sandbox; the discovery tests contributed 14 passing tests, including the R1 timeout/mapped-IPv6 cases and R2 structured-alert/limit cases.
- `pnpm build`: **passed**.
- Changed-file Biome: **passed**.
- `git diff --check`: **passed**.
- `pnpm lint`: fails with the repository-wide known **22 existing diagnostics**; the fixture HTML was corrected and changed discovery TypeScript/fixtures pass focused Biome checks.

Security review result: no arbitrary URL fetch path; Home Affairs does not recursively crawl or fetch alert URLs; redirects cannot leave the configured host allowlist; local/private/link-local DNS targets are rejected; decoded response bytes remain bounded; candidate output is ignored/non-public and never imported by public components; discovery cannot modify `MANUAL_POLICY_ENTRIES`; no candidate-to-public function or automatic publication path exists; no model/provider is called; no `legal-service/` file changed.

## P11-003C-R1 security correction

R1 corrected the fetch deadline lifecycle without changing the discovery surface. One abort deadline now starts before DNS safety resolution and remains active through redirect hops, HTTP headers, and bounded response-body streaming. Body reads cancel on abort, and run-level discovery passes the remaining runtime into the request timeout. Deterministic tests prove hanging bodies and delayed DNS cannot bypass the timeout.

The IPv4-mapped IPv6 parser now converts dotted IPv4 tails structurally before applying the existing private/local, link-local, unique-local, loopback, and multicast checks. Tests cover `::ffff:127.0.0.1`, `::ffff:10.0.0.1`, `::ffff:169.254.1.1`, `::ffff:192.168.1.1`, `::1`, `fe80::1`, `fc00::1`, `fd00::1`, and existing IPv4 cases.

R1 changed only `chatbot/scripts/policy-intelligence-discovery.ts` and its focused test file. Source configuration, CLI surface, candidate schema/storage, publication boundary, public UI, database, legal-service, LLM, and scheduler behavior remain unchanged.

No database, scheduler, LLM, legal-service, answer-time retrieval, Fast, Legal Check, Premium, Phase-6, or ReasoningBank behavior changed.

Unresolved uncertainty: the live Home Affairs alert feed includes navigation/operational items alongside policy-like alerts, so future human review may need a separately approved curation rule. R2 intentionally does not infer legal importance, legal effect, or publication status.

Recommended next action: owner/reviewer inspect the uncommitted diff, then manually author any verified `PolicyEntry` only through the existing draft/review/publication workflow; do not promote candidate artifacts automatically.

## Review rule

The coding model must leave P11-003C changes uncommitted/unpushed. The owner will provide `git status --short` and `git diff --stat`; reviewer will then provide exact commit/push commands and inspect the GitHub diff after push.


## P11-003C-R3 correction

R3 corrected the reviewed Home Affairs provenance defect without adding a discovery surface. P11-003C is not yet VERIFIED.

Home Affairs alert URLs are now resolved against `page.finalUrl` before the existing HTTPS, exact-host, canonicalisation, and network-safety boundary runs. Root-relative, same-host absolute, and HTTPS protocol-relative URLs are accepted when safe; malformed, HTTP, and out-of-scope URLs are ignored. Alert URLs remain provenance pointers and are never fetched.

The synthetic Home Affairs fixture now includes relative, same-host absolute, protocol-relative, out-of-scope, missing, and duplicate alert URLs. The candidate metadata field is now `sourceMetadata.urlProvenance` with explicit kinds:

- `alert` — validated alert pointer;
- `seed` — explicit fallback when no safe alert URL exists;
- `fetched_page` — generic listing/sitemap/detail page that was actually fetched.

Changed files for R3:

- `chatbot/scripts/policy-intelligence-discovery.ts`
- `chatbot/lib/policy-intelligence-discovery.test.ts`
- `chatbot/scripts/fixtures/policy-intelligence-discovery/home-affairs.html`
- `chatbot/content/policy-intelligence/README.md`
- `docs/agent-memory/CURRENT_HANDOFF.md`

Validation:

- `pnpm test:unit`: **184 passed, 0 failed, 0 skipped** outside the sandbox; all R1/R2 tests remain passing and the focused discovery file contains 15 passing tests.
- `pnpm build`: **passed**.
- Changed-file Biome: **passed**.
- `git diff --check`: **passed**.
- `pnpm lint`: repository-wide known baseline of **22 diagnostics**, with no new discovery-file diagnostics.

R3 live Home Affairs dry-run: exit 0, runtime **787 ms**, 5 candidates. All five exposed specific resolved canonical URLs and `urlProvenance: "alert"` rather than the Student 500 seed:

- `Subclass 186` -> `https://immi.homeaffairs.gov.au/Visa-subsite/Pages/work/186-employer-nomination-scheme.aspx`
- `Skills in Demand 482 processing priorities` -> `https://immi.homeaffairs.gov.au/Visa-subsite/Pages/work/skills-in-demand-482-landing.aspx`
- `Employer Sponsored Regional 494 processing priorities` -> `https://immi.homeaffairs.gov.au/Visa-subsite/Pages/work/494-skilled-employer-regional-landing.aspx`
- `Discussion Paper: Reforming Australia's Settlement Grants Programs September 2026` -> `https://immi.homeaffairs.gov.au/settlement-services-subsite/Pages/SETS/overview.aspx`
- `Form Banners - SharePoint Migration Project` -> `https://immi.homeaffairs.gov.au/form-listing/Pages/niv-eoi.aspx`

No alert URL was fetched: the Home Affairs strategy still performs exactly one configured seed fetch, while deterministic tests record that the fetch target list contains only the seed URL. No publication, LLM, database, or `legal-service/` behavior changed.

Unresolved question: the live feed still includes operational/navigation alerts alongside policy-like alerts; R3 intentionally preserves them as raw non-public candidates and performs no legal-importance or publication inference.
