# Policy Intelligence Curation and Discovery

`registry.ts` is the server-only manual editorial registry. It remains empty
until a real official source has been verified and a human has approved a
typed `PolicyEntry`. Do not import it from a client component.

## Allowlisted discovery

The operator-only discovery implementation is in
`chatbot/scripts/policy-intelligence-discovery.ts`. Its initial configured
source IDs are:

- `home-affairs-guidance` — `immi.homeaffairs.gov.au` and its structured
  `siteData.alertItems` seed strategy;
- `federal-register-legislation` — `legislation.gov.au` and
  `www.legislation.gov.au`;
- `art-immigration-review` — `art.gov.au` and `www.art.gov.au`.

These hosts and seed families are grounded in the existing read-only official
source registry at `legal-service/app/services/official_source_registry.py`.
The TypeScript discovery tool does not import or depend on that Python module.

Run a bounded operator discovery dry-run with a configured source ID:

```bash
pnpm policy:discover -- --source home-affairs-guidance --dry-run
```

For deterministic local testing, use a structural fixture instead of the live
network:

```bash
pnpm policy:discover -- --source home-affairs-guidance --fixture synthetic-home-affairs --dry-run
```

Home Affairs discovery fetches only its configured seed page. It extracts the
`<script id="siteData" type="application/json">` payload, reads a bounded
number of `alertItems`, and stops. It does not use ordinary page-link fan-out
or fetch alert URLs. Alert URLs are first resolved against the fetched page's
final URL, so root-relative and protocol-relative values can be handled
without inventing a host. The resolved URL then passes the same HTTPS,
allowlist, canonicalisation, and network-safety checks as the seed. An alert
without a usable URL is explicitly tied to the configured seed instead.

Candidate `sourceMetadata.urlProvenance` is a provenance kind, not a legal
status: `alert` identifies a validated alert pointer, `seed` identifies an
explicit seed fallback, and `fetched_page` identifies a generic listing,
sitemap, or detail page that was actually fetched. Alert pointers are never
followed during discovery.

The command emits machine-readable candidate JSON to stdout and a concise
summary to stderr. `--write` is an explicit local-only alternative; it writes
non-public artifacts under `.local/policy-intelligence-candidates/`, which is
ignored by Git and never imported by the public application.

Discovery is acquisition/provenance only. Candidates use the versioned
`policy-intelligence.discovery-candidate.v1` contract and may contain the
allowlisted source identity, canonical URL, discovered title/date, retrieval
time, content type, bounded preview, fingerprint, HTTP metadata, and discovery
strategy. A candidate is not a `PolicyEntry` and does not contain source legal
status, AI analysis, bilingual policy copy, lawyer commentary, or publication
state.

The fetch boundary is HTTPS-only, exact-host allowlisted, manually redirect
revalidated, DNS-checked against local/private/link-local addresses, timeout
bounded across DNS, headers, and the complete decoded body, content-type
constrained, and response-size bounded. The general response limit remains
128 KiB; the one-page Home Affairs structured-alert strategy has a separate
hard decoded-body and total-run ceiling of 2 MiB because the configured seed
is approximately 1.43 MiB decoded. This is not a general 2 MiB-per-page
crawler.

Home Affairs `alertItems.updateDate` is retained only as raw
`sourceMetadata.alertUpdateDate`. It is never converted automatically into a
legal effective date, commencement date, source/legal status, or editorial
publication status. Candidates remain non-public discovery evidence and are
not `PolicyEntry` records.

There is no arbitrary URL mode, credential/cookie forwarding, generic Home
Affairs crawler, scheduler, runtime website write, or LLM call.

## Manual promotion workflow

Discovery never writes `registry.ts` and has no candidate publication function.
The only allowed handoff is:

```text
candidate
  -> human verifies the official source
  -> human manually authors/reviews a PolicyEntry
  -> draft or review_required
  -> human approval
  -> published public projection
```

Source/legal status and editorial publication status are separate. A proposed
policy remains legally `proposed` even if an approved editorial explanation is
published.

`officialExcerpt` is verbatim source text with its source language. AI
explanation is not official source text. Lawyer commentary is optional and must
only be added when real reviewed commentary exists. There is no automatic
publication and no runtime file editing in production.
