import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireOfficialPolicySource,
  normalizeOfficialHtmlEvidence,
  normalizeOfficialHtmlEvidenceDetails,
} from "../../scripts/policy-intelligence-acquisition";
import type { DiscoveryCandidate } from "../../scripts/policy-intelligence-discovery";

const candidate: DiscoveryCandidate = {
  schemaVersion: "policy-intelligence.discovery-candidate.v1",
  candidateId: "candidate-fixture",
  sourceConfigId: "home-affairs-guidance",
  authority: "Department of Home Affairs",
  canonicalUrl: "https://immi.homeaffairs.gov.au/policy/example",
  retrievedAt: "2026-09-30T00:00:00.000Z",
  contentType: "text/html",
  contentHash: "discovery-hash",
  discoveryStrategy: "home_affairs_site_alerts",
  sourceMetadata: {
    httpStatus: 200,
    redirectChain: [],
    urlProvenance: "alert",
  },
};
const body = `<!doctype html><html><head><title>Official page title</title><script>ignore this executable payload</script><style>.hidden { color:red }</style></head><body><h1>Official page title</h1><p>${"Bounded authoritative source text. ".repeat(12)}</p></body></html>`;
function fixtureFetch(
  status = 200,
  headers: Record<string, string> = {},
  html = body
) {
  return {
    fetchImpl: async () =>
      new Response(html, {
        status,
        headers: { "content-type": "text/html", ...headers },
      }),
    lookupHost: async () => ["203.0.113.10"],
  };
}

test("acquisition reuses allowlist and stores normalized bounded evidence rather than active HTML", async () => {
  const result = await acquireOfficialPolicySource({
    candidate,
    fetchOptions: fixtureFetch(),
    retrievedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.equal(result.officialTitle, "Official page title");
  assert.ok(result.normalizedEvidence.length >= 120);
  assert.doesNotMatch(
    result.normalizedEvidence,
    /ignore this executable payload|hidden|<script/i
  );
  assert.equal(result.contentHash.length, 64);
  assert.equal(result.effectiveDate, null);
  assert.equal(result.evidenceTruncated, false);
  assert.equal(result.sourceMetadata.evidenceTruncated, false);
});

test("short non-empty official evidence is accepted", async () => {
  const result = await acquireOfficialPolicySource({
    candidate: { ...candidate, discoveredTitle: "Official page title" },
    fetchOptions: fixtureFetch(
      200,
      {},
      "<html><body><p>Short official notice.</p></body></html>"
    ),
  });
  assert.match(result.normalizedEvidence, /Short official notice\./);
  assert.ok(result.normalizedEvidence.length < 120);
});

test("Home Affairs structured alert evidence is preserved regardless of detail length", async () => {
  const result = await acquireOfficialPolicySource({
    candidate: {
      ...candidate,
      discoveredTitle: "Official alert title",
      preview: "Official structured alert content from siteData.",
    },
    fetchOptions: fixtureFetch(
      200,
      {},
      `<html><body><p>${"Detailed official page text. ".repeat(20)}</p></body></html>`
    ),
  });
  assert.match(result.normalizedEvidence, /Official alert title/);
  assert.match(
    result.normalizedEvidence,
    /Official structured alert content from siteData\./
  );
  assert.match(result.normalizedEvidence, /Detailed official page text/);
  assert.equal(result.officialTitle, "Official alert title");
  assert.equal(result.contentHash.length, 64);
});

test("structured alert HTML is normalized before slicing and truncation is carried into snapshot metadata", async () => {
  const alertText = "Official alert content. &amp; ".repeat(30);
  const result = await acquireOfficialPolicySource({
    candidate: {
      ...candidate,
      discoveredTitle: "<strong>Official alert title</strong>",
      preview: `<p>${alertText}</p>`,
      sourceMetadata: {
        ...candidate.sourceMetadata,
        alertPreviewTruncated: true,
      },
    },
    fetchOptions: fixtureFetch(
      200,
      {},
      "<html><body>Detail page.</body></html>"
    ),
  });

  assert.equal(result.evidenceTruncated, true);
  assert.equal(result.sourceMetadata.evidenceTruncated, true);
  assert.match(result.normalizedEvidence, /Official alert title/);
  assert.match(result.normalizedEvidence, /Official alert content\. &/);
  assert.doesNotMatch(result.normalizedEvidence, /<\/?\w/);
  assert.equal(
    result.sourceMetadata.discoveryMetadata?.alertPreviewTruncated,
    true
  );
});

test("genuinely empty official evidence is still rejected", async () => {
  await assert.rejects(
    acquireOfficialPolicySource({
      candidate: {
        ...candidate,
        discoveredTitle: "Official page title",
        discoveryStrategy: "direct_page",
      },
      fetchOptions: fixtureFetch(
        200,
        {},
        "<html><head><script>executable text is not evidence</script></head><body></body></html>"
      ),
    }),
    /source_evidence_empty/
  );
});

test("oversized normalized source retains bounded evidence and explicit truncation", async () => {
  const oversized = `<html><head><title>Official page title</title></head><body>${"Policy text. ".repeat(12_000)}</body></html>`;
  const details = normalizeOfficialHtmlEvidenceDetails(oversized);
  assert.equal(details.evidenceTruncated, true);
  assert.equal(details.normalizedEvidence.length, 100_000);
  assert.equal(details.fullContentHash.length, 64);
  const result = await acquireOfficialPolicySource({
    candidate,
    fetchOptions: fixtureFetch(200, {}, oversized),
  });
  assert.equal(result.evidenceTruncated, true);
  assert.equal(result.sourceMetadata.evidenceTruncated, true);
  assert.equal(result.normalizedEvidence.length, 100_000);
});

test("unsafe candidate and redirected URL are rejected", async () => {
  await assert.rejects(
    acquireOfficialPolicySource({
      candidate: {
        ...candidate,
        canonicalUrl: "https://untrusted.example/private",
      },
      fetchOptions: fixtureFetch(),
    }),
    /not allowlisted/
  );
  let calls = 0;
  await assert.rejects(
    acquireOfficialPolicySource({
      candidate,
      fetchOptions: {
        ...fixtureFetch(),
        fetchImpl: () => {
          calls++;
          return Promise.resolve(
            Response.redirect("https://untrusted.example/escape")
          );
        },
      },
    }),
    /Redirect escaped/
  );
  assert.equal(calls, 1);
});

test("DNS, timeout, and response-byte protections remain enforced during acquisition", async () => {
  await assert.rejects(
    acquireOfficialPolicySource({
      candidate,
      fetchOptions: { ...fixtureFetch(), lookupHost: async () => ["10.1.2.3"] },
    }),
    /local or private/
  );
  await assert.rejects(
    acquireOfficialPolicySource({
      candidate,
      fetchOptions: {
        ...fixtureFetch(),
        timeoutMs: 10,
        fetchImpl: async () => new Promise<Response>(() => undefined),
      },
    }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "timeout"
  );
  await assert.rejects(
    acquireOfficialPolicySource({
      candidate,
      fetchOptions: {
        ...fixtureFetch(200, { "content-length": "9" }, "123456789"),
        maxResponseBytes: 8,
      },
    }),
    /exceeds/
  );
});

test("HTML normalizer decodes entities and keeps output bounded", () => {
  assert.equal(
    normalizeOfficialHtmlEvidence("<p>A &amp; B</p><script>bad</script>"),
    "A & B"
  );
});
