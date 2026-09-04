// Pure money helpers for VIP monthly pricing. All internal money values are
// integer minor units (cents for AUD); floating-point arithmetic is never used
// to parse or compose amounts.

const PRICE_INPUT_PATTERN = /^\d+(\.\d{1,2})?$/;
const MAX_WHOLE_DIGITS = 15;

/**
 * Convert a decimal price string such as "99", "99.9" or "99.90" into integer
 * minor units (9900, 9990, 9990). Returns null for anything that is not a
 * positive amount with at most two decimal places.
 */
export function parsePriceInputToMinorUnits(input: string): number | null {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!PRICE_INPUT_PATTERN.test(trimmed)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const wholeDigits = wholePart.replace(/^0+(?=\d)/, "");
  if (wholeDigits.length > MAX_WHOLE_DIGITS) {
    return null;
  }

  const fractionMinor = Number.parseInt(`${fractionPart}00`.slice(0, 2), 10);
  const minor = Number.parseInt(wholeDigits, 10) * 100 + fractionMinor;

  if (!Number.isSafeInteger(minor) || minor <= 0) {
    return null;
  }

  return minor;
}

/** Format integer minor units as an AUD display string, e.g. 9900 -> "A$99.00". */
export function formatMinorAmountAsAud(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    throw new Error("Amount must be a positive integer in minor units.");
  }

  const whole = Math.floor(minor / 100);
  const fraction = String(minor % 100).padStart(2, "0");
  return `A$${whole}.${fraction}`;
}
