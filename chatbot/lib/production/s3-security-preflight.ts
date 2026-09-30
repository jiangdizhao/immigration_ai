export type S3SecurityState = {
  bucketExists: boolean;
  region: string | null;
  encryption: string | null;
  blockPublicAccess: {
    blockPublicAcls: boolean;
    ignorePublicAcls: boolean;
    blockPublicPolicy: boolean;
    restrictPublicBuckets: boolean;
  } | null;
  policyIsPublic: boolean | null;
};
export function evaluateS3SecurityState(input: {
  expectedRegion: string;
  state: S3SecurityState;
}) {
  const failures: string[] = [];
  if (!input.state.bucketExists) {
    failures.push("bucket_missing");
  }
  if (!input.state.region || input.state.region !== input.expectedRegion) {
    failures.push("region_mismatch");
  }
  if (!input.state.encryption || input.state.encryption !== "AES256") {
    failures.push("encryption_unacceptable");
  }
  const bpa = input.state.blockPublicAccess;
  if (
    !bpa?.blockPublicAcls ||
    !bpa?.ignorePublicAcls ||
    !bpa?.blockPublicPolicy ||
    !bpa?.restrictPublicBuckets
  ) {
    failures.push("block_public_access_incomplete");
  }
  if (input.state.policyIsPublic !== false) {
    failures.push("bucket_policy_public_or_unknown");
  }
  return { ok: failures.length === 0, failures };
}
export async function runS3SecurityPreflight(adapters: {
  expectedRegion: string;
  inspect(): Promise<S3SecurityState>;
}) {
  return evaluateS3SecurityState({
    expectedRegion: adapters.expectedRegion,
    state: await adapters.inspect(),
  });
}
