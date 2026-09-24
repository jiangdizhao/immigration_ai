import { createHash } from "node:crypto";
import type {
  CustomerDocumentLocator,
  CustomerDocumentManifest,
} from "./ai-evidence-packet";

type PersistedIncludedUnit = {
  ordinal: number;
  locator: CustomerDocumentLocator;
  extractionMethod: string;
  includedTextChars: number;
  textSha256: string;
};

type ExactUnit = {
  ordinal: number;
  locator: CustomerDocumentLocator;
  extractionMethod: string;
  extractedText: string;
};

type ExactRunEvidence = {
  document: { id: string };
  run: { id: string };
  units: ExactUnit[];
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right)
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "__undefined__";
}

function isIncludedUnit(value: unknown): value is PersistedIncludedUnit {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    Number.isInteger(item.ordinal) &&
    (item.ordinal as number) >= 0 &&
    typeof item.includedTextChars === "number" &&
    Number.isInteger(item.includedTextChars) &&
    item.includedTextChars > 0 &&
    item.includedTextChars <= 4000 &&
    typeof item.extractionMethod === "string" &&
    item.extractionMethod.length <= 32 &&
    typeof item.textSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(item.textSha256) &&
    Boolean(item.locator) &&
    typeof item.locator === "object" &&
    !Array.isArray(item.locator)
  );
}

export function reconstructExactLawyerDocumentEvidence(input: {
  manifest: unknown;
  exact: ExactRunEvidence;
  excerptBudget: number;
}): {
  items: Array<{
    ordinal: number;
    locator: CustomerDocumentLocator;
    extractionMethod: string;
    quote: string;
    truncated: boolean;
  }>;
  excerptBudget: number;
} | null {
  if (
    !input.manifest ||
    typeof input.manifest !== "object" ||
    !Number.isInteger(input.excerptBudget) ||
    input.excerptBudget < 0
  ) {
    return null;
  }
  const manifest = input.manifest as Partial<CustomerDocumentManifest>;
  if (
    typeof manifest.documentId !== "string" ||
    typeof manifest.runId !== "string" ||
    manifest.documentId !== input.exact.document.id ||
    manifest.runId !== input.exact.run.id ||
    typeof manifest.truncated !== "boolean" ||
    !Array.isArray(manifest.includedUnits) ||
    !Array.isArray(manifest.includedUnitOrdinals) ||
    !Array.isArray(manifest.locators) ||
    manifest.includedUnits.length === 0 ||
    manifest.includedUnits.length > 8 ||
    manifest.includedUnits.length !== manifest.includedUnitOrdinals.length ||
    manifest.includedUnits.length !== manifest.locators.length ||
    manifest.includedUnits.length !== input.exact.units.length
  ) {
    return null;
  }

  let remaining = input.excerptBudget;
  const items: Array<{
    ordinal: number;
    locator: CustomerDocumentLocator;
    extractionMethod: string;
    quote: string;
    truncated: boolean;
  }> = [];
  for (let index = 0; index < manifest.includedUnits.length; index += 1) {
    const expected = manifest.includedUnits[index];
    const unit = input.exact.units[index];
    if (
      !isIncludedUnit(expected) ||
      !unit ||
      unit.ordinal !== expected.ordinal ||
      manifest.includedUnitOrdinals[index] !== expected.ordinal ||
      canonicalJson(unit.locator) !== canonicalJson(expected.locator) ||
      canonicalJson(manifest.locators?.[index]) !==
        canonicalJson(expected.locator) ||
      unit.extractionMethod !== expected.extractionMethod ||
      typeof unit.extractedText !== "string" ||
      expected.includedTextChars > unit.extractedText.length
    ) {
      return null;
    }
    const aiSuppliedText = unit.extractedText.slice(
      0,
      expected.includedTextChars
    );
    if (
      aiSuppliedText.length !== expected.includedTextChars ||
      createHash("sha256").update(aiSuppliedText, "utf8").digest("hex") !==
        expected.textSha256
    ) {
      return null;
    }
    if (remaining <= 0) {
      continue;
    }
    const quote = aiSuppliedText.slice(0, Math.min(500, remaining));
    remaining -= quote.length;
    items.push({
      ordinal: unit.ordinal,
      locator: unit.locator,
      extractionMethod: unit.extractionMethod,
      quote,
      truncated:
        manifest.truncated ||
        quote.length < aiSuppliedText.length ||
        aiSuppliedText.length < unit.extractedText.length,
    });
  }
  return { items, excerptBudget: remaining };
}
