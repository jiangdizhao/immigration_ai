import "server-only";

import { createHash } from "node:crypto";
import {
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  MATTER_DOCUMENT_MIME_TYPES,
  MAX_MATTER_DOCUMENT_BYTES,
} from "@/lib/matter-documents/formats";
import type { ProjectDocumentObjectIdentity } from "../types";
import {
  isProjectDocumentAwsAdapterEnabled,
  type ProjectDocumentAwsIdentityConfig,
  validateObjectVersionId,
  validateProjectDocumentAwsIdentityConfig,
  validateProjectDocumentObjectKey,
} from "./config";
import { ProjectDocumentAwsError } from "./errors";

export type ProjectDocumentS3Command =
  | GetBucketVersioningCommand
  | PutObjectCommand
  | HeadObjectCommand
  | GetObjectCommand;

/** A narrow injected AWS SDK command sender. This module never creates S3Client. */
export interface ProjectDocumentS3Client {
  region: string;
  send(command: ProjectDocumentS3Command): Promise<unknown>;
}

export type ProjectDocumentS3PutInput = {
  key: string;
  bytes: Uint8Array;
  expectedSha256: string;
  contentType: string;
};

export type ProjectDocumentS3ExactVersionInput = {
  key: string;
  objectVersionId: string;
  expectedSha256: string;
  expectedByteSize: number;
};

export type VerifiedProjectDocumentObjectRead = {
  identity: ProjectDocumentObjectIdentity;
  bytes: Uint8Array;
};

export interface ProjectDocumentS3ObjectStore {
  putNew(
    input: ProjectDocumentS3PutInput
  ): Promise<ProjectDocumentObjectIdentity>;
  statIdentity(
    input: ProjectDocumentS3ExactVersionInput
  ): Promise<ProjectDocumentObjectIdentity>;
  readVersion(
    input: ProjectDocumentS3ExactVersionInput
  ): Promise<VerifiedProjectDocumentObjectRead>;
}

type S3ErrorDetails = {
  name?: string;
  code?: string;
  status?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorDetails(error: unknown): S3ErrorDetails {
  if (!isRecord(error)) {
    return {};
  }
  const metadata = isRecord(error.$metadata) ? error.$metadata : undefined;
  return {
    name: typeof error.name === "string" ? error.name : undefined,
    code: typeof error.Code === "string" ? error.Code : undefined,
    status:
      typeof metadata?.httpStatusCode === "number"
        ? metadata.httpStatusCode
        : undefined,
  };
}

function isHexSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function checksumBase64(hex: string) {
  return Buffer.from(hex, "hex").toString("base64");
}

function requireRecord(
  value: unknown,
  writeMayHaveSucceeded = false
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ProjectDocumentAwsError("invalid_s3_response", {
      writeMayHaveSucceeded,
    });
  }
  return value;
}

function mapS3Error(error: unknown, operation: "put" | "read"): never {
  const details = errorDetails(error);
  const name = details.name ?? details.code;
  if (
    operation === "put" &&
    (name === "PreconditionFailed" ||
      name === "ConditionalRequestConflict" ||
      details.status === 409 ||
      details.status === 412)
  ) {
    throw new ProjectDocumentAwsError("write_conflict");
  }
  if (
    name === "NoSuchVersion" ||
    name === "NoSuchKey" ||
    name === "NotFound" ||
    details.status === 404
  ) {
    throw new ProjectDocumentAwsError("object_version_not_found");
  }
  if (
    name === "BadDigest" ||
    name === "InvalidDigest" ||
    name === "ChecksumMismatch"
  ) {
    throw new ProjectDocumentAwsError("checksum_mismatch", {
      writeMayHaveSucceeded: operation === "put",
    });
  }
  if (
    name === "PermanentRedirect" ||
    name === "AuthorizationHeaderMalformed" ||
    name === "IncorrectEndpoint" ||
    details.status === 301 ||
    details.status === 307
  ) {
    throw new ProjectDocumentAwsError("region_mismatch");
  }
  if (
    operation === "put" &&
    (details.status === undefined || details.status >= 500)
  ) {
    throw new ProjectDocumentAwsError("write_ambiguous", {
      writeMayHaveSucceeded: true,
    });
  }
  throw new ProjectDocumentAwsError("storage_unavailable", {
    writeMayHaveSucceeded: operation === "put",
  });
}

function assertExpectedIdentity(input: ProjectDocumentS3ExactVersionInput) {
  validateProjectDocumentObjectKey(input.key);
  validateObjectVersionId(input.objectVersionId);
  if (
    !isHexSha256(input.expectedSha256) ||
    !Number.isSafeInteger(input.expectedByteSize) ||
    input.expectedByteSize < 1 ||
    input.expectedByteSize > MAX_MATTER_DOCUMENT_BYTES
  ) {
    throw new ProjectDocumentAwsError("invalid_object_identity");
  }
}

function assertReturnedVersionId(
  value: unknown,
  writeMayHaveSucceeded = false
) {
  try {
    return validateObjectVersionId(value);
  } catch {
    throw new ProjectDocumentAwsError("missing_version_id", {
      writeMayHaveSucceeded,
    });
  }
}

function assertEncryption(value: unknown, writeMayHaveSucceeded = false) {
  if (value !== "AES256") {
    throw new ProjectDocumentAwsError("encryption_mismatch", {
      writeMayHaveSucceeded,
    });
  }
}

function assertChecksum(value: unknown, expectedSha256: string) {
  if (typeof value !== "string") {
    throw new ProjectDocumentAwsError("checksum_unverified", {
      writeMayHaveSucceeded: true,
    });
  }
  if (value !== checksumBase64(expectedSha256)) {
    throw new ProjectDocumentAwsError("checksum_mismatch", {
      writeMayHaveSucceeded: true,
    });
  }
}

function assertLength(value: unknown, expectedByteSize: number) {
  if (value !== expectedByteSize) {
    throw new ProjectDocumentAwsError("object_size_mismatch");
  }
}

function hasAsyncIterator(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === "function"
  );
}

function abortBody(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "destroy" in body &&
    typeof body.destroy === "function"
  ) {
    body.destroy();
  }
}

async function readBodyBounded(body: unknown, maxBytes: number) {
  if (body instanceof Uint8Array) {
    if (body.byteLength > maxBytes) {
      throw new ProjectDocumentAwsError("read_too_large");
    }
    return Buffer.from(body);
  }
  if (!hasAsyncIterator(body)) {
    throw new ProjectDocumentAwsError("invalid_s3_response");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of body) {
      if (!(chunk instanceof Uint8Array)) {
        abortBody(body);
        throw new ProjectDocumentAwsError("invalid_s3_response");
      }
      total += chunk.byteLength;
      if (total > maxBytes) {
        abortBody(body);
        throw new ProjectDocumentAwsError("read_too_large");
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    if (error instanceof ProjectDocumentAwsError) {
      throw error;
    }
    throw new ProjectDocumentAwsError("storage_unavailable");
  }
  return Buffer.concat(chunks, total);
}

export function createProjectDocumentS3ObjectStore(input: {
  client: ProjectDocumentS3Client;
  config: ProjectDocumentAwsIdentityConfig;
  env?: Readonly<Record<string, string | undefined>>;
}): ProjectDocumentS3ObjectStore {
  if (!isProjectDocumentAwsAdapterEnabled(input.env)) {
    throw new ProjectDocumentAwsError("adapter_disabled");
  }
  const config = validateProjectDocumentAwsIdentityConfig(input.config);
  if (input.client.region !== config.region) {
    throw new ProjectDocumentAwsError("client_region_mismatch");
  }

  const ensureBucketVersioning = async () => {
    let response: unknown;
    try {
      response = await input.client.send(
        new GetBucketVersioningCommand({
          Bucket: config.bucket,
          ExpectedBucketOwner: config.accountId,
        })
      );
    } catch (error) {
      mapS3Error(error, "read");
    }
    if (!isRecord(response) || response.Status !== "Enabled") {
      throw new ProjectDocumentAwsError("bucket_versioning_unavailable");
    }
  };

  const verifyHead = async (expected: ProjectDocumentS3ExactVersionInput) => {
    assertExpectedIdentity(expected);
    let response: unknown;
    try {
      response = await input.client.send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: expected.key,
          VersionId: expected.objectVersionId,
          ExpectedBucketOwner: config.accountId,
          ChecksumMode: "ENABLED",
        })
      );
    } catch (error) {
      mapS3Error(error, "read");
    }
    const head = requireRecord(response);
    if (assertReturnedVersionId(head.VersionId) !== expected.objectVersionId) {
      throw new ProjectDocumentAwsError("version_identity_mismatch");
    }
    assertLength(head.ContentLength, expected.expectedByteSize);
    if (
      typeof head.ChecksumSHA256 === "string" &&
      head.ChecksumSHA256 !== checksumBase64(expected.expectedSha256)
    ) {
      throw new ProjectDocumentAwsError("checksum_mismatch");
    }
    if (head.ServerSideEncryption !== "AES256") {
      throw new ProjectDocumentAwsError("encryption_mismatch");
    }
    return head;
  };

  const readExactVersion = async (
    expected: ProjectDocumentS3ExactVersionInput
  ): Promise<VerifiedProjectDocumentObjectRead> => {
    await verifyHead(expected);
    let response: unknown;
    try {
      response = await input.client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: expected.key,
          VersionId: expected.objectVersionId,
          ExpectedBucketOwner: config.accountId,
          ChecksumMode: "ENABLED",
        })
      );
    } catch (error) {
      mapS3Error(error, "read");
    }
    const object = requireRecord(response);
    let returnedVersionId: string;
    try {
      returnedVersionId = assertReturnedVersionId(object.VersionId);
      if (returnedVersionId !== expected.objectVersionId) {
        throw new ProjectDocumentAwsError("version_identity_mismatch");
      }
      assertLength(object.ContentLength, expected.expectedByteSize);
      assertEncryption(object.ServerSideEncryption);
    } catch (error) {
      abortBody(object.Body);
      throw error;
    }
    const bytes = await readBodyBounded(
      object.Body,
      Math.min(MAX_MATTER_DOCUMENT_BYTES, expected.expectedByteSize)
    );
    if (bytes.byteLength !== expected.expectedByteSize) {
      throw new ProjectDocumentAwsError("object_size_mismatch");
    }
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== expected.expectedSha256) {
      throw new ProjectDocumentAwsError("checksum_mismatch");
    }
    if (
      typeof object.ChecksumSHA256 === "string" &&
      object.ChecksumSHA256 !== checksumBase64(actualSha256)
    ) {
      throw new ProjectDocumentAwsError("checksum_mismatch");
    }
    return {
      identity: {
        key: expected.key,
        objectVersionId: expected.objectVersionId,
        sha256: actualSha256,
        byteSize: bytes.byteLength,
      },
      bytes,
    };
  };

  return {
    async putNew(putInput) {
      const key = validateProjectDocumentObjectKey(putInput.key);
      if (
        !(putInput.bytes instanceof Uint8Array) ||
        putInput.bytes.byteLength < 1 ||
        putInput.bytes.byteLength > MAX_MATTER_DOCUMENT_BYTES
      ) {
        throw new ProjectDocumentAwsError("payload_too_large");
      }
      if (
        !isHexSha256(putInput.expectedSha256) ||
        sha256(putInput.bytes) !== putInput.expectedSha256
      ) {
        throw new ProjectDocumentAwsError("checksum_mismatch");
      }
      if (
        typeof putInput.contentType !== "string" ||
        !MATTER_DOCUMENT_MIME_TYPES.some(
          (mime) => mime === putInput.contentType
        )
      ) {
        throw new ProjectDocumentAwsError("invalid_content_type");
      }
      await ensureBucketVersioning();
      const body = Buffer.from(putInput.bytes);
      let response: unknown;
      try {
        response = await input.client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: body,
            ContentLength: body.byteLength,
            ContentType: putInput.contentType,
            IfNoneMatch: "*",
            ChecksumAlgorithm: "SHA256",
            ChecksumSHA256: checksumBase64(putInput.expectedSha256),
            ServerSideEncryption: "AES256",
            ExpectedBucketOwner: config.accountId,
          })
        );
      } catch (error) {
        mapS3Error(error, "put");
      }
      const result = requireRecord(response, true);
      const objectVersionId = assertReturnedVersionId(result.VersionId, true);
      assertChecksum(result.ChecksumSHA256, putInput.expectedSha256);
      assertEncryption(result.ServerSideEncryption, true);
      return {
        key,
        objectVersionId,
        sha256: putInput.expectedSha256,
        byteSize: body.byteLength,
      };
    },
    async statIdentity(expected) {
      return (await readExactVersion(expected)).identity;
    },
    readVersion: readExactVersion,
  };
}
