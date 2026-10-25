import "server-only";

import { createHash } from "node:crypto";
import {
  validateObjectVersionId,
  validateProjectDocumentObjectKey,
} from "./config";
import { ProjectDocumentAwsError } from "./errors";

export const GUARDDUTY_SCAN_RESULT_DETAIL_TYPE =
  "GuardDuty Malware Protection Object Scan Result";
const MAX_EVENT_BYTES = 64 * 1024;
const MAX_DEPTH = 12;
const MAX_NODES = 1200;
const MAX_STRING_LENGTH = 8192;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_KEYS = 100;
const EVENT_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

export type ProjectDocumentGuardDutyConfig = {
  accountId: string;
  region: string;
  bucket: string;
  protectionPlanArn: string;
};

export type UntrustedGuardDutyScanEvent = {
  readonly trust: "untrusted_event_payload";
  readonly eventId: string;
  readonly occurredAt: string;
  readonly fingerprint: string;
  readonly accountId: string;
  readonly region: string;
  readonly protectionPlanArn: string;
  readonly scanStatus: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly scanResultStatus:
    | "NO_THREATS_FOUND"
    | "THREATS_FOUND"
    | "UNSUPPORTED"
    | "ACCESS_DENIED"
    | "FAILED";
  readonly candidateVerdict: "clean" | "rejected" | "unavailable";
  readonly bucket: string;
  readonly objectKey: string;
  readonly objectVersionId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsControlCharacters(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function requireString(
  value: unknown,
  maxLength: number,
  code: "malformed_event" | "invalid_event_shape"
) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maxLength ||
    value.trim() !== value ||
    containsControlCharacters(value)
  ) {
    throw new ProjectDocumentAwsError(code);
  }
  return value;
}

function enforceJsonBounds(value: unknown) {
  let nodes = 0;
  const visit = (current: unknown, depth: number) => {
    nodes += 1;
    if (nodes > MAX_NODES || depth > MAX_DEPTH) {
      throw new ProjectDocumentAwsError("invalid_event_shape");
    }
    if (typeof current === "string") {
      if (current.length > MAX_STRING_LENGTH) {
        throw new ProjectDocumentAwsError("invalid_event_shape");
      }
      return;
    }
    if (typeof current === "number" && !Number.isFinite(current)) {
      throw new ProjectDocumentAwsError("invalid_event_shape");
    }
    if (Array.isArray(current)) {
      if (current.length > MAX_ARRAY_LENGTH) {
        throw new ProjectDocumentAwsError("invalid_event_shape");
      }
      for (const entry of current) {
        visit(entry, depth + 1);
      }
      return;
    }
    if (isRecord(current)) {
      const keys = Object.keys(current);
      if (keys.length > MAX_OBJECT_KEYS) {
        throw new ProjectDocumentAwsError("invalid_event_shape");
      }
      for (const key of keys) {
        if (key.length > MAX_STRING_LENGTH) {
          throw new ProjectDocumentAwsError("invalid_event_shape");
        }
        visit(current[key], depth + 1);
      }
    }
  };
  visit(value, 0);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function parseRawEvent(rawBody: string | Uint8Array) {
  let body: string;
  if (typeof rawBody === "string") {
    if (Buffer.byteLength(rawBody, "utf8") > MAX_EVENT_BYTES) {
      throw new ProjectDocumentAwsError("event_too_large");
    }
    body = rawBody;
  } else if (rawBody instanceof Uint8Array) {
    if (rawBody.byteLength > MAX_EVENT_BYTES) {
      throw new ProjectDocumentAwsError("event_too_large");
    }
    try {
      body = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
    } catch {
      throw new ProjectDocumentAwsError("malformed_event");
    }
  } else {
    throw new ProjectDocumentAwsError("malformed_event");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new ProjectDocumentAwsError("malformed_event");
  }
  enforceJsonBounds(parsed);
  if (!isRecord(parsed)) {
    throw new ProjectDocumentAwsError("invalid_event_shape");
  }
  return parsed;
}

function parseStatusPair(scanStatus: string, resultStatus: string) {
  if (scanStatus === "COMPLETED") {
    if (resultStatus === "NO_THREATS_FOUND") {
      return "clean" as const;
    }
    if (resultStatus === "THREATS_FOUND") {
      return "rejected" as const;
    }
    throw new ProjectDocumentAwsError("invalid_scan_result_pair");
  }
  if (
    scanStatus === "SKIPPED" &&
    (resultStatus === "UNSUPPORTED" || resultStatus === "ACCESS_DENIED")
  ) {
    return "unavailable" as const;
  }
  if (
    scanStatus === "FAILED" &&
    (resultStatus === "FAILED" || resultStatus === "ACCESS_DENIED")
  ) {
    return "unavailable" as const;
  }
  throw new ProjectDocumentAwsError("invalid_scan_result_pair");
}

/**
 * Parses and bounds a raw EventBridge body. The returned value is explicitly
 * untrusted and cannot be passed to A1.1 scan persistence as an attestation.
 */
export function parseUntrustedGuardDutyScanEvent(
  rawBody: string | Uint8Array,
  config: ProjectDocumentGuardDutyConfig
): UntrustedGuardDutyScanEvent {
  const parsed = parseRawEvent(rawBody);
  const detail = parsed.detail;
  if (!isRecord(detail)) {
    throw new ProjectDocumentAwsError("invalid_event_shape");
  }
  const s3Object = detail.s3ObjectDetails;
  const resultDetails = detail.scanResultDetails;
  if (!isRecord(s3Object) || !isRecord(resultDetails)) {
    throw new ProjectDocumentAwsError("invalid_event_shape");
  }

  const eventId = requireString(parsed.id, 128, "invalid_event_shape");
  const occurredAt = requireString(parsed.time, 64, "invalid_event_shape");
  if (
    !EVENT_TIME_PATTERN.test(occurredAt) ||
    !Number.isFinite(Date.parse(occurredAt))
  ) {
    throw new ProjectDocumentAwsError("invalid_event_shape");
  }
  if (
    parsed.version !== "0" ||
    parsed.source !== "aws.guardduty" ||
    parsed["detail-type"] !== GUARDDUTY_SCAN_RESULT_DETAIL_TYPE ||
    detail.schemaVersion !== "1.0" ||
    detail.resourceType !== "S3_OBJECT"
  ) {
    throw new ProjectDocumentAwsError("unsupported_event_type");
  }
  if (
    !/^\d{12}$/u.test(config.accountId) ||
    parsed.account !== config.accountId ||
    parsed.region !== config.region
  ) {
    throw new ProjectDocumentAwsError("event_identity_mismatch");
  }
  if (
    !Array.isArray(parsed.resources) ||
    !parsed.resources.includes(config.protectionPlanArn)
  ) {
    throw new ProjectDocumentAwsError("event_identity_mismatch");
  }
  const scanStatus = requireString(
    detail.scanStatus,
    32,
    "invalid_event_shape"
  );
  const scanResultStatus = requireString(
    resultDetails.scanResultStatus,
    64,
    "invalid_event_shape"
  );
  const candidateVerdict = parseStatusPair(scanStatus, scanResultStatus);
  if (
    s3Object.bucketName !== config.bucket ||
    typeof s3Object.eTag !== "string" ||
    s3Object.eTag.length > 256
  ) {
    throw new ProjectDocumentAwsError("event_identity_mismatch");
  }
  const objectKey = validateProjectDocumentObjectKey(s3Object.objectKey);
  const objectVersionId = validateObjectVersionId(s3Object.versionId);
  const resources = parsed.resources;
  if (
    resources.some(
      (resource) =>
        typeof resource !== "string" ||
        resource.length > MAX_STRING_LENGTH ||
        resource.trim() !== resource
    )
  ) {
    throw new ProjectDocumentAwsError("invalid_event_shape");
  }

  return Object.freeze({
    trust: "untrusted_event_payload" as const,
    eventId,
    occurredAt: new Date(occurredAt).toISOString(),
    fingerprint: fingerprint(parsed),
    accountId: parsed.account as string,
    region: parsed.region as string,
    protectionPlanArn: config.protectionPlanArn,
    scanStatus: scanStatus as UntrustedGuardDutyScanEvent["scanStatus"],
    scanResultStatus:
      scanResultStatus as UntrustedGuardDutyScanEvent["scanResultStatus"],
    candidateVerdict,
    bucket: config.bucket,
    objectKey,
    objectVersionId,
  });
}
