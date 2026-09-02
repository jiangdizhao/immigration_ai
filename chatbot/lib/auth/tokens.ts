import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

/** Create an opaque token; only its digest is persisted. */
export function createOpaqueToken() {
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");

  return {
    rawToken,
    tokenHash: hashOpaqueToken(rawToken),
  };
}

export function hashOpaqueToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isPlausibleOpaqueToken(rawToken: unknown): rawToken is string {
  return typeof rawToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(rawToken);
}
