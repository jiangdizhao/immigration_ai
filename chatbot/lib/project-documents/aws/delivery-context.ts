import "server-only";

import { createHash } from "node:crypto";
import { ProjectDocumentAwsError } from "./errors";

declare const trustedScanDeliveryContextBrand: unique symbol;

/** Runtime opaque capability. A TypeScript cast alone cannot create one. */
export type TrustedScanDeliveryContext = object & {
  readonly [trustedScanDeliveryContextBrand]: true;
};

export interface ScanDeliveryAuthenticatorPort {
  /**
   * Implemented only by a future authenticated queue transport. It must verify
   * queue/account/rule/producer identity independently of EventBridge JSON.
   */
  authenticate(input: {
    rawBodySha256: string;
    transportContext: unknown;
  }): Promise<boolean>;
}

const authenticatedContexts = new WeakMap<object, string>();
const MAX_DELIVERY_BODY_BYTES = 64 * 1024;

function isBoundedBody(rawBody: string | Uint8Array) {
  return typeof rawBody === "string"
    ? Buffer.byteLength(rawBody, "utf8") <= MAX_DELIVERY_BODY_BYTES
    : rawBody.byteLength <= MAX_DELIVERY_BODY_BYTES;
}

function rawBodySha256(rawBody: string | Uint8Array) {
  const bytes =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Mints an in-process capability only after the injected transport verifier
 * accepts its independently supplied context. A1.2-A supplies no production
 * verifier or queue consumer.
 */
export async function authenticateScanDeliveryContext(input: {
  rawBody: string | Uint8Array;
  transportContext: unknown;
  authenticator: ScanDeliveryAuthenticatorPort;
}): Promise<TrustedScanDeliveryContext> {
  if (
    typeof input.rawBody !== "string" &&
    !(input.rawBody instanceof Uint8Array)
  ) {
    throw new ProjectDocumentAwsError("delivery_context_required");
  }
  if (!isBoundedBody(input.rawBody)) {
    throw new ProjectDocumentAwsError("event_too_large");
  }
  const bodyHash = rawBodySha256(input.rawBody);
  let authenticated = false;
  try {
    authenticated = await input.authenticator.authenticate({
      rawBodySha256: bodyHash,
      transportContext: input.transportContext,
    });
  } catch {
    throw new ProjectDocumentAwsError("delivery_untrusted");
  }
  if (authenticated !== true) {
    throw new ProjectDocumentAwsError("delivery_untrusted");
  }
  const context = Object.freeze(
    Object.create(null)
  ) as TrustedScanDeliveryContext;
  authenticatedContexts.set(context, bodyHash);
  return context;
}

export function isTrustedScanDeliveryContextForBody(
  context: unknown,
  rawBody: string | Uint8Array
): context is TrustedScanDeliveryContext {
  if (typeof rawBody !== "string" && !(rawBody instanceof Uint8Array)) {
    return false;
  }
  if (!isBoundedBody(rawBody)) {
    return false;
  }
  if (typeof context !== "object" || context === null) {
    return false;
  }
  return authenticatedContexts.get(context) === rawBodySha256(rawBody);
}
