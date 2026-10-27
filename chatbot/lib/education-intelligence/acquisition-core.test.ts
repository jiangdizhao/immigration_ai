import assert from "node:assert/strict";
import test from "node:test";
import {
  type AcquisitionDnsResolver,
  type AcquisitionTransportResponse,
  acquireEducationSource,
  type CandidateExtractor,
  type PinnedAcquisitionTransport,
} from "./acquisition-core";
import {
  ACQUISITION_FIXTURE_TIME,
  createAcquisitionManifest,
  createUnverifiedEducationDataset,
} from "./acquisition-fixtures";
import {
  assertSafeResolvedAddresses,
  canonicalizeManifestUrl,
  isUnsafeResolvedAddress,
} from "./acquisition-policy";
import { buildEducationAcquisitionReviewPacket } from "./acquisition-review";
import type { EducationDataset, EducationFieldValue } from "./contracts";
import { resolveEducationField } from "./field-resolution";
import { createSyntheticEducationFixture } from "./fixtures";
import type { EducationSourceManifest } from "./source-manifest";

const CONTENT =
  "<html><body>Synthetic course admission evidence is recorded here.</body></html>";
const PROVIDER_IP = "8.8.8.8";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function* stream(
  chunks: readonly Uint8Array[]
): AsyncGenerator<Uint8Array> {
  await Promise.resolve();
  for (const chunk of chunks) {
    yield chunk;
  }
}

function httpResponse(
  status = 200,
  body = CONTENT,
  headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
  },
  connectedAddress = PROVIDER_IP
): AcquisitionTransportResponse {
  const encoded = bytes(body);
  return {
    status,
    headers: { "content-length": String(encoded.byteLength), ...headers },
    connectedAddress,
    body: stream([encoded]),
  };
}

function fakePorts(
  options: {
    readonly respond?: (input: {
      url: string;
      requestIndex: number;
      resolvedAddresses: readonly string[];
    }) => AcquisitionTransportResponse | Promise<AcquisitionTransportResponse>;
    readonly resolve?: (
      hostname: string,
      resolveIndex: number
    ) => readonly string[] | Promise<readonly string[]>;
    readonly transportCapabilities?: Partial<
      PinnedAcquisitionTransport["capabilities"]
    >;
  } = {}
) {
  const counts = { dns: 0, transport: 0, networkRequest: 0, databaseWrite: 0 };
  const requests: {
    url: string;
    hostname: string;
    resolvedAddresses: readonly string[];
  }[] = [];
  const resolver: AcquisitionDnsResolver = {
    resolve: (hostname) => {
      counts.dns += 1;
      return Promise.resolve(
        options.resolve ? options.resolve(hostname, counts.dns) : [PROVIDER_IP]
      );
    },
  };
  const transport: PinnedAcquisitionTransport = {
    capabilities: {
      pinsResolvedAddress: true,
      validatesTlsHostname: true,
      followsRedirects: false,
      automaticDecompression: false,
      ...options.transportCapabilities,
    },
    request: (input) => {
      counts.transport += 1;
      counts.networkRequest += 1;
      requests.push({
        url: input.url,
        hostname: input.hostname,
        resolvedAddresses: input.resolvedAddresses,
      });
      if (options.respond) {
        return Promise.resolve(
          options.respond({
            url: input.url,
            requestIndex: counts.transport,
            resolvedAddresses: input.resolvedAddresses,
          })
        );
      }
      return Promise.resolve(
        httpResponse(200, CONTENT, undefined, input.resolvedAddresses[0])
      );
    },
  };
  return { ports: { resolver, transport }, counts, requests };
}

function candidateExtractor(input: {
  readonly fieldKey:
    | "COURSE_ADMISSIONS_CRITERIA"
    | "INSTITUTION_COURSE_CODE"
    | "CRICOS_COURSE_STATUS"
    | "DISCOVERY_REFERENCE"
    | "TUITION_FEE";
  readonly value: EducationFieldValue;
  readonly quote?: string;
  readonly targetId?: string;
  readonly locator?: string;
}): CandidateExtractor {
  return {
    mode: "DETERMINISTIC_RULES",
    parserVersion: "test-parser-v1",
    extract: () => [
      {
        target: { type: "COURSE", id: input.targetId ?? "course-demo" },
        fieldKey: input.fieldKey,
        value: input.value,
        quote:
          input.quote ??
          "Synthetic course admission evidence is recorded here.",
        locator: input.locator ?? "/body/course-evidence",
      },
    ],
  };
}

function orderedCandidateExtractor(
  allQuotes: readonly string[],
  outputQuotes: readonly string[] = allQuotes
): CandidateExtractor {
  const indexByQuote = new Map(allQuotes.map((quote, index) => [quote, index]));
  return {
    mode: "DETERMINISTIC_RULES",
    parserVersion: "test-parser-v1",
    extract: () =>
      outputQuotes.map((quote) => {
        const index = indexByQuote.get(quote);
        if (index === undefined) {
          throw new Error("Unknown synthetic candidate quote.");
        }
        return {
          target: { type: "COURSE", id: "course-demo" },
          fieldKey: "COURSE_ADMISSIONS_CRITERIA",
          value: {
            kind: "text",
            value: `TEST_ONLY_SYNTHETIC rule ${index}`,
          },
          quote,
          locator: `/synthetic/candidate-${index}`,
        };
      }),
  };
}

function syntheticCandidateQuotes(count: number, length: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const prefix = `${String(index).padStart(2, "0")}:`;
    return `${prefix}${"x".repeat(length - prefix.length)}`;
  });
}

function acquisition(
  input: {
    readonly manifest?: EducationSourceManifest;
    readonly baseDataset?: EducationDataset;
    readonly ports?: ReturnType<typeof fakePorts>;
    readonly attemptId?: string;
    readonly attemptedAt?: string;
    readonly extractor?: CandidateExtractor;
  } = {}
) {
  const baseDataset = input.baseDataset ?? createUnverifiedEducationDataset();
  const mock = input.ports ?? fakePorts();
  const manifest = input.manifest ?? createAcquisitionManifest();
  return {
    mock,
    promise: acquireEducationSource({
      attemptId: input.attemptId ?? "attempt-one",
      attemptedAt: input.attemptedAt ?? ACQUISITION_FIXTURE_TIME,
      manifest,
      baseDataset,
      ports: mock.ports,
      ...(input.extractor ? { extractor: input.extractor } : {}),
    }),
    baseDataset,
    manifest,
  };
}

function datasetAfter(
  base: EducationDataset,
  attempt: Awaited<ReturnType<typeof acquireEducationSource>>
): EducationDataset {
  return {
    ...base,
    sources:
      attempt.source &&
      !base.sources.some((item) => item.sourceId === attempt.source?.sourceId)
        ? [...base.sources, attempt.source]
        : base.sources,
    snapshots: attempt.snapshot
      ? [...base.snapshots, attempt.snapshot]
      : base.snapshots,
    observations: [...base.observations, ...attempt.candidateObservations],
  };
}

test("captured institution evidence is provenance-rich, unverified and only a pending review candidate", async () => {
  const { promise, baseDataset } = acquisition({
    extractor: candidateExtractor({
      fieldKey: "COURSE_ADMISSIONS_CRITERIA",
      value: {
        kind: "text",
        value: "Synthetic candidate admission condition.",
      },
    }),
  });
  const attempt = await promise;
  assert.equal(attempt.outcome, "CAPTURED");
  assert.equal(attempt.source?.recordClass, "UNVERIFIED");
  assert.equal(attempt.snapshot?.recordClass, "UNVERIFIED");
  assert.equal(attempt.candidateObservations.length, 1);
  assert.equal(attempt.candidateObservations[0].recordClass, "UNVERIFIED");
  assert.equal(
    attempt.candidateObservations[0].provenance.contentSha256,
    attempt.snapshot?.contentSha256
  );
  assert.equal(
    attempt.candidateObservations[0].provenance.sourceId,
    attempt.source?.sourceId
  );
  assert.equal(
    attempt.candidateObservations[0].provenance.snapshotId,
    attempt.snapshot?.snapshotId
  );
  assert.equal(
    attempt.snapshot?.contentExcerpt?.includes(
      attempt.candidateObservations[0].provenance.excerpt as string
    ),
    true
  );
  assert.equal(attempt.snapshot?.contentExcerpt?.includes("<html>"), false);

  const review = buildEducationAcquisitionReviewPacket({
    attempt,
    baseDataset,
    assessedAt: ACQUISITION_FIXTURE_TIME,
  });
  assert.equal(review.validation.ok, true);
  assert.equal(review.fieldSignals[0].status, "CANDIDATES_PENDING_REVIEW");
  assert.equal(review.fieldSignals[0].resolverStatus, "UNKNOWN");
  assert.equal(review.writePreview.insertCount, 3);
  assert.deepEqual(review.sideEffects, {
    networkRequestsByReview: 0,
    databaseWritesByReview: 0,
  });
  const unknownReview = buildEducationAcquisitionReviewPacket({
    attempt,
    baseDataset,
    assessedAt: ACQUISITION_FIXTURE_TIME,
    requestedFields: [
      {
        target: { type: "INTAKE", id: "intake-demo" },
        fieldKey: "APPLICATION_DEADLINE",
      },
    ],
  });
  assert.ok(
    unknownReview.fieldSignals.some(
      (signal) =>
        signal.fieldKey === "APPLICATION_DEADLINE" &&
        signal.status === "UNKNOWN"
    )
  );
  const projection = datasetAfter(baseDataset, attempt);
  assert.equal(
    resolveEducationField(
      projection,
      { type: "COURSE", id: "course-demo" },
      "COURSE_ADMISSIONS_CRITERIA",
      { assessedAt: ACQUISITION_FIXTURE_TIME, assessmentDate: "2026-10-27" }
    ).status,
    "UNKNOWN"
  );
});

test("CRICOS, Study Australia and institution observations stay within their authority domains", async () => {
  const cricos = acquisition({
    manifest: createAcquisitionManifest("CRICOS"),
    extractor: candidateExtractor({
      fieldKey: "CRICOS_COURSE_STATUS",
      value: { kind: "enum", value: "REGISTERED" },
    }),
  });
  const cricosAttempt = await cricos.promise;
  assert.equal(cricosAttempt.outcome, "CAPTURED");
  assert.equal(
    cricosAttempt.candidateObservations[0].claimDomain,
    "CRICOS_REGISTRATION"
  );

  const discovery = acquisition({
    manifest: createAcquisitionManifest("STUDY_AUSTRALIA"),
    extractor: candidateExtractor({
      fieldKey: "DISCOVERY_REFERENCE",
      value: { kind: "text", value: "Synthetic discovery reference." },
    }),
  });
  const discoveryAttempt = await discovery.promise;
  assert.equal(discoveryAttempt.outcome, "CAPTURED");
  assert.equal(
    discoveryAttempt.candidateObservations[0].claimDomain,
    "DISCOVERY"
  );

  const invalid = acquisition({
    manifest: createAcquisitionManifest("CRICOS"),
    extractor: candidateExtractor({
      fieldKey: "COURSE_ADMISSIONS_CRITERIA",
      value: { kind: "text", value: "Must have an English score." },
    }),
  });
  const invalidAttempt = await invalid.promise;
  assert.equal(invalidAttempt.outcome, "FAILED_PARSE");
  assert.equal(invalidAttempt.diagnostic?.code, "INVALID_CANDIDATE");
  assert.equal(invalidAttempt.snapshot?.acquisitionOutcome, "FAILED_PARSE");
  assert.equal(invalidAttempt.candidateObservations.length, 0);
});

test("unapproved, stale, denied or out-of-scope manifests do not resolve DNS or call transport", async () => {
  for (const manifest of [
    createAcquisitionManifest("INSTITUTION", {
      reviewState: "PROPOSED",
      enabled: false,
    }),
    createAcquisitionManifest("INSTITUTION", {
      accessReview: {
        ...createAcquisitionManifest().accessReview,
        asOf: "2026-01-01T00:00:00.000Z",
        reviewedAt: "2026-01-01T00:00:00.000Z",
      },
    }),
    createAcquisitionManifest("INSTITUTION", {
      accessReview: {
        ...createAcquisitionManifest().accessReview,
        accessDecision: "DENY",
      },
    }),
    createAcquisitionManifest("INSTITUTION", {
      canonicalUrl: "https://outside.example.edu/courses/catalog",
    }),
  ]) {
    const mock = fakePorts();
    const attempt = await acquireEducationSource({
      attemptId: "no-approval",
      attemptedAt: ACQUISITION_FIXTURE_TIME,
      manifest,
      baseDataset: createUnverifiedEducationDataset(),
      ports: mock.ports,
    });
    assert.equal(attempt.outcome, "BLOCKED");
    assert.equal(mock.counts.dns, 0);
    assert.equal(mock.counts.transport, 0);
  }
});

test("hostname and URL checks reject credentials, unsafe ports, path traversal, and disallowed redirects", async () => {
  const base = createAcquisitionManifest();
  assert.throws(() =>
    canonicalizeManifestUrl(
      base,
      "https://user:password@catalog.example.edu/courses/catalog"
    )
  );
  assert.throws(() =>
    canonicalizeManifestUrl(
      base,
      "https://catalog.example.edu:8443/courses/catalog"
    )
  );
  assert.throws(() =>
    canonicalizeManifestUrl(
      base,
      "https://catalog.example.edu/courses/%2e%2e/admin"
    )
  );
  const redirected = acquisition({
    ports: fakePorts({
      respond: ({ requestIndex }) =>
        requestIndex === 1
          ? httpResponse(302, "", {
              location: "https://outside.example.edu/courses/private",
            })
          : httpResponse(),
    }),
  });
  const result = await redirected.promise;
  assert.equal(result.outcome, "FAILED_FETCH");
  assert.equal(result.diagnostic?.code, "POLICY_REJECTED");
  assert.equal(redirected.mock.counts.transport, 1);
  const privateRedirect = acquisition({
    ports: fakePorts({
      respond: () =>
        httpResponse(302, "", {
          location: "https://127.0.0.1/courses/private",
        }),
    }),
  });
  assert.equal(
    (await privateRedirect.promise).diagnostic?.code,
    "POLICY_REJECTED"
  );
  assert.equal(privateRedirect.mock.counts.transport, 1);
});

test("diagnostic and redirect URLs redact path, query, fragment and credential secrets", async () => {
  const manifest = createAcquisitionManifest("INSTITUTION", {
    canonicalUrl:
      "https://catalog.example.edu/courses/private-invite/source-token?access_token=initial-query-secret",
  });
  const redirectedExactUrl =
    "https://catalog.example.edu/courses/invites/accept/invite-secret?token=redirect-query-secret";
  const redirected = acquisition({
    manifest,
    ports: fakePorts({
      respond: ({ requestIndex }) =>
        requestIndex === 1
          ? httpResponse(302, "", {
              location: `${redirectedExactUrl}#redirect-fragment-secret`,
            })
          : httpResponse(302, "", {
              location:
                "https://user-secret:password-secret@catalog.example.edu/courses/credentials/private?token=userinfo-query-secret#userinfo-fragment-secret",
            }),
    }),
  });
  const attempt = await redirected.promise;
  assert.equal(attempt.outcome, "FAILED_FETCH");
  assert.equal(attempt.diagnostic?.code, "POLICY_REJECTED");
  assert.equal(
    attempt.requestedUrl,
    "https://catalog.example.edu/[3 path segments redacted]"
  );
  assert.equal(
    attempt.finalUrl,
    "https://catalog.example.edu/[4 path segments redacted]"
  );
  assert.deepEqual(attempt.redirectEvidence, [
    "https://catalog.example.edu/[4 path segments redacted]",
  ]);
  const ordinaryDiagnostics = JSON.stringify({
    requestedUrl: attempt.requestedUrl,
    finalUrl: attempt.finalUrl,
    redirectEvidence: attempt.redirectEvidence,
    diagnostic: attempt.diagnostic,
  });
  for (const secret of [
    "private-invite",
    "source-token",
    "initial-query-secret",
    "invites",
    "accept",
    "invite-secret",
    "redirect-query-secret",
    "redirect-fragment-secret",
    "user-secret",
    "password-secret",
    "userinfo-query-secret",
    "userinfo-fragment-secret",
  ]) {
    assert.doesNotMatch(ordinaryDiagnostics, new RegExp(secret));
  }
  // Exact source URLs remain on the provenance snapshot, under its restricted
  // review contract, while diagnostic and redirect strings stay redacted.
  assert.equal(attempt.snapshot?.sourceUrl, redirectedExactUrl);

  const credentialedManifest = createAcquisitionManifest("INSTITUTION", {
    canonicalUrl:
      "https://manifest-user:manifest-password@catalog.example.edu/courses/catalog",
  });
  const credentialedAttempt = await acquisition({
    manifest: credentialedManifest,
  }).promise;
  assert.equal(credentialedAttempt.outcome, "BLOCKED");
  assert.doesNotMatch(
    JSON.stringify({
      diagnostic: credentialedAttempt.diagnostic,
      requestedUrl: credentialedAttempt.requestedUrl,
      finalUrl: credentialedAttempt.finalUrl,
      redirectEvidence: credentialedAttempt.redirectEvidence,
    }),
    /manifest-user|manifest-password/
  );
});

test("DNS rejects private and IPv4-mapped addresses; every redirect is re-resolved and pinned", async () => {
  for (const address of [
    "127.0.0.1",
    "10.2.3.4",
    "169.254.1.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2001:4860::1%eth0",
    "not-an-ip",
  ]) {
    assert.equal(isUnsafeResolvedAddress(address), true, address);
  }
  assert.deepEqual(
    [...assertSafeResolvedAddresses(["8.8.8.8", "1.1.1.1"])].sort(),
    ["1.1.1.1", "8.8.8.8"]
  );
  assert.throws(() => assertSafeResolvedAddresses(["8.8.8.8", "192.168.1.1"]));

  const rebinding = acquisition({
    ports: fakePorts({
      resolve: (_host, index) => (index === 1 ? ["8.8.8.8"] : ["10.0.0.5"]),
      respond: ({ requestIndex, resolvedAddresses }) =>
        requestIndex === 1
          ? httpResponse(
              302,
              "",
              { location: "/courses/revision" },
              resolvedAddresses[0]
            )
          : httpResponse(200, CONTENT, undefined, resolvedAddresses[0]),
    }),
  });
  const attempt = await rebinding.promise;
  assert.equal(attempt.outcome, "FAILED_FETCH");
  assert.equal(attempt.diagnostic?.code, "DNS_REJECTED");
  assert.equal(rebinding.mock.counts.transport, 1);
  assert.equal(rebinding.mock.requests.length, 1);

  const peerMismatch = acquisition({
    ports: fakePorts({
      respond: () => httpResponse(200, CONTENT, undefined, "1.1.1.1"),
    }),
  });
  assert.equal(
    (await peerMismatch.promise).diagnostic?.code,
    "PEER_ADDRESS_MISMATCH"
  );
});

test("slow DNS, slow response headers and slow body all terminate within the manifest deadline", async () => {
  const slowManifest = createAcquisitionManifest("INSTITUTION", {
    transportPolicy: {
      ...createAcquisitionManifest().transportPolicy,
      requestTimeoutMs: 100,
      totalTimeoutMs: 300,
    },
  });
  const slowDns = acquisition({
    manifest: slowManifest,
    ports: fakePorts({
      resolve: async () =>
        new Promise<readonly string[]>((_resolve) => {
          /* intentionally pending for deadline test */
        }),
    }),
  });
  const dnsResult = await slowDns.promise;
  assert.equal(dnsResult.diagnostic?.stage, "DNS");
  assert.equal(dnsResult.diagnostic?.code, "TIMEOUT");

  const slowHeaders = acquisition({
    manifest: slowManifest,
    ports: fakePorts({
      respond: async () =>
        new Promise<AcquisitionTransportResponse>((_resolve) => {
          /* intentionally pending for deadline test */
        }),
    }),
  });
  const headersResult = await slowHeaders.promise;
  assert.equal(headersResult.diagnostic?.stage, "HEADERS");
  assert.equal(headersResult.diagnostic?.code, "TIMEOUT");

  const slowBody = acquisition({
    manifest: slowManifest,
    ports: fakePorts({
      respond: () => ({
        status: 200,
        headers: { "content-type": "text/html" },
        connectedAddress: PROVIDER_IP,
        body: (async function* () {
          await new Promise((resolve) => setTimeout(resolve, 250));
          yield bytes(CONTENT);
        })(),
      }),
    }),
  });
  const bodyResult = await slowBody.promise;
  assert.equal(bodyResult.diagnostic?.stage, "BODY");
  assert.equal(bodyResult.diagnostic?.code, "TIMEOUT");
});

test("redirect loops, request and response-byte budgets fail without retaining response text", async () => {
  const loop = acquisition({
    ports: fakePorts({
      respond: ({ url }) => httpResponse(302, "", { location: url }),
    }),
  });
  assert.equal((await loop.promise).diagnostic?.code, "REDIRECT_LOOP");

  const oversizedManifest = createAcquisitionManifest("INSTITUTION", {
    transportPolicy: {
      ...createAcquisitionManifest().transportPolicy,
      maxResponseBytes: 1024,
      maxTotalBytes: 1024,
    },
  });
  const large = acquisition({
    manifest: oversizedManifest,
    ports: fakePorts({ respond: () => httpResponse(200, "x".repeat(1025)) }),
  });
  assert.equal((await large.promise).diagnostic?.code, "RESPONSE_TOO_LARGE");

  const totalManifest = createAcquisitionManifest("INSTITUTION", {
    transportPolicy: {
      ...createAcquisitionManifest().transportPolicy,
      maxResponseBytes: 1024,
      maxTotalBytes: 1024,
    },
  });
  const total = acquisition({
    manifest: totalManifest,
    ports: fakePorts({
      respond: ({ requestIndex, resolvedAddresses }) =>
        requestIndex === 1
          ? httpResponse(
              302,
              "r".repeat(700),
              { location: "/courses/next", "content-length": "700" },
              resolvedAddresses[0]
            )
          : httpResponse(
              200,
              "f".repeat(500),
              { "content-type": "text/html", "content-length": "500" },
              resolvedAddresses[0]
            ),
    }),
  });
  assert.equal((await total.promise).diagnostic?.code, "TOTAL_BYTES_EXCEEDED");
});

test("content-type, charset, encoding, UTF-8 and JSON failures are explicit bounded parse outcomes", async () => {
  const mismatch = acquisition({
    ports: fakePorts({
      respond: () =>
        httpResponse(200, "<html>", { "content-type": "application/pdf" }),
    }),
  });
  assert.equal(
    (await mismatch.promise).diagnostic?.code,
    "UNSUPPORTED_CONTENT_TYPE"
  );
  const charset = acquisition({
    ports: fakePorts({
      respond: () =>
        httpResponse(200, CONTENT, {
          "content-type": "text/html; charset=iso-8859-1",
        }),
    }),
  });
  assert.equal((await charset.promise).diagnostic?.code, "UNSUPPORTED_CHARSET");
  const encoded = acquisition({
    ports: fakePorts({
      respond: () =>
        httpResponse(200, CONTENT, {
          "content-type": "text/html",
          "content-encoding": "gzip",
        }),
    }),
  });
  assert.equal(
    (await encoded.promise).diagnostic?.code,
    "UNSUPPORTED_CONTENT_ENCODING"
  );
  const malformed = acquisition({
    ports: fakePorts({
      respond: () => ({
        status: 200,
        headers: { "content-type": "text/html" },
        connectedAddress: PROVIDER_IP,
        body: stream([new Uint8Array([0xc3, 0x28])]),
      }),
    }),
  });
  assert.equal((await malformed.promise).diagnostic?.code, "MALFORMED_UTF8");
  const jsonManifest = createAcquisitionManifest("INSTITUTION", {
    expectedDocumentType: "JSON",
  });
  const json = acquisition({
    manifest: jsonManifest,
    ports: fakePorts({
      respond: () =>
        httpResponse(200, "{broken", { "content-type": "application/json" }),
    }),
  });
  assert.equal((await json.promise).diagnostic?.code, "MALFORMED_JSON");

  const oversizedHeaders = Object.fromEntries(
    Array.from({ length: 65 }, (_value, index) => [`x-test-${index}`, "ok"])
  );
  const headerBudget = acquisition({
    ports: fakePorts({
      respond: () => httpResponse(200, CONTENT, oversizedHeaders),
    }),
  });
  assert.equal(
    (await headerBudget.promise).diagnostic?.code,
    "HEADERS_TOO_LARGE"
  );
});

test("candidate provenance, field scope, target scope and unsupported evidence fail safely", async () => {
  const noQuote = acquisition({
    extractor: candidateExtractor({
      fieldKey: "COURSE_ADMISSIONS_CRITERIA",
      value: { kind: "text", value: "Invented" },
      quote: "not in source",
    }),
  });
  assert.equal((await noQuote.promise).diagnostic?.code, "INVALID_CANDIDATE");
  const wrongProvider = acquisition({
    manifest: createAcquisitionManifest("INSTITUTION", {
      scope: { kind: "PROVIDER", providerId: "other-provider" },
    }),
    extractor: candidateExtractor({
      fieldKey: "COURSE_ADMISSIONS_CRITERIA",
      value: { kind: "text", value: "Candidate" },
    }),
  });
  assert.equal((await wrongProvider.promise).outcome, "BLOCKED");
  const wrongTarget = acquisition({
    extractor: candidateExtractor({
      fieldKey: "COURSE_ADMISSIONS_CRITERIA",
      value: { kind: "text", value: "Candidate" },
      targetId: "missing-course",
    }),
  });
  assert.equal(
    (await wrongTarget.promise).diagnostic?.code,
    "INVALID_CANDIDATE"
  );
});

test("synthetic and unverified evidence cannot cross entity boundaries or establish known information", async () => {
  const host = "pilot.cricos.example";
  const template = createAcquisitionManifest("CRICOS");
  const syntheticManifest = createAcquisitionManifest("CRICOS", {
    canonicalUrl: `https://${host}/courses/catalog`,
    approvedHosts: [host],
    authorityEvidence: {
      kind: "REGISTRY",
      title: "Synthetic CRICOS fixture",
      referenceUrl: `https://${host}/authority`,
    },
    accessReview: {
      ...template.accessReview,
      terms: { assessment: "ALLOW", evidenceUrl: `https://${host}/terms` },
      robots: {
        assessment: "ALLOW",
        evidenceUrl: `https://${host}/robots.txt`,
      },
    },
    syntheticFixture: true,
  });
  const mismatched = acquisition({
    manifest: syntheticManifest,
    extractor: candidateExtractor({
      fieldKey: "CRICOS_COURSE_STATUS",
      value: { kind: "enum", value: "REGISTERED" },
    }),
  });
  const result = await mismatched.promise;
  assert.equal(result.outcome, "FAILED_PARSE");
  assert.equal(result.snapshot?.recordClass, "SYNTHETIC");
  assert.equal(result.snapshot?.acquisitionOutcome, "FAILED_PARSE");
  assert.equal(result.candidateObservations.length, 0);

  const absent = acquisition({ extractor: undefined });
  const captured = await absent.promise;
  assert.equal(captured.outcome, "CAPTURED");
  assert.equal(captured.candidateObservations.length, 0);
  assert.equal(
    resolveEducationField(
      datasetAfter(absent.baseDataset, captured),
      { type: "COURSE", id: "course-demo" },
      "COURSE_ADMISSIONS_CRITERIA",
      { assessedAt: ACQUISITION_FIXTURE_TIME, assessmentDate: "2026-10-27" }
    ).status,
    "UNKNOWN"
  );
});

test("same titles do not merge providers; campuses and reused intake codes remain separately identified", async () => {
  const base = createUnverifiedEducationDataset();
  const scoped: EducationDataset = {
    ...base,
    providers: [
      ...base.providers,
      {
        providerId: "provider-two",
        recordClass: "UNVERIFIED",
        displayName: "Second Example Provider",
      },
    ],
    courses: [
      {
        ...base.courses[0],
        institutionCourseCode: "SAME-101",
        title: "Identical Course Title",
      },
      {
        courseId: "course-two",
        providerId: "provider-two",
        recordClass: "UNVERIFIED",
        institutionCourseCode: "SAME-101",
        title: "Identical Course Title",
      },
    ],
    deliveries: [
      { ...base.deliveries[0], campusId: "campus-main" },
      {
        deliveryId: "delivery-west",
        courseId: "course-demo",
        recordClass: "UNVERIFIED",
        campusId: "campus-west",
        mode: "ON_CAMPUS",
      },
      {
        deliveryId: "delivery-two",
        courseId: "course-two",
        recordClass: "UNVERIFIED",
        campusId: "campus-main",
        mode: "ON_CAMPUS",
      },
    ],
    intakes: [
      {
        ...base.intakes[0],
        intakeCode: "AUTUMN",
        year: 2027,
        startDate: "2027-02-01",
      },
      {
        intakeId: "intake-2028",
        deliveryId: "delivery-demo",
        recordClass: "UNVERIFIED",
        intakeCode: "AUTUMN",
        year: 2028,
        startDate: "2028-02-01",
      },
      {
        intakeId: "intake-second-provider",
        deliveryId: "delivery-two",
        recordClass: "UNVERIFIED",
        intakeCode: "AUTUMN",
        year: 2027,
        startDate: "2027-02-01",
      },
    ],
  };
  const result = acquisition({
    baseDataset: scoped,
    extractor: candidateExtractor({
      fieldKey: "COURSE_ADMISSIONS_CRITERIA",
      value: { kind: "text", value: "Provider one candidate." },
    }),
  });
  const attempt = await result.promise;
  const review = buildEducationAcquisitionReviewPacket({
    attempt,
    baseDataset: scoped,
    assessedAt: ACQUISITION_FIXTURE_TIME,
  });
  assert.equal(review.validation.ok, true);
  assert.equal(review.writePreview.insertCount, 3);
  assert.equal(
    review.identityWarnings.some((item) =>
      item.startsWith("course_identity_collision")
    ),
    false
  );
  assert.equal(
    scoped.courses.filter((course) => course.title === "Identical Course Title")
      .length,
    2
  );
  assert.equal(
    scoped.deliveries.filter((delivery) => delivery.courseId === "course-demo")
      .length,
    2
  );
  assert.equal(
    scoped.intakes.filter((intake) => intake.intakeCode === "AUTUMN").length,
    3
  );
});

test("different fee audiences and bases are retained as scoped candidates rather than collapsed", async () => {
  const feeCandidates: CandidateExtractor = {
    mode: "DETERMINISTIC_RULES",
    parserVersion: "fee-parser-v1",
    extract: () => [
      {
        target: { type: "COURSE", id: "course-demo" },
        fieldKey: "TUITION_FEE",
        value: {
          kind: "money",
          amount: 25_000,
          currency: "AUD",
          audience: "INTERNATIONAL",
          basis: "ANNUAL",
          year: 2027,
          inclusions: [],
        },
        quote: "Synthetic course admission evidence is recorded here.",
        locator: "/table/international",
      },
      {
        target: { type: "COURSE", id: "course-demo" },
        fieldKey: "TUITION_FEE",
        value: {
          kind: "money",
          amount: 9000,
          currency: "AUD",
          audience: "DOMESTIC",
          basis: "SEMESTER",
          year: 2027,
          period: "Semester 1",
          inclusions: [],
        },
        quote: "Synthetic course admission evidence is recorded here.",
        locator: "/table/domestic",
      },
    ],
  };
  const run = acquisition({ extractor: feeCandidates });
  const attempt = await run.promise;
  assert.equal(attempt.outcome, "CAPTURED");
  assert.equal(attempt.candidateObservations.length, 2);
  const review = buildEducationAcquisitionReviewPacket({
    attempt,
    baseDataset: run.baseDataset,
    assessedAt: ACQUISITION_FIXTURE_TIME,
  });
  assert.equal(review.fieldSignals[0].status, "CANDIDATES_PENDING_REVIEW");
  assert.deepEqual(
    attempt.candidateObservations.map((item) =>
      item.value?.kind === "money"
        ? [item.value.audience, item.value.basis, item.value.amount]
        : null
    ),
    [
      ["INTERNATIONAL", "ANNUAL", 25_000],
      ["DOMESTIC", "SEMESTER", 9000],
    ]
  );
});

test("the review projection can report stale synthetic candidates without promoting them", async () => {
  const fixture = createSyntheticEducationFixture("VET").dataset;
  const providerId = fixture.providers[0].providerId;
  const host = "pilot.institution.example";
  const template = createAcquisitionManifest("INSTITUTION");
  const manifest = createAcquisitionManifest("INSTITUTION", {
    sourceId: "synthetic-acquisition-source",
    proposalId: "synthetic-acquisition-proposal",
    scope: { kind: "PROVIDER", providerId },
    canonicalUrl: `https://${host}/courses/catalog`,
    approvedHosts: [host],
    authorityEvidence: {
      kind: "INSTITUTION_SITE",
      title: "Synthetic institution fixture",
      referenceUrl: `https://${host}/authority`,
    },
    accessReview: {
      ...template.accessReview,
      terms: { assessment: "ALLOW", evidenceUrl: `https://${host}/terms` },
      robots: {
        assessment: "ALLOW",
        evidenceUrl: `https://${host}/robots.txt`,
      },
    },
    syntheticFixture: true,
  });
  const courseId = fixture.courses[0].courseId;
  const run = acquisition({
    manifest,
    baseDataset: fixture,
    extractor: candidateExtractor({
      fieldKey: "INSTITUTION_COURSE_CODE",
      value: { kind: "text", value: "SYNTHETIC-CODE-1" },
      targetId: courseId,
    }),
  });
  const attempt = await run.promise;
  assert.equal(attempt.outcome, "CAPTURED");
  const review = buildEducationAcquisitionReviewPacket({
    attempt,
    baseDataset: fixture,
    assessedAt: "2026-10-30T00:00:00.000Z",
    maxAgeMsByField: { INSTITUTION_COURSE_CODE: 24 * 60 * 60 * 1000 },
  });
  assert.equal(review.validation.ok, true);
  assert.equal(review.fieldSignals[0].status, "STALE");
  assert.equal(review.fieldSignals[0].resolverStatus, "STALE");
  assert.equal(attempt.source?.recordClass, "SYNTHETIC");
});

test("source ID conflicts are reported in dry-run preview without network activity", async () => {
  const manifest = createAcquisitionManifest();
  const base = createUnverifiedEducationDataset();
  const oldUrl = "https://catalog.example.edu/courses/old";
  const withConflictingSource: EducationDataset = {
    ...base,
    sources: [
      {
        sourceId: manifest.sourceId,
        sourceFamily: "INSTITUTION",
        recordClass: "UNVERIFIED",
        authorityName: "Prior source identity",
        originalUrl: oldUrl,
        canonicalUrl: oldUrl,
        scope: manifest.scope,
        language: "en-AU",
        accessMode: "CURATED_REFERENCE",
      },
    ],
  };
  const mock = fakePorts();
  const attempt = await acquireEducationSource({
    attemptId: "source-conflict",
    attemptedAt: ACQUISITION_FIXTURE_TIME,
    manifest,
    baseDataset: withConflictingSource,
    ports: mock.ports,
  });
  assert.equal(attempt.outcome, "BLOCKED");
  assert.equal(attempt.diagnostic?.code, "IMMUTABLE_ID_CONFLICT");
  assert.equal(mock.counts.dns, 0);
  const review = buildEducationAcquisitionReviewPacket({
    attempt,
    baseDataset: withConflictingSource,
    assessedAt: ACQUISITION_FIXTURE_TIME,
  });
  assert.equal(review.writePreview.conflictCount, 1);
  assert.equal(review.writePreview.changes[0].table, "sources");
  assert.equal(review.sideEffects.databaseWritesByReview, 0);
});

test("repeated exact captures replay; A-B-A history and failed attempts remain distinct", async () => {
  const money = (amount: number): EducationFieldValue => ({
    kind: "money",
    amount,
    currency: "AUD",
    audience: "INTERNATIONAL",
    basis: "ANNUAL",
    year: 2027,
    inclusions: [],
  });
  const manifest = createAcquisitionManifest();
  const base = createUnverifiedEducationDataset();
  const capture = async (
    amount: number,
    attemptId: string,
    attemptedAt: string,
    previous: EducationDataset
  ) => {
    const run = acquisition({
      manifest,
      baseDataset: previous,
      attemptId,
      attemptedAt,
      extractor: candidateExtractor({
        fieldKey: "TUITION_FEE",
        value: money(amount),
        quote: "Synthetic course admission evidence is recorded here.",
      }),
    });
    return { attempt: await run.promise, base: previous };
  };
  const first = await capture(
    25_000,
    "attempt-a1",
    "2026-10-27T00:00:00.000Z",
    base
  );
  const afterFirst = datasetAfter(base, first.attempt);
  const replay = await capture(
    25_000,
    "attempt-a1",
    "2026-10-27T00:00:00.000Z",
    afterFirst
  );
  assert.equal(replay.attempt.outcome, "CAPTURED");
  assert.deepEqual(replay.attempt.snapshot, first.attempt.snapshot);
  assert.deepEqual(
    replay.attempt.candidateObservations,
    first.attempt.candidateObservations
  );
  const replayReview = buildEducationAcquisitionReviewPacket({
    attempt: replay.attempt,
    baseDataset: afterFirst,
    assessedAt: "2026-10-27T00:00:00.000Z",
  });
  assert.equal(replayReview.writePreview.replayCount, 3);
  assert.equal(replayReview.writePreview.insertCount, 0);

  const second = await capture(
    27_500,
    "attempt-b",
    "2026-10-28T00:00:00.000Z",
    afterFirst
  );
  const afterSecond = datasetAfter(afterFirst, second.attempt);
  const third = await capture(
    25_000,
    "attempt-a2",
    "2026-10-29T00:00:00.000Z",
    afterSecond
  );
  assert.equal(
    first.attempt.snapshot?.snapshotId === second.attempt.snapshot?.snapshotId,
    false
  );
  assert.equal(
    second.attempt.snapshot?.snapshotId === third.attempt.snapshot?.snapshotId,
    false
  );
  const history = [
    ...first.attempt.candidateObservations,
    ...second.attempt.candidateObservations,
    ...third.attempt.candidateObservations,
  ];
  assert.deepEqual(
    history.map((item) =>
      item.value?.kind === "money" ? item.value.amount : null
    ),
    [25_000, 27_500, 25_000]
  );
  assert.equal(
    new Set(history.map((item) => item.provenance.snapshotId)).size,
    3
  );
  const thirdReview = buildEducationAcquisitionReviewPacket({
    attempt: third.attempt,
    baseDataset: afterSecond,
    assessedAt: "2026-10-29T00:00:00.000Z",
  });
  assert.equal(thirdReview.fieldSignals[0].status, "CONFLICTED_CANDIDATES");
  assert.equal(thirdReview.fieldSignals[0].resolverStatus, "UNKNOWN");

  const failed = acquisition({
    manifest,
    baseDataset: afterSecond,
    attemptId: "attempt-failure",
    attemptedAt: "2026-10-30T00:00:00.000Z",
    ports: fakePorts({
      respond: () =>
        httpResponse(503, "secret body should not enter diagnostics"),
    }),
  });
  const failedAttempt = await failed.promise;
  assert.equal(failedAttempt.outcome, "FAILED_FETCH");
  assert.equal(failedAttempt.snapshot?.acquisitionOutcome, "FAILED_FETCH");
  assert.doesNotMatch(failedAttempt.diagnostic?.message ?? "", /secret|body/i);
  const failedReview = buildEducationAcquisitionReviewPacket({
    attempt: failedAttempt,
    baseDataset: afterSecond,
    assessedAt: "2026-10-30T00:00:00.000Z",
  });
  assert.equal(failedReview.writePreview.insertCount, 1);
  assert.equal(
    failedReview.proposed.snapshot?.acquisitionOutcome,
    "FAILED_FETCH"
  );
});

test("reusing an attempt ID rejects changed snapshot content and observation provenance", async () => {
  const base = createUnverifiedEducationDataset();
  const extractor = candidateExtractor({
    fieldKey: "COURSE_ADMISSIONS_CRITERIA",
    value: { kind: "text", value: "Synthetic admission candidate." },
    quote: "Synthetic course admission evidence is recorded here.",
  });
  const firstRun = acquisition({
    attemptId: "immutable-attempt",
    extractor,
    baseDataset: base,
  });
  const first = await firstRun.promise;
  assert.equal(first.outcome, "CAPTURED");
  const recorded = datasetAfter(base, first);
  const recordedSnapshots = structuredClone(recorded.snapshots);
  const recordedObservations = structuredClone(recorded.observations);

  const changedBody = acquisition({
    attemptId: "immutable-attempt",
    extractor,
    baseDataset: recorded,
    ports: fakePorts({
      respond: () =>
        httpResponse(
          200,
          `${CONTENT}<p>Revised response under the reused attempt ID.</p>`
        ),
    }),
  });
  const changedSnapshot = await changedBody.promise;
  assert.equal(changedSnapshot.outcome, "BLOCKED");
  assert.equal(changedSnapshot.diagnostic?.code, "IMMUTABLE_ID_CONFLICT");
  assert.equal(changedSnapshot.snapshot, undefined);
  assert.deepEqual(changedSnapshot.candidateObservations, []);

  const changedExcerpt = acquisition({
    attemptId: "immutable-attempt",
    extractor: candidateExtractor({
      fieldKey: "COURSE_ADMISSIONS_CRITERIA",
      value: { kind: "text", value: "Synthetic admission candidate." },
      quote: "course admission evidence is recorded",
    }),
    baseDataset: recorded,
  });
  const changedObservation = await changedExcerpt.promise;
  assert.equal(changedObservation.outcome, "BLOCKED");
  assert.equal(changedObservation.diagnostic?.code, "IMMUTABLE_ID_CONFLICT");
  assert.equal(changedObservation.snapshot, undefined);
  assert.deepEqual(changedObservation.candidateObservations, []);

  // A changed locator creates a different derived ID, but must still be
  // rejected because a snapshot's observation set is immutable as a whole.
  const changedLocator = acquisition({
    attemptId: "immutable-attempt",
    extractor: candidateExtractor({
      fieldKey: "COURSE_ADMISSIONS_CRITERIA",
      value: { kind: "text", value: "Synthetic admission candidate." },
      quote: "Synthetic course admission evidence is recorded here.",
      locator: "/body/revised-location",
    }),
    baseDataset: recorded,
  });
  const changedObservationSet = await changedLocator.promise;
  assert.equal(changedObservationSet.outcome, "BLOCKED");
  assert.equal(changedObservationSet.diagnostic?.code, "IMMUTABLE_ID_CONFLICT");
  assert.equal(changedObservationSet.snapshot, undefined);
  assert.deepEqual(recorded.snapshots, recordedSnapshots);
  assert.deepEqual(recorded.observations, recordedObservations);
});

test("M3-005-R1-01 snapshot evidence replay is deterministic when extractor candidate order changes", async () => {
  const base = createUnverifiedEducationDataset();
  const quotes = syntheticCandidateQuotes(2, 20);
  const body = quotes.join("\n");
  const manifest = createAcquisitionManifest();
  const firstRun = acquisition({
    manifest,
    baseDataset: base,
    attemptId: "candidate-order-replay",
    attemptedAt: ACQUISITION_FIXTURE_TIME,
    ports: fakePorts({ respond: () => httpResponse(200, body) }),
    extractor: orderedCandidateExtractor(quotes),
  });
  const first = await firstRun.promise;
  assert.equal(first.outcome, "CAPTURED");
  assert.equal(first.snapshot?.contentExcerpt, [...quotes].sort().join("\n"));

  const replayRun = acquisition({
    manifest,
    baseDataset: datasetAfter(base, first),
    attemptId: "candidate-order-replay",
    attemptedAt: ACQUISITION_FIXTURE_TIME,
    ports: fakePorts({ respond: () => httpResponse(200, body) }),
    extractor: orderedCandidateExtractor(quotes, [...quotes].reverse()),
  });
  const replay = await replayRun.promise;
  assert.equal(replay.outcome, "CAPTURED");
  assert.equal(replay.diagnostic?.code, undefined);
  assert.deepEqual(replay.snapshot, first.snapshot);
  assert.deepEqual(
    replay.candidateObservations
      .map((observation) => observation.observationId)
      .sort(),
    first.candidateObservations
      .map((observation) => observation.observationId)
      .sort()
  );
});

test("M3-005-R1-02 snapshot evidence overflow fails explicitly without a partial successful capture", async () => {
  const base = createUnverifiedEducationDataset();
  const manifest = createAcquisitionManifest();
  const capture = async (count: number) => {
    const quotes = syntheticCandidateQuotes(count, 500);
    const body = quotes.join("\n");
    const run = acquisition({
      manifest,
      baseDataset: base,
      attemptId: `bounded-evidence-${count}`,
      attemptedAt: ACQUISITION_FIXTURE_TIME,
      ports: fakePorts({ respond: () => httpResponse(200, body) }),
      extractor: orderedCandidateExtractor(quotes),
    });
    return { quotes, attempt: await run.promise };
  };

  const withinBound = await capture(8);
  assert.equal(withinBound.attempt.outcome, "CAPTURED");
  assert.equal(withinBound.attempt.snapshot?.contentExcerpt?.length, 4007);
  assert.ok(
    withinBound.attempt.candidateObservations.every((observation) =>
      withinBound.attempt.snapshot?.contentExcerpt?.includes(
        observation.provenance.excerpt ?? ""
      )
    )
  );
  assert.equal(withinBound.attempt.candidateObservations.length, 8);

  const overBound = await capture(9);
  assert.equal(overBound.attempt.outcome, "FAILED_PARSE");
  assert.equal(overBound.attempt.diagnostic?.code, "INVALID_CANDIDATE");
  assert.equal(overBound.attempt.snapshot?.acquisitionOutcome, "FAILED_PARSE");
  assert.equal(overBound.attempt.snapshot?.contentExcerpt, undefined);
  assert.deepEqual(overBound.attempt.candidateObservations, []);
});

test("the offline entrypoint uses only injected ports and rejects an unpinned adapter", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error("global fetch must remain unused");
  }) as typeof fetch;
  try {
    const unpinned = acquisition({
      ports: fakePorts({
        transportCapabilities: { pinsResolvedAddress: false },
      }),
    });
    const rejected = await unpinned.promise;
    assert.equal(rejected.outcome, "BLOCKED");
    assert.equal(unpinned.mock.counts.dns, 0);
    assert.equal(unpinned.mock.counts.transport, 0);

    const injected = acquisition();
    assert.equal((await injected.promise).outcome, "CAPTURED");
    assert.equal(fetchCalls, 0);
    assert.equal(injected.mock.counts.databaseWrite, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
