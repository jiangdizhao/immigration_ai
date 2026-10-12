import {
  GetBucketEncryptionCommand,
  GetBucketLocationCommand,
  GetBucketPolicyStatusCommand,
  GetPublicAccessBlockCommand,
  type GetPublicAccessBlockCommandOutput,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { runS3SecurityPreflight } from "../lib/production/s3-security-preflight";

const bucket = process.env.MATTER_DOCUMENTS_S3_BUCKET?.trim();
const region = process.env.AWS_REGION?.trim();
if (!bucket || !region) {
  console.error("MATTER_DOCUMENTS_S3_BUCKET and AWS_REGION are required.");
  process.exit(2);
}
// Re-bind after the guard so the narrowed string types survive into the async
// entry point below.
const targetBucket: string = bucket;
const targetRegion: string = region;
const client = new S3Client({ region: targetRegion });

/**
 * Wrapped in an async entry point: this package compiles `.ts` scripts to
 * CommonJS, which does not support top-level `await`. The preflight itself stays
 * strictly read-only (HeadBucket/GetBucket* describe calls only).
 */
async function main() {
  const result = await runS3SecurityPreflight({
    expectedRegion: targetRegion,
    async inspect() {
      let bucketExists = false;
      let actualRegion: string | null = null;
      let encryption: string | null = null;
      let blockPublicAccess:
        | GetPublicAccessBlockCommandOutput["PublicAccessBlockConfiguration"]
        | null = null;
      let policyIsPublic: boolean | null = null;
      try {
        await client.send(new HeadBucketCommand({ Bucket: targetBucket }));
        bucketExists = true;
      } catch {
        /* summarized below */
      }
      try {
        const value = await client.send(
          new GetBucketLocationCommand({ Bucket: targetBucket })
        );
        actualRegion =
          value.LocationConstraint === "EU"
            ? "eu-west-1"
            : (value.LocationConstraint ?? "us-east-1");
      } catch {
        /* unknown fails closed */
      }
      try {
        const value = await client.send(
          new GetBucketEncryptionCommand({ Bucket: targetBucket })
        );
        encryption =
          value.ServerSideEncryptionConfiguration?.Rules?.[0]
            ?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm ?? null;
      } catch {
        /* unknown fails closed */
      }
      try {
        const value = await client.send(
          new GetPublicAccessBlockCommand({ Bucket: targetBucket })
        );
        blockPublicAccess = value.PublicAccessBlockConfiguration ?? null;
      } catch {
        /* unknown fails closed */
      }
      try {
        policyIsPublic =
          (
            await client.send(
              new GetBucketPolicyStatusCommand({ Bucket: targetBucket })
            )
          ).PolicyStatus?.IsPublic ?? null;
      } catch (error) {
        const name = (error as { name?: string }).name;
        if (name === "NoSuchBucketPolicy") {
          policyIsPublic = false;
        }
      }
      const bpa = blockPublicAccess;
      return {
        bucketExists,
        region: actualRegion,
        encryption,
        blockPublicAccess: bpa
          ? {
              blockPublicAcls: bpa.BlockPublicAcls === true,
              ignorePublicAcls: bpa.IgnorePublicAcls === true,
              blockPublicPolicy: bpa.BlockPublicPolicy === true,
              restrictPublicBuckets: bpa.RestrictPublicBuckets === true,
            }
          : null,
        policyIsPublic,
      };
    },
  });
  console.log(JSON.stringify({ ok: result.ok, failures: result.failures }));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "s3 preflight failed");
  process.exitCode = 1;
});
