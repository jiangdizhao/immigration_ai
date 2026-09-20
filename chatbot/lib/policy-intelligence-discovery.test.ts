import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertOfficialUrlAllowed,
  candidateFromPage,
  canonicalizeOfficialUrl,
  DISCOVERY_CANDIDATE_SCHEMA,
  type DiscoveryFetchOptions,
  deduplicateCandidates,
  discoverPolicyCandidates,
  type FetchedOfficialPage,
  fetchOfficialPage,
  fingerprintContent,
  getPolicyDiscoverySource,
  parseListingLinks,
  parseSitemapLinks,
  stableCandidateId,
} from "../scripts/policy-intelligence-discovery";
import { validatePolicyEntries } from "./policy-intelligence";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(
  testDirectory,
  "../scripts/fixtures/policy-intelligence-discovery"
);

const publicLookup = async () => ["203.0.113.10"];

function response(
  body: string,
  contentType = "text/html",
  init: ResponseInit = {}
): Response {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": contentType,
      ...(init.headers ?? {}),
    },
  });
}

function fetchSequence(...responses: Response[]): DiscoveryFetchOptions {
  let index = 0;
  const fallback = responses.at(-1);
  if (!fallback) {
    throw new Error("fetchSequence requires at least one response");
  }
  return {
    fetchImpl: () => Promise.resolve(responses[index++] ?? fallback),
    lookupHost: publicLookup,
  };
}

test("only configured source IDs are accepted", () => {
  assert.equal(
    getPolicyDiscoverySource("home-affairs-guidance").authority,
    "Department of Home Affairs"
  );
  assert.throws(
    () => getPolicyDiscoverySource("arbitrary-user-url"),
    /Unknown policy discovery source/
  );
});

test("HTTPS and exact allowlisted hostnames are required", () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  assert.equal(
    assertOfficialUrlAllowed(
      "https://IMMI.HOMEAFFAIRS.GOV.AU/path#fragment",
      source
    ),
    "https://immi.homeaffairs.gov.au/path"
  );
  assert.throws(
    () =>
      assertOfficialUrlAllowed("http://immi.homeaffairs.gov.au/path", source),
    /HTTPS/
  );
  assert.throws(
    () => assertOfficialUrlAllowed("https://untrusted.example/path", source),
    /not allowlisted/
  );
  assert.throws(
    () => assertOfficialUrlAllowed("https://127.0.0.1/path", source),
    /not allowlisted|Local or IP-literal/
  );
  assert.throws(
    () => assertOfficialUrlAllowed("https://localhost/path", source),
    /not allowlisted|Local or IP-literal/
  );
});

test("private and link-local DNS destinations are rejected", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  for (const address of ["10.0.0.4", "169.254.1.1", "::1", "fe80::1"]) {
    const fetchOptions = fetchSequence(response("<html></html>"));
    fetchOptions.lookupHost = async () => [address];
    await assert.rejects(
      fetchOfficialPage(source.seedUrls[0], source, fetchOptions),
      /local or private/
    );
  }
});

test("redirects are revalidated against the source allowlist", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  await assert.rejects(
    fetchOfficialPage(
      source.seedUrls[0],
      source,
      fetchSequence(
        response("", "text/html", {
          status: 302,
          headers: { location: "https://untrusted.example/escape" },
        })
      )
    ),
    /Redirect escaped/
  );
  await assert.rejects(
    fetchOfficialPage(
      source.seedUrls[0],
      source,
      fetchSequence(
        response("", "text/html", {
          status: 302,
          headers: { location: "http://immi.homeaffairs.gov.au/insecure" },
        })
      )
    ),
    /Redirect escaped/
  );
});

test("response content type and byte limits are enforced", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  await assert.rejects(
    fetchOfficialPage(
      source.seedUrls[0],
      source,
      fetchSequence(response("{}", "application/json"))
    ),
    /Unsupported content type/
  );
  await assert.rejects(
    fetchOfficialPage(source.seedUrls[0], source, {
      ...fetchSequence(response("123456789")),
      maxResponseBytes: 8,
    }),
    /exceeds 8 bytes/
  );
});

test("URL, candidate ID, and content fingerprint canonicalisation is deterministic", () => {
  const url = "https://immi.homeaffairs.gov.au/path?utm_source=x&b=2&a=1#part";
  const canonical = "https://immi.homeaffairs.gov.au/path?a=1&b=2";
  assert.equal(canonicalizeOfficialUrl(url), canonical);
  assert.equal(canonicalizeOfficialUrl(url), canonicalizeOfficialUrl(url));
  assert.equal(fingerprintContent("fixture"), fingerprintContent("fixture"));
  assert.equal(
    stableCandidateId("source", canonical, fingerprintContent("fixture")),
    stableCandidateId("source", canonical, fingerprintContent("fixture"))
  );
});

test("local sitemap, listing, and detail fixtures parse without network access", () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const sitemapSource = getPolicyDiscoverySource(
    "federal-register-legislation"
  );
  const sitemap = readFileSync(
    resolve(fixtureDirectory, "sitemap.xml"),
    "utf8"
  );
  const listing = readFileSync(
    resolve(fixtureDirectory, "listing.html"),
    "utf8"
  );
  const detail = readFileSync(resolve(fixtureDirectory, "detail.html"), "utf8");
  assert.deepEqual(
    parseSitemapLinks(sitemap, sitemapSource.seedUrls[0], sitemapSource),
    [
      "https://www.legislation.gov.au/discovery-fixture/detail-one",
      "https://www.legislation.gov.au/discovery-fixture/detail-two",
    ]
  );
  assert.deepEqual(parseListingLinks(listing, source.seedUrls[0], source), [
    "https://immi.homeaffairs.gov.au/discovery-fixture/detail-one",
    "https://immi.homeaffairs.gov.au/discovery-fixture/detail-two",
  ]);
  const page: FetchedOfficialPage = {
    requestedUrl: source.seedUrls[0],
    finalUrl: "https://immi.homeaffairs.gov.au/discovery-fixture/detail-one",
    status: 200,
    contentType: "text/html",
    body: detail,
    bytes: Buffer.byteLength(detail),
    redirectChain: [],
  };
  const parsed = candidateFromPage(
    page,
    source,
    "2026-09-20T00:00:00.000Z",
    "listing_links"
  );
  assert.equal(parsed.discoveredTitle, "Synthetic official detail");
  assert.equal(parsed.explicitSourceDate, "2026-09-01");
  assert.match(parsed.preview ?? "", /Synthetic structural fixture/);
});

test("discovery is bounded, deduplicated, and produces non-public provenance candidates", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const listing = readFileSync(
    resolve(fixtureDirectory, "listing.html"),
    "utf8"
  );
  const detail = readFileSync(resolve(fixtureDirectory, "detail.html"), "utf8");
  let requestCount = 0;
  const result = await discoverPolicyCandidates({
    sourceId: source.id,
    now: () => "2026-09-20T00:00:00.000Z",
    fetchOptions: {
      lookupHost: publicLookup,
      fetchImpl: () => {
        requestCount += 1;
        return Promise.resolve(response(requestCount === 1 ? listing : detail));
      },
    },
    limits: { maxPages: 3, maxCandidates: 3 },
  });

  assert.equal(requestCount, 3);
  assert.equal(result.candidates.length, 3);
  for (const item of result.candidates) {
    assert.equal(item.schemaVersion, DISCOVERY_CANDIDATE_SCHEMA);
    assert.equal("sourceStatus" in item, false);
    assert.equal("aiAnalysis" in item, false);
    assert.equal("lawyerCommentary" in item, false);
    assert.equal("editorialStatus" in item, false);
    assert.ok(item.canonicalUrl.startsWith("https://"));
    assert.ok(item.contentHash.length > 0);
  }
  assert.equal(
    deduplicateCandidates([result.candidates[0], result.candidates[0]]).length,
    1
  );
});

test("production editorial registry remains empty and public modules do not import discovery", () => {
  const registry = readFileSync(
    resolve(testDirectory, "../content/policy-intelligence/registry.ts"),
    "utf8"
  );
  assert.match(
    registry,
    /MANUAL_POLICY_ENTRIES: readonly PolicyEntry\[\] = \[\];/
  );
  assert.doesNotThrow(() => validatePolicyEntries([]));
  for (const component of [
    "../components/immigration-service-home.tsx",
    "../components/policy-intelligence-page.tsx",
  ]) {
    const source = readFileSync(resolve(testDirectory, component), "utf8");
    assert.doesNotMatch(
      source,
      /policy-intelligence-discovery|policy-discover|candidates/
    );
  }
});
