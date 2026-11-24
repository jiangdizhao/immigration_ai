import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const COURSE_VERIFICATION_ATTESTATION_TTL_MS = 5 * 60 * 1000;

const attestationPayloadSchema = z
  .object({
    schemaVersion: z.literal("phase15.course-verification-attestation.v1"),
    actorUserId: z.string().min(1).max(128),
    projectId: z.string().uuid(),
    chatId: z.string().uuid(),
    assistantMessageId: z.string().uuid(),
    candidateId: z.string().uuid(),
    fieldKey: z.enum(["qualification", "campus_location", "course_code"]),
    value: z.string().min(1).max(500),
    sourceId: z.string().uuid(),
    requestedSourceId: z.string().uuid(),
    sourceUrl: z.string().url().max(2048),
    sourceTitle: z.string().min(1).max(240),
    manifestId: z.string().min(1).max(128),
    observedAt: z.string().datetime(),
    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    locator: z.string().min(1).max(512),
    expiresAt: z.number().int().positive().safe(),
  })
  .strict();

export type CourseVerificationAttestationV1 = z.infer<
  typeof attestationPayloadSchema
>;

function signature(encoded: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("phase15-course-verification-attestation-v1\0")
    .update(encoded)
    .digest();
}

export function issueCourseVerificationAttestation(input: {
  value: Omit<CourseVerificationAttestationV1, "schemaVersion" | "expiresAt">;
  secret: string;
  now?: number;
}): string {
  if (!input.secret.trim()) {
    throw new Error("verification_secret_unavailable");
  }
  const now = input.now ?? Date.now();
  const payload = attestationPayloadSchema.parse({
    ...input.value,
    schemaVersion: "phase15.course-verification-attestation.v1",
    expiresAt: now + COURSE_VERIFICATION_ATTESTATION_TTL_MS,
  });
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return `${encoded}.${signature(encoded, input.secret).toString("base64url")}`;
}

export function verifyCourseVerificationAttestation(input: {
  token: string;
  secret: string;
  actorUserId: string;
  now?: number;
}): CourseVerificationAttestationV1 | null {
  if (!input.secret.trim() || input.token.length > 5000) {
    return null;
  }
  const [encoded, supplied, ...extra] = input.token.split(".");
  if (!encoded || !supplied || extra.length > 0) {
    return null;
  }
  try {
    const suppliedSignature = Buffer.from(supplied, "base64url");
    const expected = signature(encoded, input.secret);
    if (
      suppliedSignature.length !== expected.length ||
      !timingSafeEqual(suppliedSignature, expected)
    ) {
      return null;
    }
    const parsed = attestationPayloadSchema.safeParse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    );
    const now = input.now ?? Date.now();
    if (
      !parsed.success ||
      parsed.data.actorUserId !== input.actorUserId ||
      parsed.data.expiresAt <= now ||
      parsed.data.expiresAt - now > COURSE_VERIFICATION_ATTESTATION_TTL_MS
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
