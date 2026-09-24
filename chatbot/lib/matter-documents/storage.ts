import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { MatterDocumentStorage } from "./types";
import { MAX_MATTER_DOCUMENT_BYTES } from "./validation";

const MAX_STORAGE_READ_BYTES = MAX_MATTER_DOCUMENT_BYTES;

function configuredBucket() {
  const bucket = process.env.MATTER_DOCUMENTS_S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error("MATTER_DOCUMENTS_S3_BUCKET is not configured");
  }
  return bucket;
}

function configuredClient() {
  const region = process.env.AWS_REGION?.trim();
  if (!region) {
    throw new Error("AWS_REGION is not configured");
  }
  return new S3Client({ region });
}

async function readBodyBounded(body: unknown): Promise<Uint8Array> {
  if (!body || typeof body !== "object" || !(Symbol.asyncIterator in body)) {
    throw new Error("S3 returned an invalid object body");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const item of body as AsyncIterable<Uint8Array>) {
    const chunk = item instanceof Uint8Array ? item : new Uint8Array(item);
    total += chunk.byteLength;
    if (total > MAX_STORAGE_READ_BYTES) {
      throw new Error("Stored object exceeds the document size boundary");
    }
    chunks.push(chunk);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function createS3MatterDocumentStorage(): MatterDocumentStorage {
  let client: S3Client | undefined;
  const getClient = () => {
    if (!client) {
      client = configuredClient();
    }
    return client;
  };

  return {
    async put({ key, body, contentType, sha256 }) {
      const checksumSha256 = Buffer.from(sha256, "hex").toString("base64");
      await getClient().send(
        new PutObjectCommand({
          Bucket: configuredBucket(),
          Key: key,
          Body: Buffer.from(body),
          ContentLength: body.byteLength,
          ContentType: contentType,
          ChecksumSHA256: checksumSha256,
          ServerSideEncryption: "AES256",
        })
      );
    },
    async get({ key }) {
      const result = await getClient().send(
        new GetObjectCommand({ Bucket: configuredBucket(), Key: key })
      );
      return readBodyBounded(result.Body);
    },
    async delete({ key }) {
      await getClient().send(
        new DeleteObjectCommand({ Bucket: configuredBucket(), Key: key })
      );
    },
  };
}
