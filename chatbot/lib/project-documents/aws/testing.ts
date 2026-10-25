import { createHash } from "node:crypto";
import {
  authenticateScanDeliveryContext,
  type TrustedScanDeliveryContext,
} from "./delivery-context";
import type { ScanEventFingerprintRegistry } from "./scan-candidate";

function sha256(rawBody: string | Uint8Array) {
  const bytes =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  return createHash("sha256").update(bytes).digest("hex");
}

/** Test-only transport capability; never export this helper from production barrels. */
export function createFakeTrustedScanDeliveryContext(
  expectedRawBody: string | Uint8Array
): Promise<TrustedScanDeliveryContext> {
  const expectedHash = sha256(expectedRawBody);
  return authenticateScanDeliveryContext({
    rawBody: expectedRawBody,
    transportContext: Object.freeze({ kind: "test_only_fake_delivery" }),
    authenticator: {
      authenticate(input) {
        return Promise.resolve(input.rawBodySha256 === expectedHash);
      },
    },
  });
}

/** Process-local fake used to exercise exact replay and conflicting IDs. */
export function createFakeScanEventFingerprintRegistry(): ScanEventFingerprintRegistry {
  const observed = new Map<string, string>();
  return {
    observe({ eventId, fingerprint }) {
      const prior = observed.get(eventId);
      if (prior === undefined) {
        observed.set(eventId, fingerprint);
        return Promise.resolve("new");
      }
      return Promise.resolve(prior === fingerprint ? "duplicate" : "conflict");
    },
  };
}
