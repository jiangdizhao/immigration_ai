import { createHash } from "node:crypto";

/**
 * Immutable message identity (Phase 12 Stage 1 R2).
 *
 * Both the durable turn ledger and the database finalization transaction must
 * agree on exactly which stored row counts as "the same message". They share
 * this one implementation so idempotent replay and content-collision protection
 * cannot drift between the two layers.
 */

export type ImmutableMessageIdentity = {
  id: string;
  chatId: string;
  role: string;
  parts: unknown;
  attachments?: unknown;
};

/**
 * Canonical content fingerprint for immutable message identity. Message rows are
 * never compared loosely: an id collision is only an idempotent retry when the
 * stored row is the same message with the same content.
 */
export function partsFingerprint(parts: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(parts), "utf8")
    .digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

/**
 * True only when the stored row is the same immutable message as the write that
 * is being attempted: same chat, same role, same canonical parts and no
 * attachments added by another surface.
 */
export function matchesImmutableMessage(
  existing: ImmutableMessageIdentity,
  input: { chatId: string; role: string; parts: unknown }
): boolean {
  return (
    existing.chatId === input.chatId &&
    existing.role === input.role &&
    partsFingerprint(existing.parts) === partsFingerprint(input.parts) &&
    partsFingerprint(existing.attachments ?? []) === partsFingerprint([])
  );
}

/**
 * Server-controlled, stable assistant message identity. The id is derived from
 * the durable turn, so every retry of the same turn targets the same row and
 * idempotency cannot fork into duplicate assistant messages.
 */
export function deterministicMessageId(scope: string): string {
  const digest = createHash("sha256").update(scope, "utf8").digest("hex");
  const hex = digest.slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const joined = hex.join("");
  return [
    joined.slice(0, 8),
    joined.slice(8, 12),
    joined.slice(12, 16),
    joined.slice(16, 20),
    joined.slice(20, 32),
  ].join("-");
}
