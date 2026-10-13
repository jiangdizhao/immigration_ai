/**
 * Phase 12 Stage 3 D-072 — presentation helpers for source-first publications.
 *
 * A source-first notice shows the authentic official source identity, its title
 * and a bounded slice of the stored official text. Nothing here generates legal
 * content: the excerpt is taken verbatim from the retrieved snapshot and is
 * clearly presented as an official excerpt rather than as analysis.
 */

export const SOURCE_FIRST_EXCERPT_MAX_CHARS = 600;

/**
 * Returns a bounded, whitespace-normalized excerpt of the stored official
 * text, or null when there is not enough usable source text to show one.
 */
export function boundedOfficialExcerpt(
  text: string,
  maxChars: number = SOURCE_FIRST_EXCERPT_MAX_CHARS
): string | null {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length < 40) {
    return null;
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const clipped = normalized.slice(0, maxChars);
  // Prefer a sentence boundary inside the last quarter of the window so the
  // excerpt does not end mid-word or mid-sentence when that is possible.
  const boundary = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("。"),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("? ")
  );
  if (boundary >= Math.floor(maxChars * 0.6)) {
    return clipped.slice(0, boundary + 1).trim();
  }
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim();
}

/**
 * Deterministic display language hint for an official excerpt. It only decides
 * which font/typography hint the UI uses for verbatim official text; it never
 * translates or rewrites content.
 */
export function excerptLanguage(text: string): "zh-CN" | "en" {
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/gu)?.length ?? 0;
  return cjk * 4 >= text.length ? "zh-CN" : "en";
}
