import { assertProcessingDeadline } from "./deadline";
import {
  DOCUMENT_PROCESSING_LIMITS,
  VISION_EXTRACTION_INSTRUCTIONS,
} from "./limits";
import { createUnitCollector, finishCollected } from "./text";
import type { DocumentVisionExtractor, ProcessingResult } from "./types";

function imagePixelCount(
  bytes: Uint8Array,
  mediaType: "image/jpeg" | "image/png"
): number {
  if (mediaType === "image/png") {
    if (bytes.length < 24) {
      throw new Error("malformed_document");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return width * height;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return (
        (((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0)) *
        (((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0))
      );
    }
    if (length < 2) {
      break;
    }
    offset += 2 + length;
  }
  throw new Error("malformed_document");
}

export async function extractImage(input: {
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png";
  vision?: DocumentVisionExtractor;
  signal?: AbortSignal;
  deadlineAt?: number;
}): Promise<ProcessingResult> {
  const pixels = imagePixelCount(input.bytes, input.mediaType);
  if (!pixels || pixels > DOCUMENT_PROCESSING_LIMITS.imagePixels) {
    throw new Error("processing_limit_exceeded");
  }
  if (!input.vision) {
    return {
      status: "needs_review",
      method: "vision_fallback",
      units: [],
      truncated: false,
      errorCode: "vision_unavailable",
    };
  }
  assertProcessingDeadline(input);
  let text: string;
  try {
    text = await input.vision.extract({
      bytes: input.bytes,
      mediaType: input.mediaType,
      instructions: VISION_EXTRACTION_INSTRUCTIONS,
      signal: input.signal,
    });
    assertProcessingDeadline(input);
  } catch (error) {
    if (
      input.signal?.aborted ||
      (error instanceof Error && error.message === "processing_timeout")
    ) {
      throw new Error("processing_timeout");
    }
    return {
      status: "needs_review",
      method: "vision_fallback",
      units: [],
      truncated: false,
      errorCode: "vision_unavailable",
    };
  }
  assertProcessingDeadline(input);
  const wasTruncated = text.length > DOCUMENT_PROCESSING_LIMITS.pageTextChars;
  const boundedText = text.slice(0, DOCUMENT_PROCESSING_LIMITS.pageTextChars);
  const collector = createUnitCollector();
  collector.add(
    { kind: "image", imageNumber: 1 },
    boundedText.trim(),
    {
      source: "vision_fallback",
    },
    "vision_fallback"
  );
  const result = finishCollected(collector);
  return {
    ...result,
    method: "vision_fallback",
    status: wasTruncated ? "partial" : result.status,
    truncated: result.truncated || wasTruncated,
    units: result.units.map((unit) => ({
      ...unit,
      extractionMethod: "vision_fallback",
    })),
  };
}
