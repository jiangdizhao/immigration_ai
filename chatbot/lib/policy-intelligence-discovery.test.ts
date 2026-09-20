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
  extractHomeAffairsSiteDataJson,
  type FetchedOfficialPage,
  fetchOfficialPage,
  fingerprintContent,
  getPolicyDiscoverySource,
  HOME_AFFAIRS_ALERT_LIMITS,
  parseHomeAffairsAlertItems,
  parseListingLinks,
  parseSitemapLinks,
  resolveHomeAffairsAlertUrl,
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
  for (const address of [
    "10.0.0.4",
    "169.254.1.1",
    "192.168.1.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.1.1",
    "::ffff:192.168.1.1",
  ]) {
    const fetchOptions = fetchSequence(response("<html></html>"));
    fetchOptions.lookupHost = async () => [address];
    await assert.rejects(
      fetchOfficialPage(source.seedUrls[0], source, fetchOptions),
      /local or private/
    );
  }
});

test("the request timeout interrupts a body that never finishes", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const hangingBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("<html>"));
    },
    pull() {
      return new Promise<void>(() => {
        // Intentionally never resolves: the request deadline must cancel it.
      });
    },
  });
  const startedAt = Date.now();

  await assert.rejects(
    fetchOfficialPage(source.seedUrls[0], source, {
      lookupHost: publicLookup,
      fetchImpl: () =>
        Promise.resolve(
          new Response(hangingBody, {
            status: 200,
            headers: { "content-type": "text/html" },
          })
        ),
      timeoutMs: 20,
    }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "timeout"
  );
  assert.ok(Date.now() - startedAt < 500);
});

test("a delayed DNS safety lookup cannot bypass the request timeout", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const startedAt = Date.now();

  await assert.rejects(
    fetchOfficialPage(source.seedUrls[0], source, {
      lookupHost: () =>
        new Promise<string[]>(() => {
          // Intentionally never resolves: the request deadline must win.
        }),
      fetchImpl: () => {
        throw new Error("HTTP fetch must not start after DNS timeout");
      },
      timeoutMs: 20,
    }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "timeout"
  );
  assert.ok(Date.now() - startedAt < 500);
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

test("Home Affairs uses one bounded structured-alert seed fetch", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  assert.equal(source.strategy, "home_affairs_site_alerts");
  const fixture = readFileSync(
    resolve(fixtureDirectory, "home-affairs.html"),
    "utf8"
  );
  const largeFixture = fixture.replace(
    "</body>",
    `${"x".repeat(1_400_000)}</body>`
  );
  let requestCount = 0;
  const requestedUrls: string[] = [];
  const fetchOptions: DiscoveryFetchOptions = {
    lookupHost: publicLookup,
    fetchImpl: (input) => {
      requestCount += 1;
      requestedUrls.push(String(input));
      return Promise.resolve(response(largeFixture));
    },
  };
  const result = await discoverPolicyCandidates({
    sourceId: source.id,
    now: () => "2026-09-20T00:00:00.000Z",
    fetchOptions,
    limits: { maxCandidates: 10 },
  });

  assert.equal(requestCount, 1);
  assert.deepEqual(requestedUrls, [source.seedUrls[0]]);
  assert.equal(result.candidates.length, 5);
  assert.ok(largeFixture.length > 1_400_000);
  assert.ok(
    result.candidates.every(
      (item) => item.discoveryStrategy === "home_affairs_site_alerts"
    )
  );
  assert.ok(
    result.candidates.every(
      (item) => !item.canonicalUrl.includes("untrusted.example")
    )
  );
  assert.equal(
    result.candidates[0].canonicalUrl,
    "https://immi.homeaffairs.gov.au/discovery-fixture/alert-one"
  );
  assert.equal(
    result.candidates[0].sourceMetadata.alertUpdateDate,
    "2026-09-01"
  );
  assert.equal(result.candidates[0].explicitSourceDate, undefined);
  assert.equal(result.candidates[0].sourceMetadata.urlProvenance, "alert");
  assert.equal(
    result.candidates[1].canonicalUrl,
    "https://immi.homeaffairs.gov.au/discovery-fixture/alert-two"
  );
  assert.equal(result.candidates[1].sourceMetadata.urlProvenance, "alert");
  assert.equal(
    result.candidates[2].canonicalUrl,
    "https://immi.homeaffairs.gov.au/discovery-fixture/alert-three"
  );
  assert.equal(result.candidates[2].sourceMetadata.urlProvenance, "alert");
  assert.equal(result.candidates[3].sourceMetadata.urlProvenance, "seed");
  assert.equal(result.candidates[3].sourceMetadata.alertUrl, undefined);
  assert.equal(result.candidates[4].sourceMetadata.urlProvenance, "seed");
  assert.equal(result.candidates[0].sourceMetadata.alertCategory, "fixture");
  assert.equal(result.candidates[0].sourceMetadata.alertType, "synthetic");
  assert.equal(
    new Set(result.candidates.map((candidate) => candidate.candidateId)).size,
    result.candidates.length
  );

  const repeated = await discoverPolicyCandidates({
    sourceId: source.id,
    now: () => "2026-09-20T00:00:00.000Z",
    fetchOptions: {
      ...fetchOptions,
      fetchImpl: () => Promise.resolve(response(fixture)),
    },
    limits: { maxCandidates: 10 },
  });
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.candidateId),
    repeated.candidates.map((candidate) => candidate.candidateId)
  );
  assert.equal(
    parseHomeAffairsAlertItems(fixture, 1).length,
    1,
    "alert examination is bounded"
  );
});

test("Home Affairs alert URLs resolve safely without becoming fetch targets", () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const baseUrl = source.seedUrls[0];
  assert.equal(
    resolveHomeAffairsAlertUrl(
      "/Visa-subsite/Pages/work/186-employer-nomination-scheme.aspx",
      baseUrl,
      source
    ),
    "https://immi.homeaffairs.gov.au/Visa-subsite/Pages/work/186-employer-nomination-scheme.aspx"
  );
  assert.equal(
    resolveHomeAffairsAlertUrl(
      "https://immi.homeaffairs.gov.au/absolute-alert",
      baseUrl,
      source
    ),
    "https://immi.homeaffairs.gov.au/absolute-alert"
  );
  assert.equal(
    resolveHomeAffairsAlertUrl(
      "//immi.homeaffairs.gov.au/protocol-relative-alert",
      baseUrl,
      source
    ),
    "https://immi.homeaffairs.gov.au/protocol-relative-alert"
  );
  assert.equal(
    resolveHomeAffairsAlertUrl(
      "//immi.homeaffairs.gov.au/http-base-is-not-accepted",
      "http://immi.homeaffairs.gov.au/seed",
      source
    ),
    undefined
  );
  assert.equal(
    resolveHomeAffairsAlertUrl(
      "https://untrusted.example.invalid/out-of-scope",
      baseUrl,
      source
    ),
    undefined
  );
  assert.equal(
    resolveHomeAffairsAlertUrl("http://[invalid", baseUrl, source),
    undefined
  );
  assert.equal(resolveHomeAffairsAlertUrl("", baseUrl, source), undefined);
});

test("Home Affairs decoded response cap is source-specific and hard-bounded", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const belowCap = "x".repeat(HOME_AFFAIRS_ALERT_LIMITS.maxResponseBytes - 1);
  const page = await fetchOfficialPage(source.seedUrls[0], source, {
    lookupHost: publicLookup,
    fetchImpl: () => Promise.resolve(response(belowCap)),
  });
  assert.equal(page.bytes, HOME_AFFAIRS_ALERT_LIMITS.maxResponseBytes - 1);
  await assert.rejects(
    fetchOfficialPage(source.seedUrls[0], source, {
      lookupHost: publicLookup,
      fetchImpl: () =>
        Promise.resolve(
          response("x".repeat(HOME_AFFAIRS_ALERT_LIMITS.maxResponseBytes + 1))
        ),
    }),
    /exceeds 2097152 bytes/
  );
});

test("Home Affairs siteData extraction fails safely for missing, malformed, and non-array data", () => {
  assert.equal(extractHomeAffairsSiteDataJson("<html></html>"), undefined);
  assert.deepEqual(
    parseHomeAffairsAlertItems(
      '<script id="siteData" type="application/json">not-json</script>'
    ),
    []
  );
  assert.deepEqual(
    parseHomeAffairsAlertItems(
      '<script type="application/json" id="siteData">{"alertItems":{}}</script>'
    ),
    []
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
  assert.equal(parsed.sourceMetadata.urlProvenance, "seed");
});

test("discovery is bounded, deduplicated, and produces non-public provenance candidates", async () => {
  const source = getPolicyDiscoverySource("art-immigration-review");
  const listing = readFileSync(
    resolve(fixtureDirectory, "listing.html"),
    "utf8"
  );
  const artListing = listing.replaceAll(
    "immi.homeaffairs.gov.au",
    "www.art.gov.au"
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
        return Promise.resolve(
          response(requestCount === 1 ? artListing : detail)
        );
      },
    },
    limits: { maxPages: 3, maxCandidates: 3 },
  });

  assert.equal(requestCount, 3);
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(
    result.candidates.map((item) => item.sourceMetadata.urlProvenance),
    ["seed", "fetched_page", "fetched_page"]
  );
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
