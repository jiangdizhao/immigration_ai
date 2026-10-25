import "server-only";

import { ProjectDocumentAwsError } from "./errors";

/** Matches the immutable key format persisted by the accepted A1.1 repository. */
export const PROJECT_DOCUMENT_S3_PREFIX = "project-document/";

export const PROJECT_DOCUMENT_AWS_ADAPTERS_FLAG =
  "PHASE13_PROJECT_DOCUMENT_AWS_ADAPTERS_ENABLED";

export type ProjectDocumentAwsIdentityConfig = {
  accountId: string;
  region: string;
  bucket: string;
};

const REGION_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)+-\d$/u;
const BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{1,61})[a-z0-9]$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

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

export function validateProjectDocumentAwsIdentityConfig(
  input: unknown
): ProjectDocumentAwsIdentityConfig {
  if (!isRecord(input)) {
    throw new ProjectDocumentAwsError("invalid_configuration");
  }
  const { accountId, region, bucket } = input;
  if (
    typeof accountId !== "string" ||
    !/^\d{12}$/u.test(accountId) ||
    typeof region !== "string" ||
    !REGION_PATTERN.test(region) ||
    typeof bucket !== "string" ||
    !BUCKET_PATTERN.test(bucket) ||
    bucket.includes("..") ||
    bucket.includes(".-") ||
    bucket.includes("-.") ||
    /^[0-9.]+$/u.test(bucket) ||
    bucket.startsWith("xn--") ||
    bucket.endsWith("-s3alias") ||
    bucket.endsWith("--ol-s3")
  ) {
    throw new ProjectDocumentAwsError("invalid_configuration");
  }
  return { accountId, region, bucket };
}

export function validateProjectDocumentObjectKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    value.trim() !== value ||
    value.includes("%") ||
    value.includes("\\") ||
    value.includes("//")
  ) {
    throw new ProjectDocumentAwsError("invalid_object_key");
  }
  const parts = value.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== PROJECT_DOCUMENT_S3_PREFIX.slice(0, -1) ||
    parts.slice(1).some((part) => !UUID_PATTERN.test(part))
  ) {
    throw new ProjectDocumentAwsError("invalid_object_key");
  }
  return value;
}

export function validateObjectVersionId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    value.trim() !== value ||
    value.toLowerCase() === "null" ||
    containsControlCharacters(value)
  ) {
    throw new ProjectDocumentAwsError("missing_version_id");
  }
  return value;
}

export function isProjectDocumentAwsAdapterEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
) {
  return env[PROJECT_DOCUMENT_AWS_ADAPTERS_FLAG] === "true";
}
