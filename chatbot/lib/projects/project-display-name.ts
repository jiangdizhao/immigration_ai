import { ProjectFoundationError } from "@/lib/db/project-foundation-utils";

/**
 * Phase 14 Project naming: ONE server-side normalization/validation rule for every
 * caller (creation, rename, tests).
 *
 * Contract:
 * - `null`/`undefined` mean "no customer-supplied name" (legacy generated label).
 * - Any other value must be a string; surrounding whitespace is trimmed.
 * - The trimmed name must be 1-100 Unicode characters (code points, matching the
 *   varchar(100) column and the table CHECK).
 * - Control characters and line breaks are rejected, including U+2028/U+2029.
 * - Names are stored as plain text and rendered as text; they are never required
 *   to be unique.
 */
export const PROJECT_DISPLAY_NAME_MAX_LENGTH = 100;

const FORBIDDEN_CHARACTERS = /[\u0000-\u001F\u007F\u2028\u2029]/u;

function normalize(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ProjectFoundationError("invalid_request");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (
    Array.from(trimmed).length > PROJECT_DISPLAY_NAME_MAX_LENGTH ||
    FORBIDDEN_CHARACTERS.test(trimmed)
  ) {
    throw new ProjectFoundationError("invalid_request");
  }
  return trimmed;
}

/** Creation: the name is optional, so a blank value stays NULL (legacy label). */
export function normalizeOptionalProjectDisplayName(
  value: unknown
): string | null {
  return normalize(value);
}

/** Rename: an explicit rename always requires a non-empty name. */
export function requireProjectDisplayName(value: unknown): string {
  const name = normalize(value);
  if (name === null) {
    throw new ProjectFoundationError("invalid_request");
  }
  return name;
}
