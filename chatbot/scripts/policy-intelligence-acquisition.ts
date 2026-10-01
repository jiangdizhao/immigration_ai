import {
  assertOfficialUrlAllowed,
  candidateFromPage,
  type DiscoveryCandidate,
  type DiscoveryFetchOptions,
  type FetchedOfficialPage,
  fetchOfficialPage,
  fingerprintContent,
  getPolicyDiscoverySource,
} from "./policy-intelligence-discovery";

export const POLICY_ACQUISITION_LIMITS = {
  maxEvidenceCharacters: 100_000,
} as const;

export type OfficialSourceAcquisition = {
  sourceConfigId: string;
  sourceId: string;
  authority: string;
  canonicalUrl: string;
  officialTitle: string;
  retrievedAt: string;
  contentType: string;
  httpStatus: number;
  etag: string | null;
  lastModified: string | null;
  sourceDate: string | null;
  effectiveDate: string | null;
  evidenceTruncated: boolean;
  normalizedEvidence: string;
  contentHash: string;
  sourceMetadata: {
    requestedUrl: string;
    finalUrl: string;
    redirectChain: readonly string[];
    bytesReceived: number;
    evidenceTruncated: boolean;
    titleSource?: string;
    dateSource?: string;
    discoveryStrategy?: string;
    discoveryMetadata?: DiscoveryCandidate["sourceMetadata"];
  };
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const point = Number(decimal);
      return Number.isFinite(point) && point > 0 && point <= 0x10_ff_ff
        ? String.fromCodePoint(point)
        : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const point = Number.parseInt(hex, 16);
      return Number.isFinite(point) && point > 0 && point <= 0x10_ff_ff
        ? String.fromCodePoint(point)
        : " ";
    });
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return !(
        codePoint <= 8 ||
        codePoint === 11 ||
        codePoint === 12 ||
        (codePoint >= 14 && codePoint <= 31) ||
        codePoint === 127
      );
    })
    .join("");
}

export function normalizeOfficialHtmlEvidenceDetails(html: string): {
  normalizedEvidence: string;
  evidenceTruncated: boolean;
  fullContentHash: string;
} {
  const normalized = stripControlCharacters(
    decodeEntities(
      html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(
          /<(script|style|template|noscript|svg|iframe|object|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
          " "
        )
        .replace(
          /<(script|style|template|noscript|svg|iframe|object|form)\b[^>]*\/?\s*>/gi,
          " "
        )
        .replace(
          /<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/main|\/header|\/footer)\b[^>]*>/gi,
          "\n"
        )
        .replace(/<[^>]*>/g, " ")
    )
      .replace(/[\t\r ]+/g, " ")
      .replace(/ *\n+ */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
  return {
    normalizedEvidence: normalized.slice(
      0,
      POLICY_ACQUISITION_LIMITS.maxEvidenceCharacters
    ),
    evidenceTruncated:
      normalized.length > POLICY_ACQUISITION_LIMITS.maxEvidenceCharacters,
    fullContentHash: fingerprintContent(normalized),
  };
}

export function normalizeOfficialHtmlEvidence(html: string): string {
  return normalizeOfficialHtmlEvidenceDetails(html).normalizedEvidence;
}

export function createOfficialSourceSnapshotInput(input: {
  candidate: DiscoveryCandidate;
  fetchedPage: FetchedOfficialPage;
  retrievedAt?: string;
}): OfficialSourceAcquisition {
  const source = getPolicyDiscoverySource(input.candidate.sourceConfigId);
  const pageCandidate = candidateFromPage(
    input.fetchedPage,
    source,
    input.retrievedAt ?? new Date().toISOString(),
    input.candidate.discoveryStrategy
  );
  const normalized = normalizeOfficialHtmlEvidenceDetails(
    input.fetchedPage.body
  );
  const pageEvidence = normalized.normalizedEvidence;
  const useStructuredAlertEvidence =
    source.strategy === "home_affairs_site_alerts" &&
    input.candidate.discoveryStrategy === "home_affairs_site_alerts" &&
    pageEvidence.length < 120;
  const structuredAlertParts = useStructuredAlertEvidence
    ? [input.candidate.discoveredTitle, input.candidate.preview]
        .filter((part): part is string => typeof part === "string")
        .map((part) =>
          normalizeOfficialHtmlEvidenceDetails(part.slice(0, 500))
            .normalizedEvidence
        )
        .filter(Boolean)
    : [];
  const completeEvidence = [
    ...structuredAlertParts,
    ...(pageEvidence ? [pageEvidence] : []),
  ].join("\n\n");
  if (!completeEvidence) {
    throw new Error("source_evidence_empty");
  }
  const normalizedEvidence = completeEvidence.slice(
    0,
    POLICY_ACQUISITION_LIMITS.maxEvidenceCharacters
  );
  const evidenceTruncated =
    normalized.evidenceTruncated ||
    completeEvidence.length > POLICY_ACQUISITION_LIMITS.maxEvidenceCharacters;
  const contentHash = useStructuredAlertEvidence
    ? fingerprintContent(
        `${normalized.fullContentHash}\n${input.candidate.contentHash}\n${completeEvidence}`
      )
    : normalized.fullContentHash;
  const officialTitle =
    pageCandidate.discoveredTitle ?? input.candidate.discoveredTitle;
  if (!officialTitle?.trim()) {
    throw new Error("source_title_missing");
  }
  const canonicalUrl = assertOfficialUrlAllowed(
    input.fetchedPage.finalUrl,
    source
  );
  return {
    sourceConfigId: source.id,
    sourceId: input.candidate.candidateId,
    authority: source.authority,
    canonicalUrl,
    officialTitle: officialTitle.trim().slice(0, 500),
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    contentType: input.fetchedPage.contentType,
    httpStatus: input.fetchedPage.status,
    etag: input.fetchedPage.etag ?? null,
    lastModified: input.fetchedPage.lastModified ?? null,
    sourceDate:
      pageCandidate.explicitSourceDate ??
      input.candidate.explicitSourceDate ??
      null,
    effectiveDate: null,
    evidenceTruncated,
    normalizedEvidence,
    contentHash,
    sourceMetadata: {
      requestedUrl: input.fetchedPage.requestedUrl,
      finalUrl: canonicalUrl,
      redirectChain: input.fetchedPage.redirectChain,
      bytesReceived: input.fetchedPage.bytes,
      evidenceTruncated,
      titleSource: pageCandidate.sourceMetadata.titleSource,
      dateSource: pageCandidate.sourceMetadata.dateSource,
      discoveryStrategy: input.candidate.discoveryStrategy,
      discoveryMetadata: input.candidate.sourceMetadata,
    },
  };
}

export async function acquireOfficialPolicySource(input: {
  candidate: DiscoveryCandidate;
  fetchOptions?: DiscoveryFetchOptions;
  retrievedAt?: string;
}): Promise<OfficialSourceAcquisition> {
  const source = getPolicyDiscoverySource(input.candidate.sourceConfigId);
  const safeUrl = assertOfficialUrlAllowed(
    input.candidate.canonicalUrl,
    source
  );
  const fetchedPage = await fetchOfficialPage(
    safeUrl,
    source,
    input.fetchOptions
  );
  return createOfficialSourceSnapshotInput({
    candidate: input.candidate,
    fetchedPage,
    retrievedAt: input.retrievedAt,
  });
}
