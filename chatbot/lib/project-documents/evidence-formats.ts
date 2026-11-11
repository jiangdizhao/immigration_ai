import { MATTER_DOCUMENT_MIME } from "@/lib/matter-documents/formats";
import {
  extractCsv,
  extractJson,
  extractTextDocument,
} from "@/lib/matter-documents/processing/text";
import type { ProcessingResult } from "@/lib/matter-documents/processing/types";

/**
 * Phase 14-B: Project Document evidence reuses the Phase 12 native parser core for
 * the prioritized customer formats instead of the previous text/JSON/CSV-only gate.
 *
 * Only native extraction is wired. A scanned/image-only PDF is reported as an
 * incomplete native run (`needs_review`/`vision_required` maps to `partial`) rather
 * than being silently OCR'd, because Project evidence must stay exactly reproducible
 * and provenance-linked. No vision/OCR call is made here.
 */
export type ProjectEvidenceFormat = "text" | "json" | "csv" | "docx" | "pdf";

export type ProjectEvidenceFormatRule = {
  format: ProjectEvidenceFormat;
  maxBytes: number;
};

const MIB = 1024 * 1024;

const RULES: Record<string, ProjectEvidenceFormatRule> = {
  [MATTER_DOCUMENT_MIME.txt]: { format: "text", maxBytes: 2 * MIB },
  [MATTER_DOCUMENT_MIME.markdown]: { format: "text", maxBytes: 2 * MIB },
  [MATTER_DOCUMENT_MIME.json]: { format: "json", maxBytes: 2 * MIB },
  [MATTER_DOCUMENT_MIME.csv]: { format: "csv", maxBytes: 2 * MIB },
  [MATTER_DOCUMENT_MIME.docx]: { format: "docx", maxBytes: 8 * MIB },
  [MATTER_DOCUMENT_MIME.pdf]: { format: "pdf", maxBytes: 8 * MIB },
};

export function projectEvidenceFormat(
  canonicalMime: string
): ProjectEvidenceFormatRule | null {
  return RULES[canonicalMime] ?? null;
}

export function projectEvidenceMaxBytes(canonicalMime: string): number | null {
  return projectEvidenceFormat(canonicalMime)?.maxBytes ?? null;
}

/**
 * Deterministic format dispatch. Returns `null` for a format we deliberately do not
 * process (the caller then records an `unsupported` run); throws only for genuinely
 * malformed or unreadable input.
 */
export async function parseProjectEvidenceDocument(input: {
  bytes: Uint8Array;
  canonicalMime: string;
}): Promise<ProcessingResult | null> {
  const rule = projectEvidenceFormat(input.canonicalMime);
  if (!rule) {
    return null;
  }
  switch (rule.format) {
    case "text":
      return extractTextDocument(input.bytes);
    case "json":
      return extractJson(input.bytes);
    case "csv":
      return extractCsv(input.bytes);
    case "docx": {
      // Loaded on demand: the Project evidence path must not pull the Office/PDF
      // parser dependency tree into every request that only resolves text facts.
      const { extractDocx } = await import(
        "@/lib/matter-documents/processing/office"
      );
      return await extractDocx(input.bytes);
    }
    case "pdf": {
      const { extractPdf } = await import(
        "@/lib/matter-documents/processing/pdf"
      );
      return await extractPdf({ bytes: input.bytes });
    }
    default:
      return null;
  }
}
