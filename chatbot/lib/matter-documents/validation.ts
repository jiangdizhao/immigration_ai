import type { MatterDocumentMimeType } from "./types";

export const MAX_MATTER_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_FILENAME_LENGTH = 255;

const MIME_EXTENSIONS: Record<MatterDocumentMimeType, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

export class MatterDocumentValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MatterDocumentValidationError";
    this.status = status;
  }
}

export function normalizeOriginalFilename(filename: string): string {
  const basename = filename.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const safe = basename
    .replace(/\p{Cc}/gu, "")
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  if (!safe || safe === "." || safe === "..") {
    throw new MatterDocumentValidationError("Choose a valid file name.");
  }
  return safe;
}

function inferMimeType(bytes: Uint8Array): MatterDocumentMimeType | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "application/pdf";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

export function validateMatterDocument(input: {
  bytes: Uint8Array;
  declaredMimeType: string;
  filename: string;
}): { mimeType: MatterDocumentMimeType; originalFilename: string } {
  if (input.bytes.byteLength === 0) {
    throw new MatterDocumentValidationError("The selected file is empty.");
  }
  if (input.bytes.byteLength > MAX_MATTER_DOCUMENT_BYTES) {
    throw new MatterDocumentValidationError(
      "Files must be 25 MiB or smaller.",
      413
    );
  }

  const mimeType = inferMimeType(input.bytes);
  const declaredMimeType = input.declaredMimeType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!mimeType || declaredMimeType !== mimeType) {
    throw new MatterDocumentValidationError(
      "Upload a valid PDF, JPEG, or PNG file."
    );
  }

  const originalFilename = normalizeOriginalFilename(input.filename);
  const extensionSeparator = originalFilename.lastIndexOf(".");
  const extension =
    extensionSeparator > 0
      ? originalFilename.slice(extensionSeparator + 1).toLowerCase()
      : "";
  if (!extension || !MIME_EXTENSIONS[mimeType].includes(extension)) {
    throw new MatterDocumentValidationError(
      "The file name extension must match its file type."
    );
  }

  return { mimeType, originalFilename };
}
