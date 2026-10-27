import { createHash } from "node:crypto";
import {
  AcquisitionPolicyError,
  assertConnectionPinning,
  assertSafeResolvedAddresses,
  canonicalizeManifestUrl,
  validateManifestForAcquisition,
} from "./acquisition-policy";
import {
  type EducationDataset,
  type EducationFieldObservation,
  type EducationFieldValue,
  type EducationSnapshot,
  type EducationSource,
  FIELD_DEFINITIONS,
  MAX_CANDIDATES_PER_FIELD,
  validateEducationDataset,
} from "./contracts";
import { findSourceIdentityCollisions } from "./identity";
import type { EducationSourceManifest } from "./source-manifest";

export type AcquisitionStage =
  | "POLICY"
  | "DNS"
  | "CONNECT"
  | "HEADERS"
  | "BODY"
  | "PARSE";
export type AcquisitionOutcome =
  | "BLOCKED"
  | "CAPTURED"
  | "FAILED_FETCH"
  | "FAILED_PARSE";
export type AcquisitionFailureCode =
  | "INVALID_INPUT"
  | "SOURCE_NOT_APPROVED"
  | "POLICY_REJECTED"
  | "DNS_REJECTED"
  | "TIMEOUT"
  | "REQUEST_LIMIT"
  | "REDIRECT_LIMIT"
  | "REDIRECT_LOOP"
  | "HTTP_STATUS"
  | "TRANSPORT_FAILURE"
  | "PEER_ADDRESS_MISMATCH"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "UNSUPPORTED_CHARSET"
  | "UNSUPPORTED_CONTENT_ENCODING"
  | "INVALID_CONTENT_LENGTH"
  | "INVALID_HEADERS"
  | "HEADERS_TOO_LARGE"
  | "RESPONSE_TOO_LARGE"
  | "TOTAL_BYTES_EXCEEDED"
  | "MALFORMED_UTF8"
  | "MALFORMED_JSON"
  | "PARSER_FAILURE"
  | "INVALID_CANDIDATE"
  | "IMMUTABLE_ID_CONFLICT";

export interface AcquisitionDiagnostic {
  readonly stage: AcquisitionStage;
  readonly code: AcquisitionFailureCode;
  /** Static bounded text. Provider exceptions and raw response text are never copied here. */
  readonly message: string;
  readonly httpStatus?: number;
}

export interface AcquisitionCandidateInput {
  readonly target: {
    readonly type: "PROVIDER" | "COURSE" | "DELIVERY" | "INTAKE";
    readonly id: string;
  };
  readonly fieldKey: EducationFieldObservation["fieldKey"];
  readonly value: EducationFieldValue;
  readonly quote: string;
  readonly locator: string;
}

export interface CandidateExtractor {
  readonly mode: "DETERMINISTIC_RULES";
  readonly parserVersion: string;
  extract(input: {
    readonly text: string;
    readonly sourceFamily: EducationSourceManifest["family"];
    readonly maxCandidates: number;
    readonly signal: AbortSignal;
  }):
    | Promise<readonly AcquisitionCandidateInput[]>
    | readonly AcquisitionCandidateInput[];
}

export interface AcquisitionDnsResolver {
  resolve(hostname: string, signal: AbortSignal): Promise<readonly string[]>;
}

export interface AcquisitionTransportResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Must be read from the connected socket peer, not copied from the request. */
  readonly connectedAddress: string;
  readonly body: AsyncIterable<Uint8Array>;
}

export interface PinnedAcquisitionTransport {
  /**
   * Any future adapter must dial only one of the supplied resolved addresses,
   * use the URL hostname for TLS SNI and certificate validation, avoid proxy
   * routing and implicit DNS, and report the actual socket peer above. This
   * repository deliberately provides no live adapter.
   */
  readonly capabilities: {
    readonly pinsResolvedAddress: boolean;
    readonly validatesTlsHostname: boolean;
    readonly followsRedirects: boolean;
    readonly automaticDecompression: boolean;
  };
  request(input: {
    readonly url: string;
    readonly hostname: string;
    readonly resolvedAddresses: readonly string[];
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  }): Promise<AcquisitionTransportResponse>;
}

export interface AcquisitionPorts {
  readonly resolver: AcquisitionDnsResolver;
  readonly transport: PinnedAcquisitionTransport;
}

export interface AcquireEducationSourceInput {
  readonly attemptId: string;
  readonly attemptedAt: string;
  readonly manifest: EducationSourceManifest;
  readonly baseDataset: EducationDataset;
  readonly ports: AcquisitionPorts;
  readonly extractor?: CandidateExtractor;
}

export interface EducationAcquisitionAttempt {
  readonly attemptId: string;
  readonly outcome: AcquisitionOutcome;
  readonly source?: EducationSource;
  readonly snapshot?: EducationSnapshot;
  readonly candidateObservations: readonly EducationFieldObservation[];
  readonly diagnostic?: AcquisitionDiagnostic;
  readonly requestedUrl?: string;
  readonly finalUrl?: string;
  /** Credentials and path, query and fragment values are redacted. */
  readonly redirectEvidence: readonly string[];
  readonly requestCount: number;
  readonly responseBytes: number;
}

export class AcquisitionRunError extends Error {
  readonly stage: AcquisitionStage;
  readonly code: AcquisitionFailureCode;
  readonly status?: number;

  constructor(
    stage: AcquisitionStage,
    code: AcquisitionFailureCode,
    status?: number
  ) {
    super(code);
    this.name = "AcquisitionRunError";
    this.stage = stage;
    this.code = code;
    this.status = status;
  }
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MIME_BY_DOCUMENT: Readonly<
  Record<EducationSourceManifest["expectedDocumentType"], ReadonlySet<string>>
> = {
  HTML: new Set(["text/html", "application/xhtml+xml"]),
  JSON: new Set(["application/json"]),
  TEXT: new Set(["text/plain"]),
  PDF: new Set(["application/pdf"]),
};
const MAX_TEXT_BYTES = 2_000_000;
const MAX_CANDIDATES = 256;
const MAX_QUOTE_LENGTH = 512;
const MAX_LOCATOR_LENGTH = 512;

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)])
    );
  }
  return value;
}

function hasImmutableReplayConflict(input: {
  dataset: EducationDataset;
  snapshot: EducationSnapshot;
  observations: readonly EducationFieldObservation[];
}): boolean {
  const existingSnapshot = input.dataset.snapshots.find(
    (item) => item.snapshotId === input.snapshot.snapshotId
  );
  if (
    existingSnapshot &&
    JSON.stringify(stableValue(existingSnapshot)) !==
      JSON.stringify(stableValue(input.snapshot))
  ) {
    return true;
  }

  const existingById = new Map(
    input.dataset.observations.map((item) => [item.observationId, item])
  );
  for (const observation of input.observations) {
    const existing = existingById.get(observation.observationId);
    if (
      existing &&
      JSON.stringify(stableValue(existing)) !==
        JSON.stringify(stableValue(observation))
    ) {
      return true;
    }
  }

  // Treat a snapshot and its complete observation set as one immutable replay.
  // This rejects added or removed candidates even when revised content gives
  // them a different observation ID.
  if (existingSnapshot) {
    const existingIds = input.dataset.observations
      .filter(
        (item) => item.provenance.snapshotId === input.snapshot.snapshotId
      )
      .map((item) => item.observationId)
      .sort();
    const proposedIds = input.observations
      .map((item) => item.observationId)
      .sort();
    if (
      existingIds.length !== proposedIds.length ||
      existingIds.some((id, index) => id !== proposedIds[index])
    ) {
      return true;
    }
  }
  return false;
}

function staticMessage(code: AcquisitionFailureCode): string {
  const text: Record<AcquisitionFailureCode, string> = {
    INVALID_INPUT: "Acquisition input failed contract validation.",
    SOURCE_NOT_APPROVED: "Source is not approved for acquisition.",
    POLICY_REJECTED: "Source request was rejected by acquisition policy.",
    DNS_REJECTED:
      "DNS resolution was empty, invalid or included a non-public address.",
    TIMEOUT: "Acquisition exceeded its bounded deadline.",
    REQUEST_LIMIT: "Acquisition exceeded its request budget.",
    REDIRECT_LIMIT: "Acquisition exceeded its redirect budget.",
    REDIRECT_LOOP: "Acquisition encountered a redirect loop.",
    HTTP_STATUS: "Source returned a non-success HTTP status.",
    TRANSPORT_FAILURE: "Injected transport failed.",
    PEER_ADDRESS_MISMATCH:
      "Transport peer did not match the pinned DNS address set.",
    UNSUPPORTED_CONTENT_TYPE:
      "Response content type did not match the manifest.",
    UNSUPPORTED_CHARSET:
      "Response charset is not supported by the offline parser path.",
    UNSUPPORTED_CONTENT_ENCODING:
      "Compressed response encoding is not accepted.",
    INVALID_CONTENT_LENGTH: "Response Content-Length was invalid.",
    INVALID_HEADERS: "Response headers were malformed.",
    HEADERS_TOO_LARGE: "Response headers exceeded their configured limit.",
    RESPONSE_TOO_LARGE: "Response exceeded its byte limit.",
    TOTAL_BYTES_EXCEEDED: "Acquisition exceeded its total decoded-byte limit.",
    MALFORMED_UTF8: "Response text was not valid UTF-8.",
    MALFORMED_JSON: "Response JSON was malformed.",
    PARSER_FAILURE: "Deterministic candidate parser failed.",
    INVALID_CANDIDATE:
      "Candidate evidence failed provenance or scope validation.",
    IMMUTABLE_ID_CONFLICT:
      "An immutable source, snapshot or observation ID already has different content.",
  };
  return text[code];
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function safeDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    const pathDepth = url.pathname.split("/").filter(Boolean).length;
    const redactedPath =
      pathDepth === 0
        ? "/"
        : `/[${pathDepth} path segment${pathDepth === 1 ? "" : "s"} redacted]`;
    // URL.origin excludes credentials. Path, query and fragment values are
    // omitted from ordinary diagnostics and redirect history.
    return `${url.origin}${redactedPath}`.slice(0, 600);
  } catch {
    return "[redacted-url]";
  }
}

function header(
  headers: Readonly<Record<string, string | undefined>>,
  name: string
): string | undefined {
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase()
  );
  return key ? headers[key] : undefined;
}

function validateHeaders(
  headers: Readonly<Record<string, string | undefined>>
): void {
  const entries = Object.entries(headers);
  if (entries.length > 64) {
    throw new AcquisitionRunError("HEADERS", "HEADERS_TOO_LARGE");
  }
  let totalCharacters = 0;
  const seenNames = new Set<string>();
  for (const [name, value] of entries) {
    const normalizedName = name.toLowerCase();
    if (
      !/^[A-Za-z0-9-]{1,128}$/.test(name) ||
      seenNames.has(normalizedName) ||
      (value !== undefined &&
        (typeof value !== "string" ||
          value.length > 8192 ||
          hasControlCharacters(value)))
    ) {
      throw new AcquisitionRunError("HEADERS", "INVALID_HEADERS");
    }
    seenNames.add(normalizedName);
    totalCharacters += name.length + (value?.length ?? 0);
    if (totalCharacters > 32_768) {
      throw new AcquisitionRunError("HEADERS", "HEADERS_TOO_LARGE");
    }
  }
}

async function withinStage<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
  stage: AcquisitionStage,
  timeoutController: AbortController
): Promise<T> {
  if (signal.aborted) {
    throw new AcquisitionRunError(stage, "TIMEOUT");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timeoutController.abort();
      reject(new AcquisitionRunError(stage, "TIMEOUT"));
    }, timeoutMs);
  });
  const aborted = new Promise<never>((_resolve, reject) => {
    abortHandler = () => reject(new AcquisitionRunError(stage, "TIMEOUT"));
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  try {
    return await Promise.race([operation, timeout, aborted]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    if (abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

async function readBoundedBody(
  body: AsyncIterable<Uint8Array>,
  perResponseLimit: number,
  totalRemaining: number,
  signal: AbortSignal
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  let completed = false;
  const iterator = body[Symbol.asyncIterator]();
  const cancel = () => {
    try {
      const closing = iterator.return?.();
      return closing?.catch(() => undefined);
    } catch {
      // Adapter cancellation failures stay out of acquisition diagnostics.
      return undefined;
    }
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      if (signal.aborted) {
        throw new AcquisitionRunError("BODY", "TIMEOUT");
      }
      const item = await iterator.next();
      if (item.done) {
        completed = true;
        break;
      }
      const chunk = item.value;
      if (!(chunk instanceof Uint8Array)) {
        throw new AcquisitionRunError("BODY", "TRANSPORT_FAILURE");
      }
      length += chunk.byteLength;
      if (length > perResponseLimit) {
        throw new AcquisitionRunError("BODY", "RESPONSE_TOO_LARGE");
      }
      if (length > totalRemaining) {
        throw new AcquisitionRunError("BODY", "TOTAL_BYTES_EXCEEDED");
      }
      chunks.push(chunk);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!completed) {
      try {
        const closing = iterator.return?.();
        closing?.catch(() => undefined);
      } catch {
        // Best-effort cancellation only; diagnostics never expose adapter details.
      }
    }
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function sourceFromManifest(
  manifest: EducationSourceManifest
): EducationSource {
  const recordClass = manifest.syntheticFixture ? "SYNTHETIC" : "UNVERIFIED";
  return {
    sourceId: manifest.sourceId,
    sourceFamily: manifest.family,
    recordClass,
    authorityName: manifest.authorityEvidence.title,
    originalUrl: manifest.canonicalUrl,
    canonicalUrl: manifest.canonicalUrl,
    scope: manifest.scope,
    language: manifest.locale,
    accessMode: manifest.syntheticFixture
      ? "SYNTHETIC_FIXTURE"
      : "CURATED_REFERENCE",
  };
}

function stableSnapshotId(sourceId: string, attemptId: string): string {
  return `acq-snapshot:${hash(`${sourceId}\u0000${attemptId}`).slice(0, 48)}`;
}

function makeSnapshot(input: {
  source: EducationSource;
  attemptId: string;
  attemptedAt: string;
  sourceUrl: string;
  outcome: EducationSnapshot["acquisitionOutcome"];
  contentHash?: string;
  parserVersion?: string;
}): EducationSnapshot {
  return {
    snapshotId: stableSnapshotId(input.source.sourceId, input.attemptId),
    sourceId: input.source.sourceId,
    recordClass: input.source.recordClass,
    sourceUrl: input.sourceUrl,
    retrievedAt: input.attemptedAt,
    observedAt: input.attemptedAt,
    ...(input.contentHash ? { contentSha256: input.contentHash } : {}),
    ...(input.parserVersion ? { parserVersion: input.parserVersion } : {}),
    acquisitionOutcome: input.outcome,
  };
}

function providerForTarget(
  dataset: EducationDataset,
  target: AcquisitionCandidateInput["target"]
): string | undefined {
  if (target.type === "PROVIDER") {
    return dataset.providers.find((item) => item.providerId === target.id)
      ?.providerId;
  }
  if (target.type === "COURSE") {
    return dataset.courses.find((item) => item.courseId === target.id)
      ?.providerId;
  }
  if (target.type === "DELIVERY") {
    const delivery = dataset.deliveries.find(
      (item) => item.deliveryId === target.id
    );
    return delivery
      ? dataset.courses.find((item) => item.courseId === delivery.courseId)
          ?.providerId
      : undefined;
  }
  const intake = dataset.intakes.find((item) => item.intakeId === target.id);
  const delivery =
    intake &&
    dataset.deliveries.find((item) => item.deliveryId === intake.deliveryId);
  return delivery
    ? dataset.courses.find((item) => item.courseId === delivery.courseId)
        ?.providerId
    : undefined;
}

function validateCandidateInput(input: {
  candidate: AcquisitionCandidateInput;
  source: EducationSource;
  manifest: EducationSourceManifest;
  dataset: EducationDataset;
  text: string;
}): void {
  const { candidate, source, manifest, dataset, text } = input;
  const definition = FIELD_DEFINITIONS[candidate.fieldKey];
  if (!definition || !definition.entityTypes.includes(candidate.target.type)) {
    throw new AcquisitionRunError("PARSE", "INVALID_CANDIDATE");
  }
  const domainAllowed =
    source.sourceFamily === "CRICOS"
      ? definition.claimDomain === "CRICOS_REGISTRATION"
      : source.sourceFamily === "STUDY_AUSTRALIA"
        ? definition.claimDomain === "DISCOVERY"
        : definition.claimDomain.startsWith("INSTITUTION_");
  if (!domainAllowed) {
    throw new AcquisitionRunError("PARSE", "INVALID_CANDIDATE");
  }
  if (
    manifest.scope.kind === "PROVIDER" &&
    providerForTarget(dataset, candidate.target) !== manifest.scope.providerId
  ) {
    throw new AcquisitionRunError("PARSE", "INVALID_CANDIDATE");
  }
  if (!providerForTarget(dataset, candidate.target)) {
    throw new AcquisitionRunError("PARSE", "INVALID_CANDIDATE");
  }
  if (
    candidate.quote.length < 1 ||
    candidate.quote.length > MAX_QUOTE_LENGTH ||
    candidate.quote.includes("<") ||
    candidate.quote.includes(">") ||
    !text.includes(candidate.quote)
  ) {
    throw new AcquisitionRunError("PARSE", "INVALID_CANDIDATE");
  }
  if (
    candidate.locator.length < 1 ||
    candidate.locator.length > MAX_LOCATOR_LENGTH ||
    hasControlCharacters(candidate.locator)
  ) {
    throw new AcquisitionRunError("PARSE", "INVALID_CANDIDATE");
  }
}

function observationsFromCandidates(input: {
  candidates: readonly AcquisitionCandidateInput[];
  source: EducationSource;
  snapshot: EducationSnapshot;
  manifest: EducationSourceManifest;
  baseDataset: EducationDataset;
  text: string;
  attemptedAt: string;
}): readonly EducationFieldObservation[] {
  if (input.candidates.length > MAX_CANDIDATES) {
    throw new AcquisitionRunError("PARSE", "INVALID_CANDIDATE");
  }
  const fieldCounts = new Map<string, number>();
  return input.candidates.map((candidate) => {
    validateCandidateInput({
      candidate,
      source: input.source,
      manifest: input.manifest,
      dataset: input.baseDataset,
      text: input.text,
    });
    const bucket = `${candidate.target.type}\u0000${candidate.target.id}\u0000${candidate.fieldKey}`;
    const count = (fieldCounts.get(bucket) ?? 0) + 1;
    fieldCounts.set(bucket, count);
    if (count > MAX_CANDIDATES_PER_FIELD) {
      throw new AcquisitionRunError("PARSE", "INVALID_CANDIDATE");
    }
    const observationId = `acq-observation:${hash(JSON.stringify(stableValue([input.source.sourceId, input.snapshot.snapshotId, candidate.target, candidate.fieldKey, candidate.value, candidate.locator]))).slice(0, 48)}`;
    return {
      observationId,
      target: candidate.target,
      fieldKey: candidate.fieldKey,
      claimDomain: FIELD_DEFINITIONS[candidate.fieldKey].claimDomain,
      recordClass: input.source.recordClass,
      disposition: "ASSERTION",
      value: candidate.value,
      provenance: {
        sourceId: input.source.sourceId,
        snapshotId: input.snapshot.snapshotId,
        sourceFamily: input.source.sourceFamily,
        sourceUrl: input.snapshot.sourceUrl,
        contentSha256: input.snapshot.contentSha256 as string,
        locator: candidate.locator,
        excerpt: candidate.quote,
      },
      observedAt: input.attemptedAt,
    } satisfies EducationFieldObservation;
  });
}

function blockAttempt(
  input: AcquireEducationSourceInput,
  code: AcquisitionFailureCode,
  stage: AcquisitionStage = "POLICY",
  source?: EducationSource
): EducationAcquisitionAttempt {
  return {
    attemptId: input.attemptId,
    outcome: "BLOCKED",
    ...(source ? { source } : {}),
    candidateObservations: [],
    diagnostic: { stage, code, message: staticMessage(code) },
    redirectEvidence: [],
    requestCount: 0,
    responseBytes: 0,
  };
}

function immutableConflictAttempt(
  input: AcquireEducationSourceInput,
  source: EducationSource,
  details: {
    readonly requestedUrl?: string;
    readonly finalUrl?: string;
    readonly redirectEvidence?: readonly string[];
    readonly requestCount?: number;
    readonly responseBytes?: number;
  } = {}
): EducationAcquisitionAttempt {
  return {
    ...blockAttempt(input, "IMMUTABLE_ID_CONFLICT", "PARSE", source),
    ...(details.requestedUrl
      ? { requestedUrl: safeDiagnosticUrl(details.requestedUrl) }
      : {}),
    ...(details.finalUrl
      ? { finalUrl: safeDiagnosticUrl(details.finalUrl) }
      : {}),
    redirectEvidence: (details.redirectEvidence ?? []).map(safeDiagnosticUrl),
    requestCount: details.requestCount ?? 0,
    responseBytes: details.responseBytes ?? 0,
  };
}

export async function acquireEducationSource(
  input: AcquireEducationSourceInput
): Promise<EducationAcquisitionAttempt> {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.attemptId) ||
    !/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/i.test(input.attemptedAt) ||
    !Number.isFinite(Date.parse(input.attemptedAt))
  ) {
    return blockAttempt(input, "INVALID_INPUT");
  }
  if (
    input.extractor &&
    (input.extractor.mode !== "DETERMINISTIC_RULES" ||
      typeof input.extractor.parserVersion !== "string" ||
      input.extractor.parserVersion.trim().length === 0 ||
      input.extractor.parserVersion.length > 128)
  ) {
    return blockAttempt(input, "INVALID_INPUT");
  }
  const datasetValidation = validateEducationDataset(input.baseDataset);
  if (!datasetValidation.ok) {
    return blockAttempt(input, "INVALID_INPUT");
  }
  const knownProviderIds = new Set(
    input.baseDataset.providers.map((provider) => provider.providerId)
  );
  try {
    validateManifestForAcquisition(input.manifest, input.attemptedAt, {
      knownProviderIds,
    });
    assertConnectionPinning(input.ports.transport.capabilities);
  } catch (error) {
    const code =
      error instanceof AcquisitionPolicyError &&
      error.code === "SOURCE_NOT_APPROVED"
        ? "SOURCE_NOT_APPROVED"
        : error instanceof AcquisitionPolicyError &&
            error.code === "UNSAFE_TRANSPORT"
          ? "POLICY_REJECTED"
          : "POLICY_REJECTED";
    return blockAttempt(input, code);
  }

  const source = sourceFromManifest(input.manifest);
  const existingSource = input.baseDataset.sources.find(
    (item) => item.sourceId === source.sourceId
  );
  const sourceIdentityCollisions = findSourceIdentityCollisions([
    ...input.baseDataset.sources,
    source,
  ]);
  if (
    (existingSource &&
      JSON.stringify(stableValue(existingSource)) !==
        JSON.stringify(stableValue(source))) ||
    sourceIdentityCollisions.length > 0
  ) {
    return blockAttempt(input, "IMMUTABLE_ID_CONFLICT", "POLICY", source);
  }
  const transportPolicy = input.manifest.transportPolicy;
  const controller = new AbortController();
  const totalTimer = setTimeout(
    () => controller.abort(),
    transportPolicy.totalTimeoutMs
  );
  let currentUrl: string;
  try {
    currentUrl = canonicalizeManifestUrl(
      input.manifest,
      input.manifest.canonicalUrl
    );
  } catch {
    clearTimeout(totalTimer);
    return blockAttempt(input, "POLICY_REJECTED");
  }
  const requestedUrl = currentUrl;
  const seen = new Set<string>([currentUrl]);
  const redirectEvidence: string[] = [];
  let requestCount = 0;
  let responseBytes = 0;
  let contentHash: string | undefined;
  let finalUrl = currentUrl;

  const failed = (
    stage: AcquisitionStage,
    code: AcquisitionFailureCode,
    httpStatus?: number
  ): EducationAcquisitionAttempt => {
    const outcome = stage === "PARSE" ? "FAILED_PARSE" : "FAILED_FETCH";
    const snapshot = makeSnapshot({
      source,
      attemptId: input.attemptId,
      attemptedAt: input.attemptedAt,
      sourceUrl: finalUrl,
      outcome,
      ...(contentHash ? { contentHash } : {}),
      ...(input.extractor
        ? { parserVersion: input.extractor.parserVersion }
        : {}),
    });
    if (
      hasImmutableReplayConflict({
        dataset: input.baseDataset,
        snapshot,
        observations: [],
      })
    ) {
      return immutableConflictAttempt(input, source, {
        requestedUrl,
        finalUrl,
        redirectEvidence,
        requestCount,
        responseBytes,
      });
    }
    return {
      attemptId: input.attemptId,
      outcome,
      source,
      snapshot,
      candidateObservations: [],
      diagnostic: {
        stage,
        code,
        message: staticMessage(code),
        ...(httpStatus === undefined ? {} : { httpStatus }),
      },
      requestedUrl: safeDiagnosticUrl(requestedUrl),
      finalUrl: safeDiagnosticUrl(finalUrl),
      redirectEvidence,
      requestCount,
      responseBytes,
    };
  };

  try {
    for (;;) {
      if (requestCount >= transportPolicy.maxRequests) {
        throw new AcquisitionRunError("CONNECT", "REQUEST_LIMIT");
      }
      requestCount += 1;
      const parsedUrl = new URL(currentUrl);
      let addresses: readonly string[];
      try {
        const dns = await withinStage(
          input.ports.resolver.resolve(parsedUrl.hostname, controller.signal),
          controller.signal,
          transportPolicy.requestTimeoutMs,
          "DNS",
          controller
        );
        addresses = assertSafeResolvedAddresses(dns);
      } catch (error) {
        if (error instanceof AcquisitionRunError) {
          throw error;
        }
        if (error instanceof AcquisitionPolicyError) {
          throw new AcquisitionRunError("DNS", "DNS_REJECTED");
        }
        throw new AcquisitionRunError("DNS", "TRANSPORT_FAILURE");
      }
      const response = await withinStage(
        input.ports.transport.request({
          url: currentUrl,
          hostname: parsedUrl.hostname,
          resolvedAddresses: addresses,
          headers: {
            Accept:
              MIME_BY_DOCUMENT[input.manifest.expectedDocumentType]
                .values()
                .next().value ?? "*/*",
            "Accept-Encoding": "identity",
            "User-Agent": input.manifest.transportPolicy.userAgent,
          },
          signal: controller.signal,
        }),
        controller.signal,
        transportPolicy.requestTimeoutMs,
        "HEADERS",
        controller
      ).catch((error: unknown) => {
        if (error instanceof AcquisitionRunError) {
          throw error;
        }
        throw new AcquisitionRunError("HEADERS", "TRANSPORT_FAILURE");
      });
      validateHeaders(response.headers);
      if (
        !Number.isInteger(response.status) ||
        response.status < 100 ||
        response.status > 599
      ) {
        throw new AcquisitionRunError("HEADERS", "TRANSPORT_FAILURE");
      }
      if (!addresses.includes(response.connectedAddress)) {
        throw new AcquisitionRunError("CONNECT", "PEER_ADDRESS_MISMATCH");
      }
      if (REDIRECTS.has(response.status)) {
        if (redirectEvidence.length >= transportPolicy.maxRedirects) {
          throw new AcquisitionRunError(
            "HEADERS",
            "REDIRECT_LIMIT",
            response.status
          );
        }
        const location = header(response.headers, "location");
        if (!location || location.length > 2048) {
          throw new AcquisitionRunError(
            "HEADERS",
            "POLICY_REJECTED",
            response.status
          );
        }
        let nextUrl: string;
        try {
          nextUrl = canonicalizeManifestUrl(
            input.manifest,
            new URL(location, currentUrl).toString()
          );
        } catch {
          throw new AcquisitionRunError(
            "HEADERS",
            "POLICY_REJECTED",
            response.status
          );
        }
        if (seen.has(nextUrl)) {
          throw new AcquisitionRunError(
            "HEADERS",
            "REDIRECT_LOOP",
            response.status
          );
        }
        const redirectEncoding = (
          header(response.headers, "content-encoding") ?? "identity"
        )
          .trim()
          .toLowerCase();
        if (redirectEncoding !== "identity") {
          throw new AcquisitionRunError(
            "BODY",
            "UNSUPPORTED_CONTENT_ENCODING",
            response.status
          );
        }
        const redirectLengthText = header(response.headers, "content-length");
        if (redirectLengthText !== undefined) {
          if (!/^\d{1,12}$/.test(redirectLengthText)) {
            throw new AcquisitionRunError(
              "BODY",
              "INVALID_CONTENT_LENGTH",
              response.status
            );
          }
          const redirectLength = Number(redirectLengthText);
          if (redirectLength > transportPolicy.maxResponseBytes) {
            throw new AcquisitionRunError(
              "BODY",
              "RESPONSE_TOO_LARGE",
              response.status
            );
          }
          if (redirectLength + responseBytes > transportPolicy.maxTotalBytes) {
            throw new AcquisitionRunError(
              "BODY",
              "TOTAL_BYTES_EXCEEDED",
              response.status
            );
          }
        }
        const redirectBody = await withinStage(
          readBoundedBody(
            response.body,
            transportPolicy.maxResponseBytes,
            transportPolicy.maxTotalBytes - responseBytes,
            controller.signal
          ),
          controller.signal,
          transportPolicy.requestTimeoutMs,
          "BODY",
          controller
        );
        responseBytes += redirectBody.byteLength;
        seen.add(nextUrl);
        currentUrl = nextUrl;
        finalUrl = currentUrl;
        redirectEvidence.push(safeDiagnosticUrl(currentUrl));
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        throw new AcquisitionRunError(
          "HEADERS",
          "HTTP_STATUS",
          response.status
        );
      }

      const contentTypeHeader = header(response.headers, "content-type") ?? "";
      const [mimeValue, ...params] = contentTypeHeader.split(";");
      const mime = mimeValue.trim().toLowerCase();
      if (!MIME_BY_DOCUMENT[input.manifest.expectedDocumentType].has(mime)) {
        throw new AcquisitionRunError(
          "PARSE",
          "UNSUPPORTED_CONTENT_TYPE",
          response.status
        );
      }
      const charsetParam = params.find((item) => /^\s*charset\s*=/i.test(item));
      const charset = charsetParam
        ?.split("=", 2)[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, "")
        .toLowerCase();
      if (charset && charset !== "utf-8" && charset !== "utf8") {
        throw new AcquisitionRunError(
          "PARSE",
          "UNSUPPORTED_CHARSET",
          response.status
        );
      }
      const contentEncoding = (
        header(response.headers, "content-encoding") ?? "identity"
      )
        .trim()
        .toLowerCase();
      if (contentEncoding !== "identity") {
        throw new AcquisitionRunError(
          "PARSE",
          "UNSUPPORTED_CONTENT_ENCODING",
          response.status
        );
      }
      const declaredLengthText = header(response.headers, "content-length");
      if (declaredLengthText !== undefined) {
        if (!/^\d{1,12}$/.test(declaredLengthText)) {
          throw new AcquisitionRunError(
            "BODY",
            "INVALID_CONTENT_LENGTH",
            response.status
          );
        }
        const declaredLength = Number(declaredLengthText);
        if (declaredLength > transportPolicy.maxResponseBytes) {
          throw new AcquisitionRunError(
            "BODY",
            "RESPONSE_TOO_LARGE",
            response.status
          );
        }
        if (declaredLength + responseBytes > transportPolicy.maxTotalBytes) {
          throw new AcquisitionRunError(
            "BODY",
            "TOTAL_BYTES_EXCEEDED",
            response.status
          );
        }
      }
      const body = await withinStage(
        readBoundedBody(
          response.body,
          transportPolicy.maxResponseBytes,
          transportPolicy.maxTotalBytes - responseBytes,
          controller.signal
        ),
        controller.signal,
        transportPolicy.requestTimeoutMs,
        "BODY",
        controller
      );
      responseBytes += body.byteLength;
      contentHash = hash(body);
      let text: string | undefined;
      if (input.manifest.expectedDocumentType !== "PDF") {
        if (body.byteLength > MAX_TEXT_BYTES) {
          throw new AcquisitionRunError(
            "BODY",
            "RESPONSE_TOO_LARGE",
            response.status
          );
        }
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(body);
        } catch {
          throw new AcquisitionRunError(
            "PARSE",
            "MALFORMED_UTF8",
            response.status
          );
        }
        if (input.manifest.expectedDocumentType === "JSON") {
          try {
            JSON.parse(text);
          } catch {
            throw new AcquisitionRunError(
              "PARSE",
              "MALFORMED_JSON",
              response.status
            );
          }
        }
      }
      let candidates: readonly AcquisitionCandidateInput[] = [];
      if (input.extractor) {
        if (input.extractor.mode !== "DETERMINISTIC_RULES" || !text) {
          throw new AcquisitionRunError(
            "PARSE",
            "PARSER_FAILURE",
            response.status
          );
        }
        try {
          candidates = await withinStage(
            Promise.resolve(
              input.extractor.extract({
                text,
                sourceFamily: source.sourceFamily,
                maxCandidates: MAX_CANDIDATES,
                signal: controller.signal,
              })
            ),
            controller.signal,
            transportPolicy.requestTimeoutMs,
            "PARSE",
            controller
          );
        } catch (error) {
          if (error instanceof AcquisitionRunError) {
            throw error;
          }
          throw new AcquisitionRunError(
            "PARSE",
            "PARSER_FAILURE",
            response.status
          );
        }
      }
      const snapshot = makeSnapshot({
        source,
        attemptId: input.attemptId,
        attemptedAt: input.attemptedAt,
        sourceUrl: currentUrl,
        outcome: "CAPTURED",
        contentHash,
        ...(input.extractor
          ? { parserVersion: input.extractor.parserVersion }
          : {}),
      });
      let candidateObservations: readonly EducationFieldObservation[];
      try {
        candidateObservations = observationsFromCandidates({
          candidates,
          source,
          snapshot,
          manifest: input.manifest,
          baseDataset: input.baseDataset,
          text: text ?? "",
          attemptedAt: input.attemptedAt,
        });
      } catch (error) {
        if (error instanceof AcquisitionRunError) {
          throw error;
        }
        throw new AcquisitionRunError(
          "PARSE",
          "INVALID_CANDIDATE",
          response.status
        );
      }
      if (
        hasImmutableReplayConflict({
          dataset: input.baseDataset,
          snapshot,
          observations: candidateObservations,
        })
      ) {
        throw new AcquisitionRunError(
          "PARSE",
          "IMMUTABLE_ID_CONFLICT",
          response.status
        );
      }
      const proposed: EducationDataset = {
        ...input.baseDataset,
        sources: input.baseDataset.sources.some(
          (item) => item.sourceId === source.sourceId
        )
          ? input.baseDataset.sources
          : [...input.baseDataset.sources, source],
        snapshots: input.baseDataset.snapshots.some(
          (item) => item.snapshotId === snapshot.snapshotId
        )
          ? input.baseDataset.snapshots
          : [...input.baseDataset.snapshots, snapshot],
        observations: [
          ...input.baseDataset.observations,
          ...candidateObservations.filter(
            (observation) =>
              !input.baseDataset.observations.some(
                (existing) =>
                  existing.observationId === observation.observationId
              )
          ),
        ],
      };
      const validation = validateEducationDataset(proposed);
      if (!validation.ok) {
        throw new AcquisitionRunError(
          "PARSE",
          "INVALID_CANDIDATE",
          response.status
        );
      }
      return {
        attemptId: input.attemptId,
        outcome: "CAPTURED",
        source,
        snapshot,
        candidateObservations,
        requestedUrl: safeDiagnosticUrl(requestedUrl),
        finalUrl: safeDiagnosticUrl(currentUrl),
        redirectEvidence,
        requestCount,
        responseBytes,
      };
    }
  } catch (error) {
    controller.abort();
    if (error instanceof AcquisitionRunError) {
      if (error.code === "IMMUTABLE_ID_CONFLICT") {
        return immutableConflictAttempt(input, source, {
          requestedUrl,
          finalUrl,
          redirectEvidence,
          requestCount,
          responseBytes,
        });
      }
      return failed(error.stage, error.code, error.status);
    }
    return failed("CONNECT", "TRANSPORT_FAILURE");
  } finally {
    clearTimeout(totalTimer);
  }
}
