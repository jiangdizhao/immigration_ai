import Papa from "papaparse";
import { DOCUMENT_PROCESSING_LIMITS, ProcessingLimitError } from "./limits";
import type { ProcessingResult, SourceLocator } from "./types";

export function createUnitCollector() {
  const units: ProcessingResult["units"] = [];
  let totalText = 0;
  let truncated = false;
  return {
    units,
    get truncated() {
      return truncated;
    },
    add(
      locator: SourceLocator,
      text: string,
      provenance: Record<string, string | number | boolean | null> = {},
      extractionMethod: "native" | "vision_fallback" = "native"
    ) {
      if (!text || truncated) {
        return;
      }
      if (
        units.length >= DOCUMENT_PROCESSING_LIMITS.maxUnits ||
        totalText + text.length > DOCUMENT_PROCESSING_LIMITS.totalTextChars
      ) {
        truncated = true;
        return;
      }
      if (text.length > DOCUMENT_PROCESSING_LIMITS.unitTextChars) {
        throw new ProcessingLimitError();
      }
      totalText += text.length;
      units.push({
        locator,
        extractedText: text,
        extractionMethod,
        provenance,
      });
    },
  };
}

export function finishCollected(
  collector: ReturnType<typeof createUnitCollector>,
  partial = false
): ProcessingResult {
  return {
    status: partial || collector.truncated ? "partial" : "complete",
    method: "native",
    units: collector.units,
    truncated: collector.truncated,
  };
}

function decodeUtf8(bytes: Uint8Array, maxBytes: number): string {
  if (bytes.byteLength > maxBytes) {
    throw new ProcessingLimitError();
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("malformed_document");
  }
}

export function extractTextDocument(bytes: Uint8Array): ProcessingResult {
  const text = decodeUtf8(bytes, DOCUMENT_PROCESSING_LIMITS.textBytes);
  const collector = createUnitCollector();
  const lines = text.split(/\r\n|\n|\r/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line) {
      continue;
    }
    for (
      let offset = 0;
      offset < line.length;
      offset += DOCUMENT_PROCESSING_LIMITS.unitTextChars
    ) {
      collector.add(
        { kind: "lines", lineStart: index + 1, lineEnd: index + 1 },
        line.slice(offset, offset + DOCUMENT_PROCESSING_LIMITS.unitTextChars),
        {
          linePart:
            Math.floor(offset / DOCUMENT_PROCESSING_LIMITS.unitTextChars) + 1,
        }
      );
    }
    if (collector.truncated) {
      break;
    }
  }
  return finishCollected(collector);
}

export function extractJson(bytes: Uint8Array): ProcessingResult {
  const text = decodeUtf8(bytes, DOCUMENT_PROCESSING_LIMITS.jsonBytes);
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error("malformed_document");
  }
  const collector = createUnitCollector();
  let visited = 0;
  const pending: Array<{ value: unknown; path: string; depth: number }> = [
    { value: root, path: "", depth: 0 },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      break;
    }
    visited += 1;
    if (visited > DOCUMENT_PROCESSING_LIMITS.jsonNodes || current.depth > 100) {
      throw new ProcessingLimitError();
    }
    if (current.value !== null && typeof current.value === "object") {
      const entries = Array.isArray(current.value)
        ? current.value.map((item, index) => [String(index), item] as const)
        : Object.entries(current.value as Record<string, unknown>);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (!entry) {
          continue;
        }
        const [key, child] = entry;
        pending.push({
          value: child,
          path: `${current.path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
          depth: current.depth + 1,
        });
      }
      continue;
    }
    const display = `${current.path || "/"}: ${JSON.stringify(current.value)}`;
    for (
      let offset = 0;
      offset < display.length;
      offset += DOCUMENT_PROCESSING_LIMITS.unitTextChars
    ) {
      collector.add(
        { kind: "json_path", path: current.path || "/" },
        display.slice(offset, offset + DOCUMENT_PROCESSING_LIMITS.unitTextChars)
      );
    }
  }
  return finishCollected(collector);
}

export function extractCsv(bytes: Uint8Array): ProcessingResult {
  const text = decodeUtf8(bytes, DOCUMENT_PROCESSING_LIMITS.textBytes);
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    worker: false,
  });
  if (parsed.errors.length > 0) {
    throw new Error("malformed_document");
  }
  if (parsed.data.length > DOCUMENT_PROCESSING_LIMITS.csvRows) {
    throw new ProcessingLimitError();
  }
  const collector = createUnitCollector();
  const rows = parsed.data;
  for (let index = 0; index < rows.length; index += 40) {
    const chunk = rows
      .slice(index, index + 40)
      .map((row) => row.map((cell) => cell ?? ""));
    collector.add(
      { kind: "rows", rowStart: index + 1, rowEnd: index + chunk.length },
      JSON.stringify(chunk)
    );
    if (collector.truncated) {
      break;
    }
  }
  return finishCollected(collector);
}
