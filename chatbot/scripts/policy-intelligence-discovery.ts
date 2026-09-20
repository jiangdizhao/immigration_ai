import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const DISCOVERY_CANDIDATE_SCHEMA =
  "policy-intelligence.discovery-candidate.v1" as const;

export const DISCOVERY_LIMITS = {
  maxPages: 4,
  maxLinksPerPage: 8,
  maxCandidates: 10,
  maxAlertItems: 100,
  maxTotalBytes: 256_000,
  maxResponseBytes: 128_000,
  maxPreviewCharacters: 500,
  maxRedirects: 3,
  requestTimeoutMs: 5000,
  maxRuntimeMs: 15_000,
} as const;

export const HOME_AFFAIRS_ALERT_LIMITS = {
  maxPages: 1,
  maxLinksPerPage: 1,
  maxCandidates: DISCOVERY_LIMITS.maxCandidates,
  maxAlertItems: DISCOVERY_LIMITS.maxAlertItems,
  maxTotalBytes: 2 * 1024 * 1024,
  maxResponseBytes: 2 * 1024 * 1024,
} as const;

export type DiscoveryLimits = Partial<
  Record<keyof typeof DISCOVERY_LIMITS, number>
>;

const ACCEPTED_CONTENT_TYPES = new Set([
  "application/xhtml+xml",
  "application/xml",
  "text/html",
  "text/xml",
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type DiscoveryStrategy =
  | "direct_page"
  | "listing_links"
  | "sitemap_links"
  | "home_affairs_site_alerts";

export type PolicyDiscoverySource = {
  id: string;
  authority: string;
  allowedHostnames: readonly string[];
  seedUrls: readonly string[];
  strategy: DiscoveryStrategy;
  topicHint?: string;
};

export type DiscoveryCandidate = {
  schemaVersion: typeof DISCOVERY_CANDIDATE_SCHEMA;
  candidateId: string;
  sourceConfigId: string;
  authority: string;
  canonicalUrl: string;
  discoveredTitle?: string;
  explicitSourceDate?: string;
  retrievedAt: string;
  contentType: string;
  preview?: string;
  contentHash: string;
  etag?: string;
  lastModified?: string;
  discoveryStrategy: DiscoveryStrategy;
  sourceMetadata: {
    httpStatus: number;
    redirectChain: readonly string[];
    titleSource?: "title" | "og:title" | "h1";
    dateSource?: "time" | "meta";
    alertCategory?: string;
    alertType?: string;
    alertUpdateDate?: string;
    alertUrl?: string;
    urlProvenance: "alert" | "seed" | "fetched_page";
  };
};

export type DiscoveryRunResult = {
  schemaVersion: typeof DISCOVERY_CANDIDATE_SCHEMA;
  sourceConfigId: string;
  candidates: DiscoveryCandidate[];
};

export type DiscoveryFetchErrorCode =
  | "invalid_url"
  | "disallowed_host"
  | "unsafe_network"
  | "redirect_limit"
  | "unsafe_redirect"
  | "timeout"
  | "http_error"
  | "unsupported_content_type"
  | "response_too_large"
  | "runtime_limit"
  | "invalid_source";

export class DiscoveryError extends Error {
  readonly code: DiscoveryFetchErrorCode;

  constructor(code: DiscoveryFetchErrorCode, message: string) {
    super(message);
    this.name = "DiscoveryError";
    this.code = code;
  }
}

export const POLICY_DISCOVERY_SOURCES: readonly PolicyDiscoverySource[] = [
  {
    id: "home-affairs-guidance",
    authority: "Department of Home Affairs",
    allowedHostnames: ["immi.homeaffairs.gov.au"],
    seedUrls: [
      "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
    ],
    strategy: "home_affairs_site_alerts",
    topicHint: "visa_guidance",
  },
  {
    id: "federal-register-legislation",
    authority: "Federal Register of Legislation",
    allowedHostnames: ["legislation.gov.au", "www.legislation.gov.au"],
    seedUrls: ["https://www.legislation.gov.au/sitemap.xml"],
    strategy: "sitemap_links",
    topicHint: "legislation",
  },
  {
    id: "art-immigration-review",
    authority: "Administrative Review Tribunal",
    allowedHostnames: ["art.gov.au", "www.art.gov.au"],
    seedUrls: [
      "https://www.art.gov.au/applying-review/immigration-and-citizenship",
    ],
    strategy: "listing_links",
    topicHint: "review_procedure",
  },
] as const;

export function getPolicyDiscoverySource(
  sourceId: string
): PolicyDiscoverySource {
  const source = POLICY_DISCOVERY_SOURCES.find((item) => item.id === sourceId);
  if (!source) {
    throw new DiscoveryError(
      "invalid_source",
      `Unknown policy discovery source: ${sourceId}`
    );
  }
  return source;
}

export function canonicalizeOfficialUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new DiscoveryError("invalid_url", `Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new DiscoveryError(
      "invalid_url",
      `Only credential-free HTTPS URLs are accepted: ${rawUrl}`
    );
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.port === "443") {
    parsed.port = "";
  }
  parsed.hash = "";

  const keptParameters = [...parsed.searchParams.entries()]
    .filter(([key]) => !/^(utm_|fbclid$|gclid$)/i.test(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      `${leftKey}=${leftValue}`.localeCompare(`${rightKey}=${rightValue}`)
    );
  parsed.search = "";
  for (const [key, value] of keptParameters) {
    parsed.searchParams.append(key, value);
  }

  if (!parsed.pathname) {
    parsed.pathname = "/";
  }

  return parsed.toString();
}

function isUnsafeIpv4Address(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return true;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first >= 224 && first <= 255)
  );
}

function isUnsafeNetworkAddress(address: string): boolean {
  let normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) {
    return isUnsafeIpv4Address(normalized);
  }
  if (isIP(normalized) !== 6) {
    return true;
  }

  const lastColon = normalized.lastIndexOf(":");
  const ipv4Tail = normalized.slice(lastColon + 1);
  if (ipv4Tail.includes(".")) {
    const octets = ipv4Tail.split(".").map(Number);
    if (
      octets.length !== 4 ||
      octets.some(
        (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255
      )
    ) {
      return true;
    }
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = normalized.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missingGroups = 8 - left.length - right.length;
  const groups = [
    ...left,
    ...Array.from({ length: Math.max(0, missingGroups) }, () => "0"),
    ...right,
  ].map((group) => Number.parseInt(group || "0", 16));
  if (groups.length !== 8 || groups.some((group) => !Number.isFinite(group))) {
    return true;
  }

  const firstGroup = groups[0];
  const isUnspecifiedOrLoopback =
    groups.slice(0, 7).every((group) => group === 0) && groups[7] <= 1;
  const isLinkLocal = (firstGroup & 0xff_c0) === 0xfe_80;
  const isUniqueLocal = (firstGroup & 0xfe_00) === 0xfc_00;
  const isMulticast = (firstGroup & 0xff_00) === 0xff_00;
  if (isUnspecifiedOrLoopback || isLinkLocal || isUniqueLocal || isMulticast) {
    return true;
  }

  if (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xff_ff
  ) {
    const high = groups[6].toString(16).padStart(4, "0");
    const low = groups[7].toString(16).padStart(4, "0");
    return isUnsafeIpv4Address(
      `${Number.parseInt(high.slice(0, 2), 16)}.${Number.parseInt(
        high.slice(2),
        16
      )}.${Number.parseInt(low.slice(0, 2), 16)}.${Number.parseInt(
        low.slice(2),
        16
      )}`
    );
  }

  return false;
}

async function defaultLookupHost(hostname: string): Promise<string[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
}

export function assertOfficialUrlAllowed(
  rawUrl: string,
  source: PolicyDiscoverySource
): string {
  const canonicalUrl = canonicalizeOfficialUrl(rawUrl);
  const parsed = new URL(canonicalUrl);
  const hostname = parsed.hostname.toLowerCase();

  if (!source.allowedHostnames.includes(hostname)) {
    throw new DiscoveryError(
      "disallowed_host",
      `Host is not allowlisted for ${source.id}: ${hostname}`
    );
  }
  if (parsed.port && parsed.port !== "443") {
    throw new DiscoveryError(
      "invalid_url",
      `Non-standard HTTPS port is not accepted: ${canonicalUrl}`
    );
  }
  if (hostname === "localhost" || isIP(hostname) > 0) {
    throw new DiscoveryError(
      "unsafe_network",
      `Local or IP-literal destinations are not accepted: ${hostname}`
    );
  }

  return canonicalUrl;
}

export type DiscoveryFetchOptions = {
  fetchImpl?: typeof fetch;
  lookupHost?: (hostname: string) => Promise<string[]>;
  maxResponseBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
};

function responseByteLimitForSource(source: PolicyDiscoverySource): number {
  return source.strategy === "home_affairs_site_alerts"
    ? HOME_AFFAIRS_ALERT_LIMITS.maxResponseBytes
    : DISCOVERY_LIMITS.maxResponseBytes;
}

export type FetchedOfficialPage = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  bytes: number;
  etag?: string;
  lastModified?: string;
  redirectChain: readonly string[];
};

function contentTypeWithoutParameters(value: string | null): string {
  return (value ?? "").split(";", 1)[0].trim().toLowerCase();
}

class DiscoveryTimeoutError extends Error {}

function withAbortDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DiscoveryTimeoutError());
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DiscoveryTimeoutError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
}

async function readBoundedBody(
  response: Response,
  maxResponseBytes: number,
  signal: AbortSignal
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxResponseBytes) {
    throw new DiscoveryError(
      "response_too_large",
      `Response exceeds ${maxResponseBytes} bytes`
    );
  }

  if (!response.body) {
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > maxResponseBytes) {
      throw new DiscoveryError(
        "response_too_large",
        `Response exceeds ${maxResponseBytes} bytes`
      );
    }
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const cancelOnAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancelOnAbort, { once: true });
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      totalBytes += result.value.byteLength;
      if (totalBytes > maxResponseBytes) {
        throw new DiscoveryError(
          "response_too_large",
          `Response exceeds ${maxResponseBytes} bytes`
        );
      }
      chunks.push(result.value);
    }
  } finally {
    signal.removeEventListener("abort", cancelOnAbort);
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function fetchOfficialPage(
  rawUrl: string,
  source: PolicyDiscoverySource,
  options: DiscoveryFetchOptions = {}
): Promise<FetchedOfficialPage> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupHost = options.lookupHost ?? defaultLookupHost;
  const responseByteLimit = responseByteLimitForSource(source);
  const maxResponseBytes = Math.min(
    responseByteLimit,
    Math.max(1, options.maxResponseBytes ?? responseByteLimit)
  );
  const maxRedirects = Math.min(
    DISCOVERY_LIMITS.maxRedirects,
    Math.max(0, options.maxRedirects ?? DISCOVERY_LIMITS.maxRedirects)
  );
  const timeoutMs = Math.min(
    DISCOVERY_LIMITS.requestTimeoutMs,
    Math.max(1, options.timeoutMs ?? DISCOVERY_LIMITS.requestTimeoutMs)
  );
  let currentUrl = assertOfficialUrlAllowed(rawUrl, source);
  const redirectChain: string[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (
      let redirectCount = 0;
      redirectCount <= maxRedirects;
      redirectCount += 1
    ) {
      const parsed = new URL(currentUrl);
      const resolvedAddresses = await withAbortDeadline(
        Promise.resolve().then(() => lookupHost(parsed.hostname)),
        controller.signal
      );
      if (resolvedAddresses.some(isUnsafeNetworkAddress)) {
        throw new DiscoveryError(
          "unsafe_network",
          `Destination resolves to a local or private address: ${parsed.hostname}`
        );
      }

      const response = await withAbortDeadline(
        Promise.resolve().then(() =>
          fetchImpl(currentUrl, {
            method: "GET",
            redirect: "manual",
            credentials: "omit",
            headers: {
              Accept:
                "text/html, application/xhtml+xml, application/xml, text/xml",
              "User-Agent": "ImmigrationAI-PolicyDiscovery/1.0",
            },
            signal: controller.signal,
          })
        ),
        controller.signal
      );

      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirectCount === maxRedirects) {
          throw new DiscoveryError(
            "redirect_limit",
            `Redirect limit exceeded for ${rawUrl}`
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new DiscoveryError(
            "unsafe_redirect",
            `Redirect has no Location header: ${currentUrl}`
          );
        }
        const nextUrl = new URL(location, currentUrl).toString();
        try {
          currentUrl = assertOfficialUrlAllowed(nextUrl, source);
        } catch (error) {
          if (error instanceof DiscoveryError) {
            throw new DiscoveryError(
              "unsafe_redirect",
              `Redirect escaped the source allowlist: ${nextUrl}`
            );
          }
          throw error;
        }
        redirectChain.push(currentUrl);
        continue;
      }

      if (!response.ok) {
        throw new DiscoveryError(
          "http_error",
          `Official source returned HTTP ${response.status}: ${currentUrl}`
        );
      }

      const contentType = contentTypeWithoutParameters(
        response.headers.get("content-type")
      );
      if (!ACCEPTED_CONTENT_TYPES.has(contentType)) {
        throw new DiscoveryError(
          "unsupported_content_type",
          `Unsupported content type ${contentType || "(missing)"}: ${currentUrl}`
        );
      }

      const bytes = await withAbortDeadline(
        readBoundedBody(response, maxResponseBytes, controller.signal),
        controller.signal
      );
      return {
        requestedUrl: assertOfficialUrlAllowed(rawUrl, source),
        finalUrl: currentUrl,
        status: response.status,
        contentType,
        body: new TextDecoder().decode(bytes),
        bytes: bytes.byteLength,
        etag: response.headers.get("etag") ?? undefined,
        lastModified: response.headers.get("last-modified") ?? undefined,
        redirectChain,
      };
    }

    throw new DiscoveryError(
      "redirect_limit",
      `Redirect limit exceeded: ${rawUrl}`
    );
  } catch (error) {
    if (error instanceof DiscoveryTimeoutError || controller.signal.aborted) {
      throw new DiscoveryError(
        "timeout",
        `Request timed out after ${timeoutMs}ms: ${currentUrl}`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripMarkup(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(source: string, expression: RegExp): string | undefined {
  return source.match(expression)?.[1]?.trim() || undefined;
}

function metaContent(body: string, keyPattern: RegExp): string | undefined {
  for (const match of body.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = match[1];
    const key = firstMatch(
      attributes,
      /(?:name|property)\s*=\s*["']([^"']+)["']/i
    );
    if (!keyPattern.test(key ?? "")) {
      continue;
    }
    const content = firstMatch(attributes, /content\s*=\s*["']([^"']*)["']/i);
    if (content) {
      return content;
    }
  }
  return undefined;
}

export function parseSitemapLinks(
  xml: string,
  baseUrl: string,
  source: PolicyDiscoverySource,
  maxLinks: number = DISCOVERY_LIMITS.maxLinksPerPage
): string[] {
  const links: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    if (links.length >= maxLinks) {
      break;
    }
    try {
      const canonicalUrl = assertOfficialUrlAllowed(
        new URL(decodeHtmlEntities(match[1]), baseUrl).toString(),
        source
      );
      if (!links.includes(canonicalUrl)) {
        links.push(canonicalUrl);
      }
    } catch {
      // Ignore malformed or out-of-scope links; the configured source remains
      // the authority boundary for this operator run.
    }
  }
  return links;
}

export function parseListingLinks(
  html: string,
  baseUrl: string,
  source: PolicyDiscoverySource,
  maxLinks: number = DISCOVERY_LIMITS.maxLinksPerPage
): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi
  )) {
    if (links.length >= maxLinks) {
      break;
    }
    try {
      const canonicalUrl = assertOfficialUrlAllowed(
        new URL(decodeHtmlEntities(match[1]), baseUrl).toString(),
        source
      );
      if (!links.includes(canonicalUrl)) {
        links.push(canonicalUrl);
      }
    } catch {
      // Ignore malformed or out-of-scope links.
    }
  }
  return links;
}

export function resolveHomeAffairsAlertUrl(
  rawUrl: string,
  baseUrl: string,
  source: PolicyDiscoverySource
): string | undefined {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return undefined;
  }
  try {
    const resolvedUrl = new URL(
      decodeHtmlEntities(trimmedUrl),
      baseUrl
    ).toString();
    return assertOfficialUrlAllowed(resolvedUrl, source);
  } catch {
    return undefined;
  }
}

function parseTagAttributes(attributes: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const match of attributes.matchAll(
    /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  )) {
    parsed[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return parsed;
}

export function extractHomeAffairsSiteDataJson(
  html: string
): string | undefined {
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = parseTagAttributes(match[1]);
    if (
      attributes.id?.toLowerCase() !== "sitedata" ||
      attributes.type?.split(";", 1)[0].trim().toLowerCase() !==
        "application/json"
    ) {
      continue;
    }
    const contentStart = (match.index ?? 0) + match[0].length;
    const closingTag = /<\/script\s*>/i.exec(html.slice(contentStart));
    if (!closingTag) {
      return undefined;
    }
    return html.slice(contentStart, contentStart + closingTag.index).trim();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseHomeAffairsAlertItems(
  html: string,
  maxItems: number = DISCOVERY_LIMITS.maxAlertItems
): readonly Record<string, unknown>[] {
  const siteDataJson = extractHomeAffairsSiteDataJson(html);
  if (!siteDataJson) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(siteDataJson);
    if (!isRecord(parsed) || !Array.isArray(parsed.alertItems)) {
      return [];
    }
    return parsed.alertItems.slice(0, Math.max(0, maxItems)).filter(isRecord);
  } catch {
    return [];
  }
}

function boundedRawMetadata(
  value: unknown,
  maxCharacters = 200
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxCharacters) : undefined;
}

function alertUrlValues(item: Record<string, unknown>): string[] {
  const values = item.urls ?? item.url;
  const candidates = Array.isArray(values) ? values : [values];
  return candidates.flatMap((value) => {
    if (typeof value === "string") {
      return [value];
    }
    if (isRecord(value) && typeof value.url === "string") {
      return [value.url];
    }
    return [];
  });
}

function candidateFromHomeAffairsAlert(
  item: Record<string, unknown>,
  page: FetchedOfficialPage,
  source: PolicyDiscoverySource,
  retrievedAt: string,
  maxPreviewCharacters: number
): DiscoveryCandidate {
  const title = boundedRawMetadata(item.title, 500);
  const content = boundedRawMetadata(item.content, 4096);
  const normalizedContent = [title, content].filter(Boolean).join("\n");
  const contentForFingerprint =
    normalizedContent || JSON.stringify(item, Object.keys(item).sort());
  let canonicalUrl = assertOfficialUrlAllowed(source.seedUrls[0], source);
  let urlProvenance: "alert" | "seed" = "seed";
  let alertUrl: string | undefined;
  for (const rawUrl of alertUrlValues(item)) {
    const resolvedUrl = resolveHomeAffairsAlertUrl(
      rawUrl,
      page.finalUrl,
      source
    );
    if (resolvedUrl) {
      alertUrl = resolvedUrl;
      canonicalUrl = resolvedUrl;
      urlProvenance = "alert";
      break;
    }
    // Out-of-scope or malformed alert URLs are not candidate provenance and
    // are never fetched. A valid alert URL is selected deterministically in
    // source order; otherwise the configured seed remains the explicit source.
  }
  const contentHash = fingerprintContent(
    `${canonicalUrl}\n${contentForFingerprint}`
  );

  return {
    schemaVersion: DISCOVERY_CANDIDATE_SCHEMA,
    candidateId: stableCandidateId(source.id, canonicalUrl, contentHash),
    sourceConfigId: source.id,
    authority: source.authority,
    canonicalUrl,
    discoveredTitle: title,
    retrievedAt,
    contentType: page.contentType,
    preview: boundedPreview(content, maxPreviewCharacters),
    contentHash,
    etag: page.etag,
    lastModified: page.lastModified,
    discoveryStrategy: source.strategy,
    sourceMetadata: {
      httpStatus: page.status,
      redirectChain: page.redirectChain,
      alertCategory: boundedRawMetadata(item.category),
      alertType: boundedRawMetadata(item.type),
      alertUpdateDate: boundedRawMetadata(item.updateDate),
      alertUrl,
      urlProvenance,
    },
  };
}

type ParsedPageMetadata = {
  title?: string;
  titleSource?: "title" | "og:title" | "h1";
  sourceDate?: string;
  dateSource?: "time" | "meta";
  preview?: string;
};

function parsePageMetadata(body: string): ParsedPageMetadata {
  const ogTitle = metaContent(body, /^og:title$/i);
  const title = firstMatch(body, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const heading = firstMatch(body, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const timeDate = firstMatch(
    body,
    /<time\b[^>]*datetime\s*=\s*["'](\d{4}-\d{2}-\d{2})[^"']*["'][^>]*>/i
  );
  const metaDate = metaContent(
    body,
    /^(?:date|article:published_time)$/i
  )?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const description = metaContent(body, /^description$/i);
  const preview = description ?? firstMatch(body, /<p\b[^>]*>([\s\S]*?)<\/p>/i);
  const rawTitle = ogTitle ?? title ?? heading;

  return {
    title: rawTitle ? stripMarkup(rawTitle) : undefined,
    titleSource: ogTitle
      ? "og:title"
      : title
        ? "title"
        : heading
          ? "h1"
          : undefined,
    sourceDate: timeDate ?? metaDate,
    dateSource: timeDate ? "time" : metaDate ? "meta" : undefined,
    preview: preview ? stripMarkup(preview) : undefined,
  };
}

function boundedPreview(
  value: string | undefined,
  maxCharacters: number = DISCOVERY_LIMITS.maxPreviewCharacters
): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxCharacters
    ? `${normalized.slice(0, Math.max(0, maxCharacters - 1))}…`
    : normalized;
}

export function fingerprintContent(content: string | Uint8Array): string {
  return createHash("sha256")
    .update(typeof content === "string" ? content : Buffer.from(content))
    .digest("hex");
}

export function stableCandidateId(
  sourceConfigId: string,
  canonicalUrl: string,
  contentHash: string
): string {
  return `pic-${createHash("sha256")
    .update(
      `${DISCOVERY_CANDIDATE_SCHEMA}\n${sourceConfigId}\n${canonicalUrl}\n${contentHash}`
    )
    .digest("hex")
    .slice(0, 24)}`;
}

export function candidateFromPage(
  page: FetchedOfficialPage,
  source: PolicyDiscoverySource,
  retrievedAt: string,
  strategy: DiscoveryStrategy
): DiscoveryCandidate {
  const metadata = parsePageMetadata(page.body);
  const canonicalUrl = canonicalizeOfficialUrl(page.finalUrl);
  const contentHash = fingerprintContent(page.body);
  const seedUrls = source.seedUrls.map((seedUrl) =>
    assertOfficialUrlAllowed(seedUrl, source)
  );
  const urlProvenance: "seed" | "fetched_page" = seedUrls.includes(
    canonicalizeOfficialUrl(page.requestedUrl)
  )
    ? "seed"
    : "fetched_page";
  return {
    schemaVersion: DISCOVERY_CANDIDATE_SCHEMA,
    candidateId: stableCandidateId(source.id, canonicalUrl, contentHash),
    sourceConfigId: source.id,
    authority: source.authority,
    canonicalUrl,
    discoveredTitle: metadata.title,
    explicitSourceDate: metadata.sourceDate,
    retrievedAt,
    contentType: page.contentType,
    preview: boundedPreview(metadata.preview),
    contentHash,
    etag: page.etag,
    lastModified: page.lastModified,
    discoveryStrategy: strategy,
    sourceMetadata: {
      httpStatus: page.status,
      redirectChain: page.redirectChain,
      titleSource: metadata.titleSource,
      dateSource: metadata.dateSource,
      urlProvenance,
    },
  };
}

export function deduplicateCandidates(
  candidates: readonly DiscoveryCandidate[]
): DiscoveryCandidate[] {
  const unique = new Map<string, DiscoveryCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.candidateId)) {
      unique.set(candidate.candidateId, candidate);
    }
  }
  return [...unique.values()];
}

export type DiscoveryRunOptions = {
  sourceId: string;
  fetchOptions?: DiscoveryFetchOptions;
  now?: () => string;
  limits?: DiscoveryLimits;
};

function boundedLimits(
  source: PolicyDiscoverySource,
  overrides: DiscoveryLimits = {}
) {
  const defaults = {
    ...DISCOVERY_LIMITS,
    ...(source.strategy === "home_affairs_site_alerts"
      ? HOME_AFFAIRS_ALERT_LIMITS
      : {}),
  };
  return {
    maxPages: Math.min(
      defaults.maxPages,
      Math.max(1, overrides.maxPages ?? defaults.maxPages)
    ),
    maxLinksPerPage: Math.min(
      defaults.maxLinksPerPage,
      Math.max(1, overrides.maxLinksPerPage ?? defaults.maxLinksPerPage)
    ),
    maxCandidates: Math.min(
      defaults.maxCandidates,
      Math.max(1, overrides.maxCandidates ?? defaults.maxCandidates)
    ),
    maxAlertItems: Math.min(
      defaults.maxAlertItems,
      Math.max(1, overrides.maxAlertItems ?? defaults.maxAlertItems)
    ),
    maxTotalBytes: Math.min(
      defaults.maxTotalBytes,
      Math.max(1, overrides.maxTotalBytes ?? defaults.maxTotalBytes)
    ),
    maxResponseBytes: Math.min(
      defaults.maxResponseBytes,
      Math.max(1, overrides.maxResponseBytes ?? defaults.maxResponseBytes)
    ),
    maxPreviewCharacters: Math.min(
      DISCOVERY_LIMITS.maxPreviewCharacters,
      Math.max(
        1,
        overrides.maxPreviewCharacters ?? DISCOVERY_LIMITS.maxPreviewCharacters
      )
    ),
    maxRedirects: Math.min(
      DISCOVERY_LIMITS.maxRedirects,
      Math.max(0, overrides.maxRedirects ?? DISCOVERY_LIMITS.maxRedirects)
    ),
    requestTimeoutMs: Math.min(
      DISCOVERY_LIMITS.requestTimeoutMs,
      Math.max(
        1,
        overrides.requestTimeoutMs ?? DISCOVERY_LIMITS.requestTimeoutMs
      )
    ),
    maxRuntimeMs: Math.min(
      DISCOVERY_LIMITS.maxRuntimeMs,
      Math.max(1, overrides.maxRuntimeMs ?? DISCOVERY_LIMITS.maxRuntimeMs)
    ),
  };
}

export async function discoverPolicyCandidates(
  options: DiscoveryRunOptions
): Promise<DiscoveryRunResult> {
  const source = getPolicyDiscoverySource(options.sourceId);
  const limits = boundedLimits(source, options.limits);
  const startedAt = Date.now();
  const now = options.now ?? (() => new Date().toISOString());
  const queue = [...source.seedUrls];
  const seenUrls = new Set<string>();
  const candidates: DiscoveryCandidate[] = [];
  let totalBytes = 0;

  while (
    queue.length > 0 &&
    seenUrls.size < limits.maxPages &&
    candidates.length < limits.maxCandidates
  ) {
    if (Date.now() - startedAt > limits.maxRuntimeMs) {
      throw new DiscoveryError(
        "runtime_limit",
        "Discovery runtime limit exceeded"
      );
    }
    const nextUrl = queue.shift();
    if (!nextUrl) {
      break;
    }
    const canonicalUrl = assertOfficialUrlAllowed(nextUrl, source);
    if (seenUrls.has(canonicalUrl)) {
      continue;
    }
    seenUrls.add(canonicalUrl);

    const remainingRuntimeMs = limits.maxRuntimeMs - (Date.now() - startedAt);
    if (remainingRuntimeMs <= 0) {
      throw new DiscoveryError(
        "runtime_limit",
        "Discovery runtime limit exceeded"
      );
    }
    const page = await fetchOfficialPage(canonicalUrl, source, {
      ...options.fetchOptions,
      maxResponseBytes: Math.min(
        options.fetchOptions?.maxResponseBytes ?? limits.maxResponseBytes,
        limits.maxResponseBytes
      ),
      timeoutMs: Math.min(
        options.fetchOptions?.timeoutMs ?? limits.requestTimeoutMs,
        remainingRuntimeMs
      ),
    });
    if (Date.now() - startedAt > limits.maxRuntimeMs) {
      throw new DiscoveryError(
        "runtime_limit",
        "Discovery runtime limit exceeded"
      );
    }
    totalBytes += page.bytes;
    if (totalBytes > limits.maxTotalBytes) {
      throw new DiscoveryError(
        "response_too_large",
        `Discovery run exceeds ${limits.maxTotalBytes} total bytes`
      );
    }
    if (source.strategy === "home_affairs_site_alerts") {
      for (const item of parseHomeAffairsAlertItems(
        page.body,
        limits.maxAlertItems
      )) {
        if (candidates.length >= limits.maxCandidates) {
          break;
        }
        candidates.push(
          candidateFromHomeAffairsAlert(
            item,
            page,
            source,
            now(),
            limits.maxPreviewCharacters
          )
        );
      }
      break;
    }

    candidates.push(candidateFromPage(page, source, now(), source.strategy));

    if (source.strategy === "listing_links") {
      for (const link of parseListingLinks(
        page.body,
        page.finalUrl,
        source,
        limits.maxLinksPerPage
      )) {
        if (!seenUrls.has(link) && !queue.includes(link)) {
          queue.push(link);
        }
      }
    } else if (source.strategy === "sitemap_links") {
      for (const link of parseSitemapLinks(
        page.body,
        page.finalUrl,
        source,
        limits.maxLinksPerPage
      )) {
        if (!seenUrls.has(link) && !queue.includes(link)) {
          queue.push(link);
        }
      }
    }
  }

  return {
    schemaVersion: DISCOVERY_CANDIDATE_SCHEMA,
    sourceConfigId: source.id,
    candidates: deduplicateCandidates(candidates).slice(
      0,
      limits.maxCandidates
    ),
  };
}
