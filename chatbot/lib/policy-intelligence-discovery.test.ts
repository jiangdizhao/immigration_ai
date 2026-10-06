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
  DISCOVERY_LIMITS,
  type DiscoveryFetchOptions,
  deduplicateCandidates,
  discoverPolicyCandidates,
  extractHomeAffairsSiteDataJson,
  type FetchedOfficialPage,
  fetchOfficialPage,
  fingerprintContent,
  getPolicyDiscoverySource,
  HOME_AFFAIRS_ALERT_LIMITS,
  parseArtNewsUpdateLinks,
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
  const federalSource = getPolicyDiscoverySource(
    "federal-register-legislation"
  );
  assert.equal(
    assertOfficialUrlAllowed(
      "https://api.prod.legislation.gov.au/v1/titles/search",
      federalSource
    ),
    "https://api.prod.legislation.gov.au/v1/titles/search"
  );
  assert.equal(
    assertOfficialUrlAllowed(
      "https://www.legislation.gov.au/F2026L00001/latest",
      federalSource
    ),
    "https://www.legislation.gov.au/F2026L00001/latest"
  );
  assert.throws(
    () =>
      assertOfficialUrlAllowed(
        "https://api.prod.legislation.gov.au.attacker.example/v1/titles/search",
        federalSource
      ),
    /not allowlisted/
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
  assert.equal(result.candidates.length, 4);
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
  assert.equal(result.candidates[0].canonicalUrl, source.seedUrls[0]);
  assert.equal(
    result.candidates[0].sourceMetadata.alertUpdateDate,
    "2026-09-05"
  );
  assert.equal(result.candidates[0].explicitSourceDate, undefined);
  assert.equal(result.candidates[0].sourceMetadata.urlProvenance, "seed");
  assert.equal(result.candidates[0].sourceMetadata.alertUrl, undefined);
  assert.equal(
    result.candidates[1].canonicalUrl,
    "https://immi.homeaffairs.gov.au/discovery-fixture/alert-three"
  );
  assert.equal(
    result.candidates[1].sourceMetadata.alertUpdateDate,
    "2026-09-03"
  );
  assert.equal(result.candidates[1].sourceMetadata.urlProvenance, "alert");
  assert.equal(
    result.candidates[2].canonicalUrl,
    "https://immi.homeaffairs.gov.au/discovery-fixture/alert-two"
  );
  assert.equal(result.candidates[2].sourceMetadata.urlProvenance, "alert");
  assert.equal(
    result.candidates[3].canonicalUrl,
    "https://immi.homeaffairs.gov.au/discovery-fixture/alert-one"
  );
  assert.equal(result.candidates[3].sourceMetadata.urlProvenance, "alert");
  assert.equal(
    result.candidates.filter((item) => item.canonicalUrl === source.seedUrls[0])
      .length,
    1
  );
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

test("Home Affairs alert HTML is normalized before preview truncation with provenance", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const content = `<p>${"Applicants are not stated as recipients. &amp; ".repeat(30)}</p>`;
  const html = `<script id="siteData" type="application/json">${JSON.stringify({
    alertItems: [
      {
        title: "<strong>Published guidance</strong>",
        content,
        urls: ["/discovery-fixture/guidance"],
      },
    ],
  })}</script>`;
  const result = await discoverPolicyCandidates({
    sourceId: source.id,
    now: () => "2026-10-06T00:00:00.000Z",
    fetchOptions: {
      lookupHost: publicLookup,
      fetchImpl: () => Promise.resolve(response(html)),
    },
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].discoveredTitle, "Published guidance");
  assert.equal(result.candidates[0].preview?.length, 500);
  assert.doesNotMatch(result.candidates[0].preview ?? "", /<\/?\w/);
  assert.match(result.candidates[0].preview ?? "", /&/);
  assert.equal(result.candidates[0].sourceMetadata.alertPreviewTruncated, true);
});

test("Home Affairs strips raw, encoded, and numeric-encoded alert markup", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const cases = [
    "<strong>Published guidance</strong>",
    "&lt;strong&gt;Published guidance&lt;/strong&gt;",
    "&#60;strong&#62;Published guidance&#60;/strong&#62;",
  ];
  const html = `<script id="siteData" type="application/json">${JSON.stringify({
    alertItems: cases.map((title, index) => ({
      title,
      content: `${title} &amp; updates`,
      url: `https://immi.homeaffairs.gov.au/markup-${index}`,
    })),
  })}</script>`;
  const result = await discoverPolicyCandidates({
    sourceId: source.id,
    now: () => "2026-10-06T00:00:00.000Z",
    fetchOptions: {
      lookupHost: publicLookup,
      fetchImpl: () => Promise.resolve(response(html)),
    },
  });

  assert.equal(result.candidates.length, 3);
  for (const candidate of result.candidates) {
    assert.equal(candidate.discoveredTitle, "Published guidance");
    assert.equal(candidate.preview, "Published guidance & updates");
    assert.doesNotMatch(candidate.discoveredTitle ?? "", /<[^>]*>/);
    assert.doesNotMatch(candidate.preview ?? "", /<[^>]*>/);
  }
});

test("Home Affairs fingerprints safe fallback metadata across deterministic discovery runs", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const discoverAlerts = (alertItems: Record<string, unknown>[]) => {
    const html = `<script id="siteData" type="application/json">${JSON.stringify(
      { alertItems }
    )}</script>`;
    return discoverPolicyCandidates({
      sourceId: source.id,
      now: () => "2026-10-06T00:00:00.000Z",
      fetchOptions: {
        lookupHost: publicLookup,
        fetchImpl: () => Promise.resolve(response(html)),
      },
    });
  };

  const emptyAlert = (category: string) => ({
    category,
    type: "notice",
    urls: ["https://untrusted.example/one"],
  });
  const fallbackA = await discoverAlerts([emptyAlert("visa")]);
  const fallbackB = await discoverAlerts([emptyAlert("study")]);
  const repeatedFallbackA = await discoverAlerts([emptyAlert("visa")]);
  assert.equal(fallbackA.candidates.length, 1);
  assert.equal(fallbackB.candidates.length, 1);
  assert.equal(fallbackA.candidates[0].canonicalUrl, source.seedUrls[0]);
  assert.notEqual(
    fallbackA.candidates[0].contentHash,
    fallbackB.candidates[0].contentHash
  );
  assert.equal(
    fallbackA.candidates[0].contentHash,
    repeatedFallbackA.candidates[0].contentHash
  );

  const common = "x".repeat(700);
  const makeLongAlert = (suffix: string) => ({
    title: "<strong>Same normalized title</strong>",
    content: `<p>${common} ${suffix}</p>`,
    urls: ["https://untrusted.example/one"],
  });
  const longResultA = await discoverAlerts([makeLongAlert("first")]);
  const longResultB = await discoverAlerts([makeLongAlert("second")]);
  assert.equal(longResultA.candidates.length, 1);
  assert.equal(longResultB.candidates.length, 1);
  assert.notEqual(
    longResultA.candidates[0].contentHash,
    longResultB.candidates[0].contentHash
  );
  assert.equal(
    longResultA.candidates[0].preview,
    longResultB.candidates[0].preview
  );
  assert.ok(
    longResultA.candidates.every((entry) => (entry.preview?.length ?? 0) <= 500)
  );
  assert.ok(
    longResultA.candidates.every((entry) => !/<\/?\w/.test(entry.preview ?? ""))
  );
});

test("Home Affairs canonical URL selection dedupe preserves alert URL slots", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const html = `<script id="siteData" type="application/json">${JSON.stringify({
    alertItems: [
      {
        category: "visa",
        updateDate: "2026-10-05",
        urls: ["https://untrusted.example/one"],
      },
      {
        category: "study",
        updateDate: "2026-10-04",
        urls: ["https://untrusted.example/two"],
      },
      {
        category: "policy",
        updateDate: "2026-10-03",
        title: "Valid alert URL",
        urls: ["/discovery-fixture/valid-alert"],
      },
    ],
  })}</script>`;
  const result = await discoverPolicyCandidates({
    sourceId: source.id,
    now: () => "2026-10-06T00:00:00.000Z",
    fetchOptions: {
      lookupHost: publicLookup,
      fetchImpl: () => Promise.resolve(response(html)),
    },
    limits: { maxCandidates: 2 },
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(
    result.candidates.filter((item) => item.canonicalUrl === source.seedUrls[0])
      .length,
    1
  );
  assert.ok(
    result.candidates.some(
      (item) =>
        item.canonicalUrl ===
        "https://immi.homeaffairs.gov.au/discovery-fixture/valid-alert"
    )
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

test("production discovery limits allow normal official pages and stay bounded", () => {
  assert.ok(DISCOVERY_LIMITS.maxResponseBytes >= 8 * 1024 * 1024);
  assert.ok(DISCOVERY_LIMITS.maxTotalBytes >= 32 * 1024 * 1024);
  assert.equal(DISCOVERY_LIMITS.requestTimeoutMs, 15_000);
  assert.equal(DISCOVERY_LIMITS.maxRuntimeMs, 60_000);
  assert.ok(HOME_AFFAIRS_ALERT_LIMITS.maxResponseBytes >= 8 * 1024 * 1024);
  assert.ok(HOME_AFFAIRS_ALERT_LIMITS.maxTotalBytes >= 32 * 1024 * 1024);
  assert.equal(DISCOVERY_LIMITS.maxPages, 4);
  assert.equal(DISCOVERY_LIMITS.maxLinksPerPage, 8);
  assert.equal(DISCOVERY_LIMITS.maxCandidates, 10);
});

test("Home Affairs response cap remains bounded at its raised default", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const cap = HOME_AFFAIRS_ALERT_LIMITS.maxResponseBytes;
  const page = await fetchOfficialPage(source.seedUrls[0], source, {
    lookupHost: publicLookup,
    fetchImpl: () => Promise.resolve(response("normal official page")),
  });
  assert.equal(page.bytes, Buffer.byteLength("normal official page"));

  await assert.rejects(
    fetchOfficialPage(source.seedUrls[0], source, {
      lookupHost: publicLookup,
      fetchImpl: () =>
        Promise.resolve(
          response("x", "text/html", {
            headers: { "content-length": String(cap + 1) },
          })
        ),
    }),
    new RegExp(`exceeds ${cap} bytes`)
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

test("generic sitemap, listing, and detail fixtures parse without network access", () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const sitemapSource = {
    ...source,
    allowedHostnames: ["www.legislation.gov.au"],
    seedUrls: ["https://www.legislation.gov.au/sitemap.xml"],
  };
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

function federalRecord(
  id: string,
  name: string,
  collection: "Act" | "LegislativeInstrument" | "NotifiableInstrument",
  asMadeRegisteredAt: string,
  departments: { name?: string; portfolio?: string }[] = [],
  isInForce = true
) {
  return {
    id,
    name,
    collection,
    status: isInForce ? "InForce" : "Registered",
    isInForce,
    asMadeRegisteredAt,
    administeringDepartments: departments,
  };
}

function federalApiFixture(
  records: ReturnType<typeof federalRecord>[],
  detailBodies: Record<string, string> = {}
) {
  const requested: string[] = [];
  const detailUrls: string[] = [];
  const fetchOptions: DiscoveryFetchOptions = {
    lookupHost: publicLookup,
    fetchImpl: (input) => {
      const url = new URL(String(input));
      requested.push(url.toString());
      if (url.hostname === "api.prod.legislation.gov.au") {
        const collection = url.pathname.match(
          /collection\((Act|LegislativeInstrument|NotifiableInstrument)\)/
        )?.[1];
        return Promise.resolve(
          response(
            JSON.stringify({
              value: records.filter(
                (record) => record.collection === collection
              ),
            }),
            "application/json"
          )
        );
      }
      detailUrls.push(url.toString());
      const registerId = url.pathname.split("/")[1];
      return Promise.resolve(
        response(
          detailBodies[registerId] ??
            "<html><head><title>Official Register detail</title></head><body><main>Official detail fixture.</main></body></html>"
        )
      );
    },
  };
  return { fetchOptions, requested, detailUrls };
}

test("Federal API retains Migration records at positions 13-15 behind newer unrelated records", async () => {
  const unrelated = Array.from({ length: 12 }, (_, index) =>
    federalRecord(
      `F2026L${String(10_000 + index).slice(-5)}`,
      `${["Health", "Treasury", "Defence"][index % 3]} Administration Instrument ${index}`,
      "LegislativeInstrument",
      new Date(Date.UTC(2026, 9, 6, 0, 0, 12 - index)).toISOString(),
      [{ name: "Department of Health", portfolio: "Health" }]
    )
  );
  const records = [
    ...unrelated,
    federalRecord(
      "F2026L01349",
      "Migration (Student Visa Applications) Amendment Instrument 2026",
      "LegislativeInstrument",
      "2026-10-05T23:00:00Z",
      [{ name: "Department of Home Affairs", portfolio: "Home Affairs" }],
      false
    ),
    federalRecord(
      "F2026L01348",
      "Migration Student Visa Applications Instrument 2026",
      "LegislativeInstrument",
      "2026-10-05T22:00:00Z",
      [{ name: "Department of Home Affairs", portfolio: "Home Affairs" }]
    ),
    federalRecord(
      "F2026L01347",
      "Migration Amendment Regulations 2026",
      "LegislativeInstrument",
      "2026-10-05T21:00:00Z",
      [{ name: "Department of Home Affairs", portfolio: "Home Affairs" }]
    ),
  ];
  const fixture = federalApiFixture(records);
  const result = await discoverPolicyCandidates({
    sourceId: "federal-register-legislation",
    now: () => "2026-10-06T00:00:00Z",
    fetchOptions: fixture.fetchOptions,
  });
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.canonicalUrl),
    [
      "https://www.legislation.gov.au/F2026L01349/latest",
      "https://www.legislation.gov.au/F2026L01348/latest",
      "https://www.legislation.gov.au/F2026L01347/latest",
    ]
  );
  assert.equal(
    result.candidates[0].sourceMetadata.federalRegisteredAt,
    "2026-10-05T23:00:00Z"
  );
  assert.equal(result.candidates[0].explicitSourceDate, undefined);
  assert.equal(result.candidates[0].discoveryStrategy, "federal_register_api");
  assert.equal(
    fixture.requested.filter((url) => url.includes("/titles/search")).length,
    3
  );
  const apiRequests = fixture.requested.filter((url) =>
    url.includes("/titles/search")
  );
  assert.deepEqual(
    apiRequests
      .map((url) => new URL(url).pathname.match(/collection\(([^)]+)\)/)?.[1])
      .sort(),
    ["Act", "LegislativeInstrument", "NotifiableInstrument"].sort()
  );
  for (const requestUrl of apiRequests) {
    const query = new URL(requestUrl).searchParams;
    assert.equal(query.get("$orderby"), "asMadeRegisteredAt desc");
    assert.equal(query.get("$expand"), "administeringDepartments");
    assert.equal(
      query.get("$select"),
      "id,name,collection,status,isInForce,asMadeRegisteredAt,administeringDepartments"
    );
    assert.equal(query.get("$top"), "64");
  }
  assert.ok(fixture.requested.every((url) => !url.includes("sitemap")));
});

test("Federal API admits cross-portfolio adjacent titles but not generic Home Affairs alone", async () => {
  const records = [
    federalRecord(
      "F2026L01340",
      "Overseas Student Transfers Instrument 2026",
      "LegislativeInstrument",
      "2026-10-06T02:00:00Z",
      [{ name: "Department of Education", portfolio: "Education" }]
    ),
    federalRecord(
      "F2026L01341",
      "Administrative Amendment Instrument 2026",
      "LegislativeInstrument",
      "2026-10-06T01:00:00Z",
      [{ name: "Department of Home Affairs", portfolio: "Home Affairs" }]
    ),
    federalRecord(
      "F2026L01342",
      "Migration Review Instrument 2026",
      "LegislativeInstrument",
      "2026-10-06T00:00:00Z",
      [{ name: "Department of Education", portfolio: "Education" }]
    ),
  ];
  const fixture = federalApiFixture(records);
  const result = await discoverPolicyCandidates({
    sourceId: "federal-register-legislation",
    fetchOptions: fixture.fetchOptions,
  });
  assert.deepEqual(
    result.candidates.map((item) => new URL(item.canonicalUrl).pathname),
    ["/F2026L01342/latest", "/F2026L01340/latest"]
  );
  assert.ok(
    fixture.detailUrls.includes(
      "https://www.legislation.gov.au/F2026L01341/latest"
    )
  );
});

test("Federal API rejects unrelated protection titles and generic Home Affairs records", async () => {
  const records = [
    federalRecord(
      "F2026A00010",
      "Environment Protection Amendment Act 2026",
      "Act",
      "2026-10-06T04:00:00Z"
    ),
    federalRecord(
      "F2026A00011",
      "Major Sporting Events (Indicia and Images) Protection Amendment Act 2026",
      "Act",
      "2026-10-06T03:00:00Z"
    ),
    federalRecord(
      "F2026N00012",
      "Social Security Nepal Flash Floods Assistance Determination 2026",
      "NotifiableInstrument",
      "2026-10-06T02:00:00Z",
      [{ name: "Department of Home Affairs", portfolio: "Home Affairs" }]
    ),
    federalRecord(
      "F2026N00013",
      "Home Affairs (Status of Forces Agreement—Fiji—Entry into Force) Notice 2026",
      "NotifiableInstrument",
      "2026-10-06T01:00:00Z",
      [{ name: "Department of Home Affairs", portfolio: "Home Affairs" }]
    ),
  ];
  const fixture = federalApiFixture(records);
  const result = await discoverPolicyCandidates({
    sourceId: "federal-register-legislation",
    fetchOptions: fixture.fetchOptions,
  });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(fixture.detailUrls, [
    "https://www.legislation.gov.au/F2026N00012/latest",
    "https://www.legislation.gov.au/F2026N00013/latest",
  ]);
});

test("Federal API retains generic Home Affairs titles confirmed by official parent authority", async () => {
  const authorities = [
    "Migration Act 1958",
    "Migration Regulations 1994",
    "Australian Citizenship Act 2007",
  ];
  const records = authorities.map((_, index) =>
    federalRecord(
      `F2026L${String(20_001 + index)}`,
      `Administrative Amendment Notice ${index}`,
      "LegislativeInstrument",
      new Date(Date.UTC(2026, 9, 6, 3 - index)).toISOString(),
      [{ name: "Department of Home Affairs", portfolio: "Home Affairs" }]
    )
  );
  const details = Object.fromEntries(
    authorities.map((authority, index) => [
      records[index].id,
      `<html><head><title>Administrative Amendment Notice ${index}</title></head><body><dl><dt>Authorised by</dt><dd>${authority}</dd></dl></body></html>`,
    ])
  );
  const fixture = federalApiFixture(records, details);
  const result = await discoverPolicyCandidates({
    sourceId: "federal-register-legislation",
    fetchOptions: fixture.fetchOptions,
  });
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.discoveredTitle),
    [
      "Administrative Amendment Notice 0",
      "Administrative Amendment Notice 1",
      "Administrative Amendment Notice 2",
    ]
  );
});

test("Federal API merges all collections and retains relevant not-in-force records", async () => {
  const records = [
    federalRecord(
      "F2026A00001",
      "Australian Citizenship Amendment Act 2026",
      "Act",
      "2026-10-06T03:00:00Z"
    ),
    federalRecord(
      "F2026L00001",
      "Migration Regulations Amendment 2026",
      "LegislativeInstrument",
      "2026-10-06T02:00:00Z",
      [],
      false
    ),
    federalRecord(
      "F2026N00001",
      "Refugee Protection Instrument 2026",
      "NotifiableInstrument",
      "2026-10-06T01:00:00Z"
    ),
  ];
  const fixture = federalApiFixture(records);
  const result = await discoverPolicyCandidates({
    sourceId: "federal-register-legislation",
    fetchOptions: fixture.fetchOptions,
  });
  assert.deepEqual(
    result.candidates.map((item) => new URL(item.canonicalUrl).pathname),
    ["/F2026A00001/latest", "/F2026L00001/latest", "/F2026N00001/latest"]
  );
  assert.equal(
    result.candidates[1].sourceMetadata.federalRegisteredAt,
    "2026-10-06T02:00:00Z"
  );
});

test("Federal API enforces per-collection, merged-frontier, detail, and candidate bounds", async () => {
  const records = [
    "Act",
    "LegislativeInstrument",
    "NotifiableInstrument",
  ].flatMap((collection, group) =>
    Array.from({ length: 8 }, (_, index) =>
      federalRecord(
        `F2026L${String(group * 100 + index + 1).padStart(5, "0")}`,
        `Migration Bound Fixture ${group}-${index}`,
        collection as "Act" | "LegislativeInstrument" | "NotifiableInstrument",
        new Date(
          Date.UTC(2026, 9, 6, 0, 0, 24 - group * 8 - index)
        ).toISOString()
      )
    )
  );
  const frontierFixture = federalApiFixture(records);
  const bounded = await discoverPolicyCandidates({
    sourceId: "federal-register-legislation",
    limits: {
      maxFederalRegisterApiResultsPerCollection: 5,
      maxFederalRegisterRecordFrontier: 4,
      maxFederalRegisterDetailPages: 20,
      maxCandidates: 10,
    },
    fetchOptions: frontierFixture.fetchOptions,
  });
  assert.equal(
    frontierFixture.requested.filter(
      (url) => new URL(url).searchParams.get("$top") === "5"
    ).length,
    3
  );
  assert.equal(frontierFixture.detailUrls.length, 4);
  assert.equal(bounded.candidates.length, 4);

  const detailFixture = federalApiFixture(records);
  await discoverPolicyCandidates({
    sourceId: "federal-register-legislation",
    limits: { maxFederalRegisterDetailPages: 2, maxCandidates: 10 },
    fetchOptions: detailFixture.fetchOptions,
  });
  assert.equal(detailFixture.detailUrls.length, 2);
  const candidateFixture = federalApiFixture(records);
  const candidateBounded = await discoverPolicyCandidates({
    sourceId: "federal-register-legislation",
    limits: { maxFederalRegisterDetailPages: 5, maxCandidates: 1 },
    fetchOptions: candidateFixture.fetchOptions,
  });
  assert.ok(candidateFixture.detailUrls.length <= 5);
  assert.equal(candidateBounded.candidates.length, 1);
});

test("Federal API malformed JSON and invalid schema fail with safe discovery errors", async () => {
  for (const body of [
    "{bad json",
    JSON.stringify({ value: [{ id: "F2026L00001" }] }),
  ]) {
    const fetchOptions: DiscoveryFetchOptions = {
      lookupHost: publicLookup,
      fetchImpl: () => Promise.resolve(response(body, "application/json")),
    };
    await assert.rejects(
      discoverPolicyCandidates({
        sourceId: "federal-register-legislation",
        fetchOptions,
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("Federal Register API") &&
        !error.message.includes(body)
    );
  }
});

test("Home Affairs ranks more than ten bounded alerts by safe updateDate parsing before applying the cap", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const alertItems = Array.from({ length: 12 }, (_, index) => {
    const day = index + 1;
    const dayText = String(day).padStart(2, "0");
    return {
      title: `Fixture update day ${dayText}`,
      content: "Non-public deterministic fixture.",
      updateDate: day === 12 ? "12/10/2026 12:03:28 AM" : `2026-10-${dayText}`,
      urls: [`/discovery-fixture/ranked/day-${dayText}`],
    };
  });
  const body =
    '<html><script id="siteData" type="application/json">' +
    JSON.stringify({ alertItems }) +
    "</script></html>";
  const result = await discoverPolicyCandidates({
    sourceId: source.id,
    limits: { maxCandidates: 10 },
    fetchOptions: {
      lookupHost: publicLookup,
      fetchImpl: () => Promise.resolve(response(body)),
    },
  });
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.discoveredTitle),
    Array.from({ length: 10 }, (_, index) => {
      const dayText = String(12 - index).padStart(2, "0");
      return `Fixture update day ${dayText}`;
    })
  );
  assert.equal(result.candidates.length, 10);
});

test("Home Affairs allocates one URL per ranked alert before filling spare capacity with secondary URLs", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const discoverAlerts = (count: number) => {
    const alertItems = Array.from({ length: count }, (_, index) => {
      const day = count - index;
      const dayText = String(day).padStart(2, "0");
      return {
        title: `Topic ${dayText}`,
        updateDate: `2026-10-${dayText}`,
        urls: [
          `/discovery-fixture/topic-${dayText}/primary`,
          `/discovery-fixture/topic-${dayText}/secondary`,
          `/discovery-fixture/topic-${dayText}/tertiary`,
        ],
      };
    });
    const body =
      '<html><script id="siteData" type="application/json">' +
      JSON.stringify({ alertItems }) +
      "</script></html>";
    return discoverPolicyCandidates({
      sourceId: source.id,
      limits: { maxCandidates: 10 },
      fetchOptions: {
        lookupHost: publicLookup,
        fetchImpl: () => Promise.resolve(response(body)),
      },
    });
  };

  const tenTopicResult = await discoverAlerts(12);
  assert.deepEqual(
    tenTopicResult.candidates.map((candidate) => candidate.discoveredTitle),
    Array.from(
      { length: 10 },
      (_, index) => `Topic ${String(12 - index).padStart(2, "0")}`
    )
  );
  assert.ok(
    tenTopicResult.candidates.every((candidate) =>
      candidate.canonicalUrl.endsWith("/primary")
    )
  );

  const spareCapacityResult = await discoverAlerts(6);
  assert.deepEqual(
    spareCapacityResult.candidates.map((candidate) => candidate.canonicalUrl),
    [
      ...Array.from({ length: 6 }, (_, index) => {
        const day = String(6 - index).padStart(2, "0");
        return `https://immi.homeaffairs.gov.au/discovery-fixture/topic-${day}/primary`;
      }),
      ...Array.from({ length: 4 }, (_, index) => {
        const day = String(6 - index).padStart(2, "0");
        return `https://immi.homeaffairs.gov.au/discovery-fixture/topic-${day}/secondary`;
      }),
    ]
  );
});

test("Home Affairs preserves stable ties and invalid dates, deduplicates URLs, and retains distinct URLs from one alert", async () => {
  const source = getPolicyDiscoverySource("home-affairs-guidance");
  const alertItems = [
    {
      title: "Undated first",
      updateDate: "not-a-date",
      urls: ["/discovery-fixture/undated-first"],
    },
    {
      title: "Tie first",
      updateDate: "2026-10-02",
      urls: ["/discovery-fixture/tie-first"],
    },
    {
      title: "Newest multi-url alert",
      updateDate: "2026-10-03",
      urls: [
        "/discovery-fixture/shared?utm_source=fixture",
        "/discovery-fixture/second-page",
        "/discovery-fixture/shared#duplicate",
      ],
    },
    {
      title: "Tie second",
      updateDate: "2026-10-02",
      urls: ["/discovery-fixture/tie-second"],
    },
    {
      title: "Undated second",
      updateDate: "31/02/2026",
      urls: ["/discovery-fixture/undated-second"],
    },
    {
      title: "Older duplicate URL",
      updateDate: "2026-10-01",
      urls: ["/discovery-fixture/shared"],
    },
  ];
  const body =
    '<html><script id="siteData" type="application/json">' +
    JSON.stringify({ alertItems }) +
    "</script></html>";
  const result = await discoverPolicyCandidates({
    sourceId: source.id,
    fetchOptions: {
      lookupHost: publicLookup,
      fetchImpl: () => Promise.resolve(response(body)),
    },
  });
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.canonicalUrl),
    [
      "https://immi.homeaffairs.gov.au/discovery-fixture/shared",
      "https://immi.homeaffairs.gov.au/discovery-fixture/tie-first",
      "https://immi.homeaffairs.gov.au/discovery-fixture/tie-second",
      "https://immi.homeaffairs.gov.au/discovery-fixture/undated-first",
      "https://immi.homeaffairs.gov.au/discovery-fixture/undated-second",
      "https://immi.homeaffairs.gov.au/discovery-fixture/second-page",
    ]
  );
  assert.equal(result.candidates[0]?.discoveredTitle, "Newest multi-url alert");
  assert.equal(result.candidates[5]?.discoveredTitle, "Newest multi-url alert");
  assert.equal(
    new Set(result.candidates.map((candidate) => candidate.canonicalUrl)).size,
    result.candidates.length
  );
});

test("ART news listing ranks strong topics first and retains dated news with unfamiliar titles", () => {
  const source = getPolicyDiscoverySource("art-immigration-review");
  const listing = readFileSync(
    resolve(fixtureDirectory, "art-news-updates.html"),
    "utf8"
  );
  const firstPass = parseArtNewsUpdateLinks(
    listing,
    source.seedUrls[0],
    source,
    3
  );
  const secondPass = parseArtNewsUpdateLinks(
    listing,
    source.seedUrls[0],
    source,
    3
  );
  assert.deepEqual(firstPass, secondPass);
  assert.deepEqual(
    firstPass.map((link) => link.canonicalUrl),
    [
      "https://www.art.gov.au/about-us/news-and-updates/student-review-process",
      "https://www.art.gov.au/about-us/news-and-updates/case-file-guidance",
      "https://www.art.gov.au/about-us/news-and-updates/practice-direction",
    ]
  );
  assert.deepEqual(
    firstPass.map((link) => link.sourceDate),
    ["2026-06-01", "2026-08-25", "2026-08-24"]
  );
  assert.equal(firstPass[1]?.title, "Keeping a complete case record");
  const fullBoundedSet = parseArtNewsUpdateLinks(
    listing,
    source.seedUrls[0],
    source,
    8
  );
  assert.ok(
    fullBoundedSet.some((link) => link.canonicalUrl.endsWith("/corporate-plan"))
  );
  assert.equal(
    fullBoundedSet.some((link) =>
      /contact-us|outside\.example/i.test(link.canonicalUrl)
    ),
    false
  );
});

test("discovery is bounded, deduplicated, and produces non-public provenance candidates", async () => {
  const source = getPolicyDiscoverySource("art-immigration-review");
  const listing = readFileSync(
    resolve(fixtureDirectory, "art-news-updates.html"),
    "utf8"
  );
  const detail =
    "<html><head><title>Fixture ART update detail</title></head><body></body></html>";
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
    limits: { maxPages: 4, maxCandidates: 3 },
  });

  assert.equal(requestCount, 4);
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(
    result.candidates.map((item) => item.sourceMetadata.urlProvenance),
    ["fetched_page", "fetched_page", "fetched_page"]
  );
  assert.deepEqual(
    result.candidates.map((item) => item.canonicalUrl),
    [
      "https://www.art.gov.au/about-us/news-and-updates/student-review-process",
      "https://www.art.gov.au/about-us/news-and-updates/case-file-guidance",
      "https://www.art.gov.au/about-us/news-and-updates/practice-direction",
    ]
  );
  assert.deepEqual(
    result.candidates.map((item) => item.explicitSourceDate),
    ["2026-06-01", "2026-08-25", "2026-08-24"]
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

test("production editorial registry contains reviewed official fallback and public modules do not import discovery", () => {
  const registry = readFileSync(
    resolve(testDirectory, "../content/policy-intelligence/registry.ts"),
    "utf8"
  );
  assert.match(registry, /manual-skilled-processing-priorities-2026-09-19/);
  assert.match(registry, /Department of Home Affairs/);
  assert.doesNotMatch(registry, /Synthetic policy source fixture/);
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
